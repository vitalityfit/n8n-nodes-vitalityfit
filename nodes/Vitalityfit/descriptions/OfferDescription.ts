import type { INodeProperties } from 'n8n-workflow';

import { PRODUCT_URL_REGEX } from '../GenericFunctions';

const showForOfferGetMany = {
	resource: ['offer'],
	operation: ['getAll'],
};

export const offerOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['offer'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'Get the cheapest current offers for one product and pack size: shop, price, shipping, stock and shop link',
				action: 'Get many offers for a product',
			},
		],
		default: 'getAll',
	},
];

export const offerFields: INodeProperties[] = [
	{
		displayName: 'Product',
		name: 'product',
		type: 'resourceLocator',
		required: true,
		default: { mode: 'key', value: '' },
		description: "The product, as a 'product_key' from 'Product > Search' or as a product page URL",
		displayOptions: {
			show: showForOfferGetMany,
		},
		modes: [
			{
				displayName: 'By Key',
				name: 'key',
				type: 'string',
				placeholder: 'e.g. ibuprofen-400-mg-apotheke-hilft-filmtabletten-pzn18228867',
			},
			{
				displayName: 'By URL',
				name: 'url',
				type: 'string',
				placeholder:
					'e.g. https://vitality-fit.de/p/ibuprofen-400-mg-apotheke-hilft-filmtabletten-pzn18228867/',
				extractValue: {
					type: 'regex',
					regex: PRODUCT_URL_REGEX,
				},
				validation: [
					{
						type: 'regex',
						properties: {
							regex: `${PRODUCT_URL_REGEX}.*`,
							errorMessage:
								'Not a vitality-fit.de product page URL (https://vitality-fit.de/p/...)',
						},
					},
				],
			},
		],
	},
	{
		displayName: 'Pack Size',
		name: 'packSize',
		type: 'string',
		default: '',
		placeholder: 'e.g. 20 st',
		description:
			"A pack size from the product's 'pack_sizes': its 'identity_key' (e.g. pzn_14190180) when it has one, else its label (e.g. 20 st). Leave empty for the pack size with the most offers.",
		displayOptions: {
			show: showForOfferGetMany,
		},
	},
	{
		displayName:
			'Show the disclosure and, for medicines, the compliance notice together with the prices. Shop links marked affiliate are affiliate links.',
		name: 'complianceNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: showForOfferGetMany,
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: {
			show: showForOfferGetMany,
		},
		options: [
			{
				displayName: 'Return as Single Item',
				name: 'returnAsSingleItem',
				type: 'boolean',
				default: false,
				description:
					"Whether to return the whole answer as one item with an 'offers' array instead of one item per offer",
			},
		],
	},
];
