import { describe, expect, it } from 'vitest';

import {
	PRODUCT_URL_REGEX,
	clampMaxResults,
	formatPackSizes,
	offerItems,
	parseBody,
	parseRetryAfter,
	productItems,
} from '../nodes/Vitalityfit/GenericFunctions';

/** What n8n does with a resource locator's `extractValue` regex: exactly one capture group. */
function extractProductKey(value: string): string | null {
	const match = new RegExp(PRODUCT_URL_REGEX).exec(value);
	if (match === null) return null;
	expect(match).toHaveLength(2);
	return match[1];
}

describe('PRODUCT_URL_REGEX', () => {
	it.each([
		['https://vitality-fit.de/p/ibuprofen-400-mg/', 'ibuprofen-400-mg'],
		['https://www.vitality-fit.de/p/ibuprofen-400-mg', 'ibuprofen-400-mg'],
		['https://vitality-fit.de/p/ibuprofen-400-mg/?ref=x#offers', 'ibuprofen-400-mg'],
		['http://vitality-fit.de/p/abc-pzn01568889/', 'abc-pzn01568889'],
	])('extracts the product key from %s', (url, key) => {
		expect(extractProductKey(url)).toBe(key);
	});

	it.each(['https://example.com/p/abc/', 'https://vitality-fit.de/s/abc/', 'abc'])(
		'does not match %s',
		(url) => {
			expect(extractProductKey(url)).toBeNull();
		},
	);
});

describe('parseRetryAfter', () => {
	it('reads delta seconds, case-insensitively', () => {
		expect(parseRetryAfter({ 'retry-after': '120' })).toBe(120);
		expect(parseRetryAfter({ 'Retry-After': '7' })).toBe(7);
		expect(parseRetryAfter({ 'retry-after': ['30'] })).toBe(30);
	});

	it('reads an HTTP date', () => {
		const now = Date.parse('2026-11-02T10:00:00Z');
		expect(parseRetryAfter({ 'retry-after': 'Mon, 02 Nov 2026 10:02:00 GMT' }, now)).toBe(120);
	});

	it('is undefined without a usable header', () => {
		expect(parseRetryAfter(undefined)).toBeUndefined();
		expect(parseRetryAfter({})).toBeUndefined();
		expect(parseRetryAfter({ 'retry-after': 'soon' })).toBeUndefined();
	});
});

describe('parseBody', () => {
	it('keeps objects, parses JSON text and buffers, keeps other text', () => {
		expect(parseBody({ a: 1 })).toEqual({ a: 1 });
		expect(parseBody('{"a":1}')).toEqual({ a: 1 });
		expect(parseBody(Buffer.from('{"a":1}'))).toEqual({ a: 1 });
		expect(parseBody('<html></html>')).toBe('<html></html>');
		expect(parseBody(undefined)).toBeUndefined();
	});
});

describe('clampMaxResults', () => {
	it('keeps whole numbers from 1 to 10', () => {
		expect(clampMaxResults(1)).toBe(1);
		expect(clampMaxResults(10)).toBe(10);
		expect(clampMaxResults('4')).toBe(4);
		expect(clampMaxResults(11)).toBe(10);
		expect(clampMaxResults(-3)).toBe(1);
		expect(clampMaxResults(undefined)).toBe(5);
	});
});

describe('formatPackSizes', () => {
	it('lists labels with their identity keys', () => {
		expect(
			formatPackSizes([
				{ label: '20 st', identity_key: 'pzn_1' },
				{ label: '50 st', identity_key: null },
				{ label: '', identity_key: 'ean_4' },
				'junk',
			]),
		).toBe('20 st (pzn_1), 50 st, ean_4');
		expect(formatPackSizes(undefined)).toBe('');
	});
});

describe('productItems and offerItems', () => {
	it('ignores answers without arrays', () => {
		expect(productItems({})).toEqual([]);
		expect(offerItems({ product_key: 'k', disclosure: 'd' })).toEqual([
			{ product_key: 'k', disclosure: 'd', message: 'no current offers' },
		]);
	});

	it('keeps offer fields the node does not know yet', () => {
		const items = offerItems({
			product_key: 'k',
			disclosure: 'd',
			offers: [{ shop: 'S', price: 1, new_field: 'x' }],
		});
		expect(items).toEqual([
			{ product_key: 'k', shop: 'S', price: 1, new_field: 'x', disclosure: 'd' },
		]);
	});
});
