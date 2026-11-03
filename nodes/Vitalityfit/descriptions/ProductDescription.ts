import type { INodeProperties } from 'n8n-workflow';

import { DEFAULT_MAX_RESULTS, MAX_RESULTS_LIMIT } from '../GenericFunctions';

const showForProductSearch = {
	resource: ['product'],
	operation: ['search'],
};

export const productOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['product'],
			},
		},
		options: [
			{
				name: 'Search',
				value: 'search',
				description:
					'Find health products by name, PZN or EAN, with product key, pack sizes and cheapest price',
				action: 'Search products',
			},
		],
		default: 'search',
	},
];

export const productFields: INodeProperties[] = [
	{
		displayName: 'Search Term',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. ibuprofen 400',
		description:
			'Product name, PZN or EAN. A PZN or EAN finds the products that have exactly that pack.',
		displayOptions: {
			show: showForProductSearch,
		},
	},
	{
		displayName: 'Limit',
		name: 'maxResults',
		type: 'number',
		default: DEFAULT_MAX_RESULTS,
		typeOptions: {
			minValue: 1,
			maxValue: MAX_RESULTS_LIMIT,
		},
		description: 'Max number of products to return, from 1 to 10. The best match comes first.',
		displayOptions: {
			show: showForProductSearch,
		},
	},
];
