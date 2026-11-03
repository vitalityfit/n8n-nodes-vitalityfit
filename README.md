# n8n-nodes-vitalityfit

An [n8n](https://n8n.io/) community node for the free [Vitalityfit Price API](https://vitality-fit.de/api/#english).
Compare prices of health products (medicines, supplements, cosmetics) from about 57 German online shops and
pharmacies: look a product up by name, PZN (the German pharmacy product number) or EAN barcode and get its cheapest
current offers with shop, price, shipping cost, stock, delivery time, unit price, shop link and the lowest price of
the last 90 days.

No API key, no account, no credentials. Maintained by [Vitalityfit](https://vitality-fit.de/)
(Xealti UG (haftungsbeschränkt)), the operator of the API.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) ·
[Example workflow](#example-workflow) · [Use as an AI agent tool](#use-as-an-ai-agent-tool) ·
[Limits](#limits) · [Terms in short](#terms-in-short) · [Errors](#errors) · [Compatibility](#compatibility) ·
[Resources](#resources)

## Installation

On a self-hosted n8n (owner or admin role):

1. Go to **Settings > Community Nodes** and select **Install**.
2. Enter `n8n-nodes-vitalityfit` as the npm package name.
3. Confirm that you understand the risks of installing community code and select **Install**.

The node then appears as **Vitalityfit** in the nodes panel. See n8n's
[community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for other
ways to install.

## Operations

### Product > Search

Finds up to 10 products by name, PZN or EAN, best match first. Returns one item per product.

| Parameter | Description |
|---|---|
| Search Term (required) | Product name, PZN or EAN, e.g. `ibuprofen 400`, `01568889` or `4150015688895` |
| Limit | Number of products, 1 to 10 (default 5) |

Each item has `product_key`, `title`, `brand`, `pack_sizes` (each with `label` and `identity_key`),
`cheapest_price` (EUR), `shop_count`, `url` (the product page on vitality-fit.de), `image_url` (when the product
has an image), `matched_pack` (when the search term is a PZN or EAN: the cheapest offer of the pack that holds it)
and, for medicines, `compliance_notice`. No match returns no items.

### Offer > Get Many

The cheapest current offers (up to 10, cheapest first) for one product and pack size. Returns one item per offer.

| Parameter | Description |
|---|---|
| Product (required) | **By Key**: a `product_key` from Product > Search. **By URL**: a product page URL such as `https://vitality-fit.de/p/<product_key>/` |
| Pack Size | A pack size from the product's `pack_sizes`: its `identity_key` (e.g. `pzn_14190180`) when it has one, else its label (e.g. `20 st`). Empty: the pack size with the most offers |
| Options > Return as Single Item | Return the whole answer as one item with an `offers` array instead of one item per offer |

Each item has the offer fields `shop`, `price`, `currency`, `shipping_cost` (EUR, `null` when the shop states
none), `delivery_time`, `in_stock`, `link`, `affiliate` (`true` for affiliate links), `shop_logo_url` and
`unit_price` (`{ value, per }`, EUR per 1 l, 1 kg or 1 piece) where available, plus the product fields
`product_key`, `title`, `pack`, `shop_count`, `low_90d` (lowest price of this pack in the last 90 days),
`data_date`, `url`, `image_url`, `disclosure` and, for medicines, `compliance_notice`. Every item carries
`disclosure` and `compliance_notice`, so each offer can be shown on its own.

Without current offers the node returns one item with the product fields and `message: "no current offers"`.
An unknown pack size stops the node with a message that lists the available pack sizes.

Every request carries the query parameter `client=n8n`.

## Credentials

None. The API is public and read-only.

## Example workflow

Search for a product and list the offers of the best match. Copy the JSON and paste it into an n8n canvas
(Ctrl+V or Cmd+V). The search uses Limit 1, so the workflow makes two requests per run.

```json
{
  "name": "Vitalityfit: cheapest offers",
  "nodes": [
    {
      "parameters": {},
      "id": "6f0d1c8e-1d1a-4a43-9b1e-5d1f0c3e7a01",
      "name": "When clicking 'Execute workflow'",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, 0]
    },
    {
      "parameters": {
        "resource": "product",
        "operation": "search",
        "query": "ibuprofen 400",
        "maxResults": 1
      },
      "id": "6f0d1c8e-1d1a-4a43-9b1e-5d1f0c3e7a02",
      "name": "Search products",
      "type": "n8n-nodes-vitalityfit.vitalityfit",
      "typeVersion": 1,
      "position": [220, 0]
    },
    {
      "parameters": {
        "resource": "offer",
        "operation": "getAll",
        "product": { "__rl": true, "mode": "key", "value": "={{ $json.product_key }}" },
        "packSize": "",
        "options": {}
      },
      "id": "6f0d1c8e-1d1a-4a43-9b1e-5d1f0c3e7a03",
      "name": "Get offers",
      "type": "n8n-nodes-vitalityfit.vitalityfit",
      "typeVersion": 1,
      "position": [440, 0]
    }
  ],
  "connections": {
    "When clicking 'Execute workflow'": {
      "main": [[{ "node": "Search products", "type": "main", "index": 0 }]]
    },
    "Search products": {
      "main": [[{ "node": "Get offers", "type": "main", "index": 0 }]]
    }
  }
}
```

Other ideas: watch a PZN list from a spreadsheet and send a message when `price` drops below a target, or add the
cheapest offer to a product sheet. Mind the [limits](#limits) when you process many items.

## Use as an AI agent tool

The node can be attached to n8n's **AI Agent** as a tool:

1. In the AI Agent node, add a tool and pick **Vitalityfit**. Add it twice: once as **Search products**, once as
   **Get many offers for a product**.
2. In each tool, let the model fill the parameters it should choose: select the "defined automatically by the
   model" button next to **Search Term**, **Product** and **Pack Size**. Keep **Limit** fixed (for example 3).
3. Set **Tool Description** to **Set Manually** and use these texts:

   Search products:

   > Searches health products (medicines, supplements, cosmetics) sold by German online shops and pharmacies by
   > product name, PZN or EAN. Returns product_key, pack_sizes and the cheapest price. Use the product_key to get
   > offers. The API allows 12 requests per 2 minutes, so search once and reuse the results.

   Get many offers for a product:

   > Gets the cheapest current offers for one product (product_key from the search) and an optional pack size
   > (identity_key or label from pack_sizes): shop, price, shipping, stock and shop link. Always show the
   > disclosure and, if present, the compliance_notice together with the prices. Links with affiliate: true are
   > affiliate links. Give no medical advice.

4. In the agent's system message, add: "When you show prices from Vitalityfit, show the disclosure and the
   compliance_notice with them, name the source 'Preise: vitality-fit.de', and give no medical advice."

On self-hosted n8n, if Vitalityfit is missing from the agent's tool list, start n8n with the environment variable
`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` (n8n added this switch for community nodes as tools in 1.79).

## Limits

- 12 requests per 2 minutes per IP address (one per 10 seconds on average). Above that the API answers HTTP 429
  with `Retry-After` (120 seconds), and the node stops with "Rate limit reached ... Retry after 120 seconds".
  The node sends one request per input item, so for many items use a **Loop Over Items** node with a **Wait**
  node. A 429 without `Retry-After` means the service is busy: retry after a few seconds.
- All workflows on one n8n instance share its IP address, and so share the limit.
- Answers are cached for up to 1 hour.

## Terms in short

- Free for personal and non-commercial use. Commercial use (any use by or for a business, or one that earns money)
  only by agreement: service@vitality-fit.de
- Name the source "Preise: vitality-fit.de" (German for "Prices: vitality-fit.de") with a link to
  https://vitality-fit.de/ and keep shop links unchanged.
- Show the `disclosure` together with the prices and, for medicines, the `compliance_notice` (the statutory German
  notice to read the package leaflet and ask a doctor or pharmacist).
- No bulk download, mirroring or resale of the data; respect the limits.
- Prices only, no medical advice. Prices may have changed since; the price in the shop applies. Links with
  `affiliate: true` are affiliate links: vitality-fit.de may earn a commission, and the price does not change for
  the buyer.

Full terms: [vitality-fit.de/api](https://vitality-fit.de/api/#english) (the German version is binding).

## Errors

| Situation | What the node says |
|---|---|
| HTTP 410 | The product key is unknown or was merged into another product: search again by name, PZN or EAN for its current key |
| HTTP 429 | Rate limit reached, with the seconds from `Retry-After` (or "busy, retry after a few seconds") |
| HTTP 400 | The API's message, e.g. an invalid PZN |
| HTTP 503 / 500 | Price data temporarily unavailable / could not process the request: try again later |
| Pack size not found | The pack sizes that exist for the product, e.g. `20 st (pzn_14190180), 40 st (pzn_8109269), 50 st` |

API errors are raised as n8n API errors with the HTTP status. With **Settings > On Error > Continue** (Continue On
Fail), the node outputs `{ "error": "<message>" }` for the failed item and goes on with the next one.

## Compatibility

Built and tested against `n8n-workflow` 2.45 (n8n 2.x). The node uses `NodeConnectionTypes`, so very old n8n 1.x
versions without it are not supported.

## Development

```sh
npm ci
npm run lint       # n8n's linter (strict mode, n8n Cloud rules)
npm run typecheck  # TypeScript, including the tests
npm test           # unit tests with mocked HTTP, no network
npm run build
npm run dev        # starts n8n with the node loaded (needs Docker or Podman)
```

Releases are published by GitHub Actions with npm provenance when a version tag is pushed; see [publish.yml](.github/workflows/publish.yml).

## Resources

- [Vitalityfit](https://vitality-fit.de/), price comparison for health products
- [API documentation](https://vitality-fit.de/api/#english) and
  [OpenAPI description](https://vitality-fit.de/api/v1/openapi.json)
- [MCP server for AI assistants](https://vitality-fit.de/mcp/#english) with the same data
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- Contact: service@vitality-fit.de

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

The code is [MIT](LICENSE) licensed. The price data is subject to the API terms above.
