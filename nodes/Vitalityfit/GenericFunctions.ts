import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const BASE_URL = 'https://vitality-fit.de/api/v1';

/** Sent as `client=n8n` on every request so the API can tell n8n traffic apart. */
export const CLIENT_ID = 'n8n';

export const REQUEST_TIMEOUT_MS = 30000;

export const DEFAULT_MAX_RESULTS = 5;
export const MAX_RESULTS_LIMIT = 10;

export const RATE_LIMIT_TEXT = '12 requests per 2 minutes per IP address';

/**
 * The 'By URL' mode of the 'Product' parameter. n8n takes the single capture group as the product
 * key, e.g. https://vitality-fit.de/p/ibuprofen-400-mg-apotheke-hilft-filmtabletten-pzn18228867/ -> ibuprofen-400-mg-apotheke-hilft-filmtabletten-pzn18228867
 */
export const PRODUCT_URL_REGEX = 'https?://(?:www\\.)?vitality-fit\\.de/p/([^/?#]+)';

export const PACK_SIZE_NOT_FOUND = 'pack size not found';

export interface PackSize {
	label?: string;
	identity_key?: string | null;
}

function isObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The response body as an object when it is JSON, else the raw text (or undefined). */
export function parseBody(body: unknown): IDataObject | string | undefined {
	if (body === undefined || body === null) return undefined;
	if (isObject(body) && !Buffer.isBuffer(body)) return body;
	const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
	try {
		const parsed: unknown = JSON.parse(text);
		return isObject(parsed) ? parsed : text;
	} catch {
		return text;
	}
}

function headerValue(headers: IDataObject | undefined, name: string): string | undefined {
	if (!headers) return undefined;
	const key = Object.keys(headers).find((header) => header.toLowerCase() === name);
	if (key === undefined) return undefined;
	const value = headers[key];
	if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
	return value === undefined || value === null ? undefined : String(value);
}

/** Seconds from a Retry-After header (delta seconds or an HTTP date), else undefined. */
export function parseRetryAfter(
	headers: IDataObject | undefined,
	now: number = Date.now(),
): number | undefined {
	const raw = headerValue(headers, 'retry-after')?.trim();
	if (!raw) return undefined;
	if (/^\d+$/.test(raw)) return Number(raw);
	const date = Date.parse(raw);
	if (Number.isNaN(date)) return undefined;
	return Math.max(0, Math.ceil((date - now) / 1000));
}

function apiErrorDetails(body: IDataObject | string | undefined): {
	code?: string;
	message?: string;
} {
	if (!isObject(body) || !isObject(body.error)) return {};
	const { code, message } = body.error;
	return {
		code: typeof code === 'string' ? code : undefined,
		message: typeof message === 'string' ? message : undefined,
	};
}

/**
 * Maps an HTTP answer that is not a success to a NodeApiError. The message alone tells a user or an
 * AI agent what to do next, since agents often see only the message.
 */
export function buildApiError(
	node: INode,
	statusCode: number,
	headers: IDataObject | undefined,
	body: IDataObject | string | undefined,
	itemIndex: number,
): NodeApiError {
	const { code, message: apiMessage } = apiErrorDetails(body);
	const errorResponse: JsonObject = isObject(body)
		? (body as JsonObject)
		: { message: typeof body === 'string' ? body.slice(0, 500) : `HTTP ${statusCode}` };
	const httpCode = String(statusCode);

	if (statusCode === 410) {
		return new NodeApiError(node, errorResponse, {
			itemIndex,
			httpCode,
			message:
				'The product key is unknown or was merged into another product. Search again by name, PZN or EAN to get its current product key.',
			description:
				"Run 'Product > Search' again and use the 'product_key' it returns in 'Product'. Product keys can change when products are merged.",
			failure: { cause: 'configuration-invalid' },
		});
	}

	if (statusCode === 429) {
		const retryAfter = parseRetryAfter(headers);
		if (retryAfter === undefined) {
			return new NodeApiError(node, errorResponse, {
				itemIndex,
				httpCode,
				message: 'The Vitalityfit API is busy. Retry after a few seconds.',
				description: apiMessage,
				failure: { cause: 'temporarily-unavailable' },
			});
		}
		return new NodeApiError(node, errorResponse, {
			itemIndex,
			httpCode,
			message: `Rate limit reached: the Vitalityfit API allows ${RATE_LIMIT_TEXT}. Retry after ${retryAfter} seconds.`,
			description:
				'To process many items, add a Loop Over Items node with a Wait node so that at most 12 requests run in 2 minutes.',
			failure: { cause: 'rate-limited', retryAfterMs: retryAfter * 1000 },
		});
	}

	if (statusCode === 400) {
		return new NodeApiError(node, errorResponse, {
			itemIndex,
			httpCode,
			message: `The Vitalityfit API rejected the request: ${apiMessage ?? 'invalid parameters'}`,
			description:
				"Check 'Search Term' (a product name, PZN or EAN, at most 200 characters), 'Product' and 'Pack Size'.",
		});
	}

	if (statusCode === 503) {
		return new NodeApiError(node, errorResponse, {
			itemIndex,
			httpCode,
			message: 'Price data is temporarily unavailable. Try again in a few minutes.',
			description: apiMessage,
			failure: { cause: 'temporarily-unavailable' },
		});
	}

	if (statusCode >= 500) {
		return new NodeApiError(node, errorResponse, {
			itemIndex,
			httpCode,
			message: 'The Vitalityfit API could not process the request. Try again later.',
			description: 'If this keeps happening, contact service@vitality-fit.de.',
		});
	}

	return new NodeApiError(node, errorResponse, {
		itemIndex,
		httpCode,
		message: `The Vitalityfit API answered with HTTP ${statusCode}${code ? ` (${code})` : ''}`,
		description: apiMessage ?? 'If this keeps happening, contact service@vitality-fit.de.',
	});
}

/** One GET request to the price API. Returns the JSON body of a success, throws a NodeApiError otherwise. */
export async function vitalityfitApiRequest(
	this: IExecuteFunctions,
	path: string,
	qs: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method: 'GET',
		url: `${BASE_URL}${path}`,
		qs: { ...qs, client: CLIENT_ID },
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: REQUEST_TIMEOUT_MS,
	};

	let response: IN8nHttpFullResponse;
	try {
		response = (await this.helpers.httpRequest(options)) as IN8nHttpFullResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
	}

	const body = parseBody(response.body);
	const statusCode = Number(response.statusCode);
	if (statusCode >= 200 && statusCode < 300) {
		if (isObject(body)) return body;
		throw new NodeApiError(
			this.getNode(),
			{ message: typeof body === 'string' ? body.slice(0, 500) : 'empty body' },
			{
				itemIndex,
				httpCode: String(statusCode),
				message: 'The Vitalityfit API sent an answer that is not JSON. Try again later.',
			},
		);
	}
	throw buildApiError(this.getNode(), statusCode, response.headers, body, itemIndex);
}

/** The product key; a vitality-fit.de product page URL (e.g. from an AI agent) is reduced to its key. */
export function productKeyFrom(value: string): string {
	const match = new RegExp(PRODUCT_URL_REGEX).exec(value);
	return match ? match[1] : value.trim();
}

/** The 'Limit' value as the API expects it: a whole number from 1 to 10. */
export function clampMaxResults(value: unknown): number {
	const number = Number(value);
	if (!Number.isFinite(number)) return DEFAULT_MAX_RESULTS;
	return Math.min(MAX_RESULTS_LIMIT, Math.max(1, Math.trunc(number)));
}

/** One output item per product, best match first. */
export function productItems(body: IDataObject): IDataObject[] {
	const products = body.products;
	if (!Array.isArray(products)) return [];
	return products.filter(isObject);
}

/** Pack-size labels for a message, with the identity key in brackets when the pack has one. */
export function formatPackSizes(packs: unknown): string {
	if (!Array.isArray(packs)) return '';
	return packs
		.filter(isObject)
		.map((pack) => {
			const label = typeof pack.label === 'string' ? pack.label : '';
			const key = typeof pack.identity_key === 'string' ? pack.identity_key : '';
			if (label && key) return `${label} (${key})`;
			return label || key;
		})
		.filter((text) => text !== '')
		.join(', ');
}

/** Throws when the API answered "pack size not found", listing the pack sizes that do exist. */
export function assertPackSizeFound(
	node: INode,
	body: IDataObject,
	packSize: string,
	itemIndex: number,
): void {
	if (body.message !== PACK_SIZE_NOT_FOUND) return;
	const available = formatPackSizes(body.available_packs);
	const hint = available
		? `Available pack sizes: ${available}.`
		: 'This product has no pack sizes with offers right now.';
	throw new NodeOperationError(
		node,
		`Pack size '${packSize}' was not found for this product. ${hint}`,
		{
			itemIndex,
			description:
				"Set 'Pack Size' to one of the labels or keys listed, or leave it empty for the pack size with the most offers.",
		},
	);
}

const PRODUCT_CONTEXT_BEFORE = ['product_key', 'title', 'pack'] as const;
const PRODUCT_CONTEXT_AFTER = [
	'shop_count',
	'low_90d',
	'data_date',
	'url',
	'image_url',
	'disclosure',
	'compliance_notice',
] as const;

function pick(source: IDataObject, keys: readonly string[]): IDataObject {
	const result: IDataObject = {};
	for (const key of keys) {
		if (source[key] !== undefined) result[key] = source[key];
	}
	return result;
}

/**
 * One output item per offer (cheapest first). Every item repeats the product fields, including
 * 'disclosure' and, for medicines, 'compliance_notice', so each item can be shown on its own.
 * Without offers ("no current offers"), one item with the product fields and 'message'.
 */
export function offerItems(body: IDataObject): IDataObject[] {
	const before = pick(body, PRODUCT_CONTEXT_BEFORE);
	const after = pick(body, PRODUCT_CONTEXT_AFTER);
	const offers = Array.isArray(body.offers) ? body.offers.filter(isObject) : [];
	if (offers.length === 0) {
		return [
			{
				...before,
				...after,
				message: typeof body.message === 'string' ? body.message : 'no current offers',
			},
		];
	}
	return offers.map((offer) => ({ ...before, ...offer, ...after }));
}
