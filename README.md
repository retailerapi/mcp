# @retailerapi/mcp

Model Context Protocol server for [retailerapi.com](https://retailerapi.com) — a unified product-data API covering major US retailers. Three tools your AI agent can call directly: product lookups, live offers, and seller profiles.

Works with **Claude Desktop**, **Claude Code**, **Cursor**, and any other MCP-compatible client over stdio.

Covered retailers: Walmart, Amazon, eBay, Target, Best Buy, Lowe's, Home Depot. Set `include_cross_retailer=true` on a product lookup to surface cached cells for every retailer we have for that UPC.

## Quick start

### 1. Get an API key

Sign in at [app.retailerapi.com](https://app.retailerapi.com) and create a key on the [API Keys](https://app.retailerapi.com/app/keys) page. Keys look like `rk_live_…`. Free tier is 1,000 lookups/month — no card.

### 2. Add the server to your MCP client

#### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) and add:

```json
{
  "mcpServers": {
    "retailerapi": {
      "command": "npx",
      "args": ["-y", "@retailerapi/mcp"],
      "env": {
        "RETAILERAPI_KEY": "rk_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The retailerapi tools will appear in the tool picker.

#### Claude Code

```bash
claude mcp add retailerapi npx -y @retailerapi/mcp \
  --env RETAILERAPI_KEY=rk_live_your_key_here
```

#### Cursor

Add to `~/.cursor/mcp.json` (or the project-level `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "retailerapi": {
      "command": "npx",
      "args": ["-y", "@retailerapi/mcp"],
      "env": {
        "RETAILERAPI_KEY": "rk_live_your_key_here"
      }
    }
  }
}
```

#### Generic stdio

```bash
RETAILERAPI_KEY=rk_live_your_key_here npx @retailerapi/mcp
```

The process speaks MCP over stdio (newline-delimited JSON-RPC on stdin/stdout). Logs go to stderr.

## Tools

### `lookup_product`

Resolve any identifier (UPC / EAN / ISBN / GTIN / Amazon ASIN / retailer `item_id`) into a normalized product summary. **Base call (1 token)** returns: title, brand, image, current price, identifiers, weight, dimensions, MSRP, description, categories, full price history, aggregated stats, `retailer_links` (free 'where to find it'), **Bucket-1 facts** (sold_tag, estimated_sales, is_best_seller, pack_count, hazmat), and **computed marketplace fees** (referral_fee_usd, wfs_fee_usd). Fees are FREE in base call — Keepa parity.

Set `include_cross_retailer=true` to add the `cross_retailer` block — a map keyed by retailer slug of cached per-retailer cells (price, in_stock, Bucket-1 fields) for every retailer we have for this UPC (+2 tokens). Read-only over our cache. Set `include_seller_context=true` to add live seller-side state (is_restricted, WFS eligibility) on marketplace retailers (+3 tokens).

To force a fresh scrape of a specific retailer (bypassing cache), call with `retailer=<slug>` and `force_refresh=true`. This is the only way to force fresh data from the API.

Barcode lookups also return a diagnostic `_meta` block with the source retailer for each top-level field (including `weight_lbs_source` and `dimensions_source` — useful when one retailer's catalog is missing physical specs and another retailer backfills them) and a `data_quality_score` (0.0–1.0).

**Package vs assembled.** Retailers that distinguish boxed-for-shipping weight from product weight populate `weight_assembled_lbs` + `weight_package_lbs` (and parallel `dimensions_assembled` + `dimensions_package`). Top-level `weight_lbs` / `dimensions` are the derived "best available" — assembled wins, package fills in, plain weight is the last resort. Retailers exposing only one weight populate `weight_lbs` and leave the explicit pair as `null`.

| Field                    | Type     |
| ------------------------ | -------- |
| `identifier`             | string (required) |
| `identifier_type`        | `"UPC" \| "EAN" \| "ISBN" \| "GTIN" \| "ASIN" \| "item_id"` (optional — auto-detect if omitted) |
| `include_cross_retailer` | boolean (optional — default `false`) — +2 tokens, read-only |
| `include_seller_context` | boolean (optional — default `false`) — +3 tokens |
| `retailer`               | string (optional) — anchor to a specific retailer slug |
| `force_refresh`          | boolean (optional — default `false`) — only valid with `retailer`; bypass cache + force fresh scrape |

**Example prompts:**
- "Look up UPC 045496590161 — what's the brand, price, and Walmart referral fee?"
- "Find UPC 194629116676 across every retailer — who has it cheapest?"
- "What's the WFS fee on this product? Are there any seller restrictions on Amazon?"

### `get_offers`

List current marketplace sellers on a product, including price, in-stock state, and which seller owns the buy box.

| Field     | Type   |
| --------- | ------ |
| `item_id` | string (required) |

**Example prompt:** "Who has the buy box on item 1689065034 and what's the next-cheapest seller?"

### `get_seller`

Marketplace seller profile by `seller_id`: name, total active listings, rating, performance metrics.

| Field       | Type   |
| ----------- | ------ |
| `seller_id` | string (required) |

**Example prompt:** "Tell me about seller F55CDC31AB754BB68FE0B39041159D63."

## Errors

Tool calls return structured JSON errors instead of crashing the agent:

| Status   | Error code        | Meaning                                                              |
| -------- | ----------------- | -------------------------------------------------------------------- |
| 401, 403 | `unauthorized`    | API key invalid or missing scope. Check `RETAILERAPI_KEY`.       |
| 404      | `not_found`       | Product, seller, or item_id not found.                               |
| 429      | `rate_limited`    | Quota or burst limit hit. Includes `retry_after_seconds`.            |
| 5xx      | `upstream_error`  | Backend issue. Retry shortly.                                        |
| —        | `missing_api_key` | `RETAILERAPI_KEY` env var not set. Pointer to docs included.     |

## Environment

| Variable               | Required | Default                          |
| ---------------------- | -------- | -------------------------------- |
| `RETAILERAPI_KEY`  | yes      | —                                |
| `RETAILERAPI_BASE_URL` | no       | `https://api.retailerapi.com/v1` |

## Develop locally

```bash
pnpm install
pnpm --filter @retailerapi/mcp build
RETAILERAPI_KEY=rk_live_… node packages/mcp/dist/index.js
```

The MCP Inspector (`npx @modelcontextprotocol/inspector`) is the easiest way to exercise the tools manually.

## License

MIT
