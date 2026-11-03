import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { BASE_URL } from '../nodes/Vitalityfit/GenericFunctions';
import { Vitalityfit } from '../nodes/Vitalityfit/Vitalityfit.node';
import {
	DISCLOSURE,
	OFFERS_BODY,
	PACK_NOT_FOUND_BODY,
	SEARCH_BODY,
	response,
	run,
	runAndCatch,
} from './helpers';

const SEARCH = { resource: 'product', operation: 'search' };
const OFFERS = { resource: 'offer', operation: 'getAll' };
const KEY = OFFERS_BODY.product_key;

describe('node description', () => {
	const { description } = new Vitalityfit();

	it('is usable as an AI agent tool and needs no credentials', () => {
		expect(description.usableAsTool).toBe(true);
		expect(description.credentials ?? []).toEqual([]);
	});

	it('offers Product > Search and Offer > Get Many', () => {
		const operations = description.properties.filter((property) => property.name === 'operation');
		const pairs = operations.flatMap((property) =>
			(property.options as Array<{ value: string }>).map(
				(option) => `${property.displayOptions?.show?.resource?.[0]}:${option.value}`,
			),
		);
		expect(pairs.sort()).toEqual(['offer:getAll', 'product:search']);
	});
});

describe('Product > Search: request building', () => {
	it('sends q, limit and client=n8n as a GET with full-response error handling', async () => {
		const { httpRequest } = await run({
			params: { ...SEARCH, query: '  ibuprofen 400  ', maxResults: 5 },
			responses: [response(200, SEARCH_BODY)],
		});
		expect(httpRequest).toHaveBeenCalledTimes(1);
		const options = httpRequest.mock.calls[0][0];
		expect(options).toMatchObject({
			method: 'GET',
			url: `${BASE_URL}/products`,
			qs: { q: 'ibuprofen 400', limit: 5, client: 'n8n' },
			headers: { Accept: 'application/json' },
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		});
	});

	it.each([
		[25, 10],
		[0, 1],
		[3.7, 3],
		['not a number', 5],
	])('clamps limit %s to %s', async (maxResults, expected) => {
		const { httpRequest } = await run({
			params: { ...SEARCH, query: '01568889', maxResults },
			responses: [response(200, SEARCH_BODY)],
		});
		expect(httpRequest.mock.calls[0][0].qs).toEqual({
			q: '01568889',
			limit: expected,
			client: 'n8n',
		});
	});

	it('defaults the limit to 5 when the parameter is missing', async () => {
		const { httpRequest } = await run({
			params: { ...SEARCH, query: 'orthomol immun' },
			responses: [response(200, SEARCH_BODY)],
		});
		expect(httpRequest.mock.calls[0][0].qs).toMatchObject({ limit: 5 });
	});

	it('rejects an empty search term without calling the API', async () => {
		const { error, httpRequest } = await runAndCatch({ params: { ...SEARCH, query: '   ' } });
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toContain("'Search Term' is empty");
		expect(httpRequest).not.toHaveBeenCalled();
	});
});

describe('Product > Search: response mapping', () => {
	it('returns one item per product, best match first, paired with the input item', async () => {
		const { output } = await run({
			params: { ...SEARCH, query: 'ibuprofen 400' },
			responses: [response(200, SEARCH_BODY)],
		});
		expect(output).toHaveLength(2);
		expect(output[0]).toEqual({ json: SEARCH_BODY.products[0], pairedItem: { item: 0 } });
		expect(output[1].json.product_key).toBe('ibuhexal-plus-paracetamol-200-mg-500-mg');
	});

	it('returns no items when nothing matches', async () => {
		const { output } = await run({
			params: { ...SEARCH, query: 'xyz' },
			responses: [response(200, { products: [] })],
		});
		expect(output).toEqual([]);
	});

	it('runs one request per input item and pairs each result with its item', async () => {
		const queries = ['ibuprofen', 'aspirin'];
		const { output, httpRequest } = await run({
			params: (itemIndex) => ({ ...SEARCH, query: queries[itemIndex] }),
			items: [{ json: {} }, { json: {} }],
			responses: [
				response(200, { products: [SEARCH_BODY.products[0]] }),
				response(200, { products: [SEARCH_BODY.products[1]] }),
			],
		});
		expect(httpRequest.mock.calls.map((call) => call[0].qs?.q)).toEqual(queries);
		expect(output.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});

	it('accepts a body that arrives as a JSON string', async () => {
		const { output } = await run({
			params: { ...SEARCH, query: 'ibuprofen' },
			responses: [response(200, JSON.stringify(SEARCH_BODY))],
		});
		expect(output).toHaveLength(2);
	});
});

describe('Offer > Get Many: request building', () => {
	it('sends the product key in the path, pack_size and client=n8n', async () => {
		const { httpRequest, getNodeParameter } = await run({
			params: { ...OFFERS, product: KEY, packSize: ' 20 st ' },
			responses: [response(200, OFFERS_BODY)],
		});
		const options = httpRequest.mock.calls[0][0];
		expect(options).toMatchObject({
			method: 'GET',
			url: `${BASE_URL}/products/${KEY}/offers`,
			qs: { pack_size: '20 st', client: 'n8n' },
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		});
		const productCall = getNodeParameter.mock.calls.find((call) => call[0] === 'product');
		expect(productCall?.[3]).toEqual({ extractValue: true });
	});

	it('omits pack_size when it is empty', async () => {
		const { httpRequest } = await run({
			params: { ...OFFERS, product: KEY, packSize: '' },
			responses: [response(200, OFFERS_BODY)],
		});
		expect(httpRequest.mock.calls[0][0].qs).toEqual({ client: 'n8n' });
	});

	it('URL-encodes the product key', async () => {
		const { httpRequest } = await run({
			params: { ...OFFERS, product: 'a/b c?d' },
			responses: [response(200, OFFERS_BODY)],
		});
		expect(httpRequest.mock.calls[0][0].url).toBe(`${BASE_URL}/products/a%2Fb%20c%3Fd/offers`);
	});

	it('reduces a product page URL given as key to the key', async () => {
		const { httpRequest } = await run({
			params: { ...OFFERS, product: `https://vitality-fit.de/p/${KEY}/?ref=chat` },
			responses: [response(200, OFFERS_BODY)],
		});
		expect(httpRequest.mock.calls[0][0].url).toBe(`${BASE_URL}/products/${KEY}/offers`);
	});

	it('rejects an empty product without calling the API', async () => {
		const { error, httpRequest } = await runAndCatch({ params: { ...OFFERS, product: '' } });
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toContain("'Product' is empty");
		expect(httpRequest).not.toHaveBeenCalled();
	});
});

describe('Offer > Get Many: response mapping', () => {
	it('returns one item per offer, each carrying the product fields', async () => {
		const { output } = await run({
			params: { ...OFFERS, product: KEY },
			responses: [response(200, OFFERS_BODY)],
		});
		expect(output).toHaveLength(2);
		expect(output[0].pairedItem).toEqual({ item: 0 });
		expect(output[0].json).toEqual({
			product_key: KEY,
			title: OFFERS_BODY.title,
			pack: '20 st',
			...OFFERS_BODY.offers[0],
			shop_count: 2,
			low_90d: 4.79,
			data_date: '2026-10-05T03:04:16.000Z',
			url: OFFERS_BODY.url,
			image_url: OFFERS_BODY.image_url,
			disclosure: DISCLOSURE,
			compliance_notice: OFFERS_BODY.compliance_notice,
		});
		for (const item of output) {
			expect(item.json.disclosure).toBe(DISCLOSURE);
			expect(item.json.compliance_notice).toBe(OFFERS_BODY.compliance_notice);
		}
		expect(output[1].json).toMatchObject({ shop: 'Example Apotheke', affiliate: false });
	});

	it('leaves out compliance_notice and image_url when the API has none', async () => {
		const body = { ...OFFERS_BODY };
		delete (body as Partial<typeof OFFERS_BODY>).compliance_notice;
		delete (body as Partial<typeof OFFERS_BODY>).image_url;
		const { output } = await run({
			params: { ...OFFERS, product: KEY },
			responses: [response(200, body)],
		});
		expect(output[0].json).not.toHaveProperty('compliance_notice');
		expect(output[0].json).not.toHaveProperty('image_url');
		expect(output[0].json.disclosure).toBe(DISCLOSURE);
	});

	it('returns one item with the message when there are no current offers', async () => {
		const body = {
			...OFFERS_BODY,
			pack: undefined,
			shop_count: 0,
			offers: [],
			low_90d: null,
			message: 'no current offers',
		};
		const { output } = await run({
			params: { ...OFFERS, product: KEY },
			responses: [response(200, body)],
		});
		expect(output).toHaveLength(1);
		expect(output[0].json).toMatchObject({
			product_key: KEY,
			disclosure: DISCLOSURE,
			shop_count: 0,
			message: 'no current offers',
		});
		expect(output[0].json).not.toHaveProperty('shop');
	});

	it('returns the whole answer as one item with "Return as Single Item"', async () => {
		const { output } = await run({
			params: { ...OFFERS, product: KEY, options: { returnAsSingleItem: true } },
			responses: [response(200, OFFERS_BODY)],
		});
		expect(output).toEqual([{ json: OFFERS_BODY, pairedItem: { item: 0 } }]);
	});

	it('lists the available pack sizes when the pack size is unknown', async () => {
		const { error } = await runAndCatch({
			params: { ...OFFERS, product: KEY, packSize: '30 st' },
			responses: [response(200, PACK_NOT_FOUND_BODY)],
		});
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toBe(
			"Pack size '30 st' was not found for this product. Available pack sizes: 20 st (pzn_14190180), 40 st (pzn_8109269), 50 st.",
		);
		expect((error.context as { itemIndex?: number }).itemIndex).toBe(0);
	});

	it('rejects an unknown pack size also with "Return as Single Item"', async () => {
		const { error } = await runAndCatch({
			params: {
				...OFFERS,
				product: KEY,
				packSize: '30 st',
				options: { returnAsSingleItem: true },
			},
			responses: [response(200, PACK_NOT_FOUND_BODY)],
		});
		expect(error.message).toContain('Available pack sizes: 20 st (pzn_14190180)');
	});
});

describe('error mapping', () => {
	const apiError = (code: string, message: string) => ({ error: { code, message } });

	it('maps 410 to "unknown or merged, search again"', async () => {
		const { error } = await runAndCatch({
			params: { ...OFFERS, product: 'gone-key' },
			responses: [response(410, apiError('not_found', 'product not available'))],
		});
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as unknown as NodeApiError).httpCode).toBe('410');
		expect(error.message).toContain('unknown or was merged');
		expect(error.message).toContain('Search again by name, PZN or EAN');
	});

	it('maps 429 with Retry-After to the rate limit and the wait time', async () => {
		const { error } = await runAndCatch({
			params: { ...SEARCH, query: 'ibuprofen' },
			responses: [
				response(
					429,
					apiError(
						'rate_limited',
						'Too many requests: at most 12 per 2 minutes per IP. Retry after 120 seconds.',
					),
					{ 'retry-after': '120' },
				),
			],
		});
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as unknown as NodeApiError).httpCode).toBe('429');
		expect(error.message).toBe(
			'Rate limit reached: the Vitalityfit API allows 12 requests per 2 minutes per IP address. Retry after 120 seconds.',
		);
		expect((error as unknown as NodeApiError).failure).toEqual({
			cause: 'rate-limited',
			retryAfterMs: 120000,
		});
	});

	it('maps 429 without Retry-After to "busy, retry after a few seconds"', async () => {
		const { error } = await runAndCatch({
			params: { ...SEARCH, query: 'ibuprofen' },
			responses: [response(429, apiError('rate_limited', 'busy'))],
		});
		expect(error.message).toBe('The Vitalityfit API is busy. Retry after a few seconds.');
	});

	it('passes the API message through for 400', async () => {
		const { error } = await runAndCatch({
			params: { ...SEARCH, query: '12345678' },
			responses: [response(400, apiError('invalid_argument', 'Invalid PZN: 12345678'))],
		});
		expect((error as unknown as NodeApiError).httpCode).toBe('400');
		expect(error.message).toBe('The Vitalityfit API rejected the request: Invalid PZN: 12345678');
	});

	it('maps 503 to "temporarily unavailable"', async () => {
		const { error } = await runAndCatch({
			params: { ...SEARCH, query: 'ibuprofen' },
			responses: [response(503, apiError('unavailable', 'price data temporarily unavailable'))],
		});
		expect((error as unknown as NodeApiError).httpCode).toBe('503');
		expect(error.message).toContain('temporarily unavailable');
	});

	it('maps 500 to "could not process the request"', async () => {
		const { error } = await runAndCatch({
			params: { ...SEARCH, query: 'ibuprofen' },
			responses: [response(500, apiError('internal', 'Internal error'))],
		});
		expect((error as unknown as NodeApiError).httpCode).toBe('500');
		expect(error.message).toContain('could not process the request');
	});

	it('handles an answer that is not JSON, such as an HTML page', async () => {
		const { error } = await runAndCatch({
			params: { ...SEARCH, query: 'ibuprofen' },
			responses: [
				response(403, '<html><body>Forbidden</body></html>', { 'content-type': 'text/html' }),
			],
		});
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as unknown as NodeApiError).httpCode).toBe('403');
		expect(error.message).toBe('The Vitalityfit API answered with HTTP 403');
	});

	it('wraps a network failure in a NodeApiError with the item index', async () => {
		const { error } = await runAndCatch({
			params: { ...SEARCH, query: 'ibuprofen' },
			responses: [
				Object.assign(new Error('getaddrinfo ENOTFOUND vitality-fit.de'), { code: 'ENOTFOUND' }),
			],
		});
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error.context as { itemIndex?: number }).itemIndex).toBe(0);
	});

	it('wraps an unexpected failure in a NodeOperationError with the item index', async () => {
		const { error } = await runAndCatch({
			params: (itemIndex) => {
				if (itemIndex === 1) throw new Error('parameter could not be read');
				return { ...SEARCH, query: 'ibuprofen' };
			},
			items: [{ json: {} }, { json: {} }],
			responses: [response(200, SEARCH_BODY)],
		});
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toBe('parameter could not be read');
		expect((error.context as { itemIndex?: number }).itemIndex).toBe(1);
	});

	it('with "Continue On Fail", returns the message as an item and goes on', async () => {
		const { output } = await run({
			params: (itemIndex) => ({ ...OFFERS, product: itemIndex === 0 ? 'gone-key' : KEY }),
			items: [{ json: {} }, { json: {} }],
			continueOnFail: true,
			responses: [
				response(410, apiError('not_found', 'product not available')),
				response(200, OFFERS_BODY),
			],
		});
		expect(output[0].pairedItem).toEqual({ item: 0 });
		expect(String(output[0].json.error)).toContain('unknown or was merged');
		expect(output.slice(1).map((item) => item.json.shop)).toEqual(['Aponeo', 'Example Apotheke']);
		expect(output.slice(1).every((item) => (item.pairedItem as { item: number }).item === 1)).toBe(
			true,
		);
	});
});
