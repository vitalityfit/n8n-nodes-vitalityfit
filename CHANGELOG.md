# Changelog

All notable changes to this package are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## 0.1.1

- The package no longer ships the TypeScript build cache (`dist/tsconfig.tsbuildinfo`): 56 kB unpacked instead
  of 165 kB. No change to the node.
- Published through npm trusted publishing (GitHub Actions, no npm token), with provenance.

## 0.1.0

First release.

- Product > Search: find products by name, PZN or EAN (1 to 10 results, default 5).
- Offer > Get Many: the cheapest current offers for one product and pack size, one item per offer, each with the
  product fields, `disclosure` and `compliance_notice`; option "Return as Single Item".
- Product by key or by product page URL; pack size by identity key or label.
- Usable as an AI agent tool.
- Every request carries `client=n8n`.
- Messages for unknown or merged product keys (410), the rate limit (429 with `Retry-After`), unknown pack sizes
  (with the available pack sizes) and API outages; Continue On Fail supported.
