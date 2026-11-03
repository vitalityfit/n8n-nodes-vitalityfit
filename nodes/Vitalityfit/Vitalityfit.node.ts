import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { offerFields, offerOperations } from './descriptions/OfferDescription';
import { productFields, productOperations } from './descriptions/ProductDescription';
import {
	DEFAULT_MAX_RESULTS,
	assertPackSizeFound,
	clampMaxResults,
	offerItems,
	productItems,
	productKeyFrom,
	vitalityfitApiRequest,
} from './GenericFunctions';

function stringParameter(
	context: IExecuteFunctions,
	name: string,
	itemIndex: number,
	options?: { extractValue: boolean },
): string {
	const value = context.getNodeParameter(name, itemIndex, '', options) as unknown;
	return value === undefined || value === null ? '' : String(value).trim();
}

async function searchProducts(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const query = stringParameter(this, 'query', itemIndex);
	if (query === '') {
		throw new NodeOperationError(
			this.getNode(),
			"'Search Term' is empty. Enter a product name, PZN or EAN.",
			{ itemIndex },
		);
	}
	const limit = clampMaxResults(
		this.getNodeParameter('maxResults', itemIndex, DEFAULT_MAX_RESULTS),
	);
	const body = await vitalityfitApiRequest.call(this, '/products', { q: query, limit }, itemIndex);
	return productItems(body);
}

async function getOffers(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const productKey = productKeyFrom(
		stringParameter(this, 'product', itemIndex, { extractValue: true }),
	);
	if (productKey === '') {
		throw new NodeOperationError(
			this.getNode(),
			"'Product' is empty. Use a 'product_key' from 'Product > Search' or a vitality-fit.de product page URL.",
			{ itemIndex },
		);
	}
	const packSize = stringParameter(this, 'packSize', itemIndex);
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const qs: IDataObject = {};
	if (packSize !== '') qs.pack_size = packSize;

	const body = await vitalityfitApiRequest.call(
		this,
		`/products/${encodeURIComponent(productKey)}/offers`,
		qs,
		itemIndex,
	);
	assertPackSizeFound(this.getNode(), body, packSize, itemIndex);

	if (options.returnAsSingleItem === true) return [body];
	return offerItems(body);
}

export class Vitalityfit implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Vitalityfit',
		name: 'vitalityfit',
		icon: { light: 'file:vitalityfit.svg', dark: 'file:vitalityfit.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Compare prices of health products from German online shops and pharmacies by name, PZN or EAN',
		defaults: {
			name: 'Vitalityfit',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Offer',
						value: 'offer',
					},
					{
						name: 'Product',
						value: 'product',
					},
				],
				default: 'product',
			},
			...productOperations,
			...productFields,
			...offerOperations,
			...offerFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				let results: IDataObject[];
				if (resource === 'product' && operation === 'search') {
					results = await searchProducts.call(this, itemIndex);
				} else if (resource === 'offer' && operation === 'getAll') {
					results = await getOffers.call(this, itemIndex);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation '${operation}' is not supported for the resource '${resource}'`,
						{ itemIndex },
					);
				}

				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				// Both constructors return an error of their own class unchanged (its item index is set).
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
