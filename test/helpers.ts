import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
} from 'n8n-workflow';
import { vi } from 'vitest';

import { Vitalityfit } from '../nodes/Vitalityfit/Vitalityfit.node';
import offersBody from './fixtures/offers.json';
import packNotFoundBody from './fixtures/pack-not-found.json';
import searchBody from './fixtures/search.json';

export const NODE: INode = {
	id: 'test-node',
	name: 'Vitalityfit',
	type: 'n8n-nodes-vitalityfit.vitalityfit',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export interface FakeResponse {
	statusCode: number;
	body?: unknown;
	headers?: IDataObject;
}

export function response(
	statusCode: number,
	body?: unknown,
	headers: IDataObject = {},
): FakeResponse {
	return { statusCode, body, headers: { 'content-type': 'application/json', ...headers } };
}

type Params = IDataObject | ((itemIndex: number) => IDataObject);

export interface ContextOptions {
	params: Params;
	responses?: Array<FakeResponse | Error>;
	items?: INodeExecutionData[];
	continueOnFail?: boolean;
}

/** A minimal IExecuteFunctions with a mocked httpRequest that answers from `responses` in order. */
export function createContext({
	params,
	responses = [],
	items,
	continueOnFail = false,
}: ContextOptions) {
	const httpRequest = vi.fn<(options: IHttpRequestOptions) => Promise<FakeResponse>>();
	for (const entry of responses) {
		if (entry instanceof Error) httpRequest.mockRejectedValueOnce(entry);
		else httpRequest.mockResolvedValueOnce(entry);
	}
	const getNodeParameter = vi.fn<
		(name: string, itemIndex: number, fallback?: unknown, options?: IDataObject) => unknown
	>((name, itemIndex, fallback) => {
		const values = typeof params === 'function' ? params(itemIndex) : params;
		return name in values ? values[name] : fallback;
	});
	const context = {
		getInputData: () => items ?? [{ json: {} }],
		getNodeParameter,
		getNode: () => NODE,
		continueOnFail: () => continueOnFail,
		helpers: { httpRequest },
	} as unknown as IExecuteFunctions;
	return { context, httpRequest, getNodeParameter };
}

export async function run(options: ContextOptions) {
	const { context, httpRequest, getNodeParameter } = createContext(options);
	const output = await new Vitalityfit().execute.call(context);
	return { output: output[0], httpRequest, getNodeParameter };
}

/** Runs the node and returns what it threw. Fails the test when it did not throw. */
export async function runAndCatch(options: ContextOptions) {
	const { context, httpRequest } = createContext(options);
	try {
		await new Vitalityfit().execute.call(context);
	} catch (error) {
		return { error: error as Error & IDataObject, httpRequest };
	}
	throw new Error('expected the node to throw');
}

/** Based on live answers of the price API (2026-11-02); the second offer and some values are made up. */
export const SEARCH_BODY = searchBody;
export const OFFERS_BODY = offersBody;
export const PACK_NOT_FOUND_BODY = packNotFoundBody;
export const DISCLOSURE = offersBody.disclosure;
