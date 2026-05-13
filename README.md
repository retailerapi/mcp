# @retailerapi/mcp

Model Context Protocol server for [retailerapi.com](https://retailerapi.com) — a unified product-data API covering major US retailers. Five tools your AI agent can call directly: product lookups, price history, offers, seller profiles, and reviews.

Works with **Claude Desktop**, **Claude Code**, **Cursor**, and any other MCP-compatible client over stdio.

Covered retailers: Walmart (deepest catalog today), Amazon, eBay, Target, Best Buy, Lowe's, Home Depot. Set `include_cross_retailer=true` on a product lookup to fold in cross-retailer pricing from any of these.

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

Resolve any identifier (UPC / EAN / ISBN / GTIN / Amazon ASIN / Walmart `item_id`) into a normalized product summary. Returns `retailer_links` — the list of other retailers (Amazon, eBay, Target, Best Buy, Lowe's, Home Depot) that carry the same product, with a direct URL to each — free for barcode lookups. Set `include_cross_retailer=true` to also pull live price/stock per retailer (+2 tokens).

| Field             | Type     |
| ----------------- | -------- |
| `identifier`      | string (required) |
| `identifier_type` | `"UPC" \| "EAN" \| "ISBN" \| "item_id"` (optional — auto-detect if omitted) |
| `include_cross_retailer` | boolean (optional — default `false`) |

**Example prompts:**
- "Look up UPC 045496590161 and tell me the brand and price."
- "Find UPC 194629116676 across every retailer you can — who has it cheapest?"

### `price_history`

Time series of `{observed_at, price, in_stock}` observations for a product.

| Field     | Type   |
| --------- | ------ |
| `item_id` | string (required) |
| `range`   | `"7d" \| "30d" \| "90d" \| "1y" \| "all"` (default `"30d"`) |

**Example prompt:** "Show me the 90-day price history for item 1689065034."

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

### `get_reviews`

Review summary plus top recent reviews for a product. Optional date range.

| Field        | Type   |
| ------------ | ------ |
| `item_id`    | string (required) |
| `start_date` | `YYYY-MM-DD` (optional) |
| `end_date`   | `YYYY-MM-DD` (optional) |

**Example prompt:** "Summarize what customers complain about in reviews of item 1689065034."

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
