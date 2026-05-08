# @retailerapi/mcp

Model Context Protocol server for [retailerapi.com](https://retailerapi.com). Exposes Walmart product data — lookups, price history, offers, seller profiles, reviews, and sales stats — as tools your AI agent can call directly.

Works with **Claude Desktop**, **Claude Code**, **Cursor**, and any other MCP-compatible client over stdio.

## Quick start

### 1. Get an API key

Sign in at [app.retailerapi.com](https://app.retailerapi.com) and create a key on the [API Keys](https://app.retailerapi.com/app/keys) page. Keys look like `rk_live_…`.

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
        "RETAILERAPI_API_KEY": "rk_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The retailerapi tools will appear in the tool picker.

#### Claude Code

```bash
claude mcp add retailerapi npx -y @retailerapi/mcp \
  --env RETAILERAPI_API_KEY=rk_live_your_key_here
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
        "RETAILERAPI_API_KEY": "rk_live_your_key_here"
      }
    }
  }
}
```

#### Generic stdio

```bash
RETAILERAPI_API_KEY=rk_live_your_key_here npx @retailerapi/mcp
```

The process speaks MCP over stdio (newline-delimited JSON-RPC on stdin/stdout). Logs go to stderr.

## Tools

### `lookup_product`

Resolve any identifier (UPC / EAN / ISBN / Walmart `item_id`) into a normalized product summary.

| Field             | Type     |
| ----------------- | -------- |
| `identifier`      | string (required) |
| `identifier_type` | `"UPC" \| "EAN" \| "ISBN" \| "item_id"` (optional — auto-detect if omitted) |

**Example prompt:** "Look up UPC 045496590161 and tell me the brand and price."

### `price_history`

Time series of `{recorded_at, price, in_stock}` samples for a Walmart `item_id`.

| Field     | Type   |
| --------- | ------ |
| `item_id` | string (required) |
| `range`   | `"7d" \| "30d" \| "90d" \| "1y" \| "all"` (default `"30d"`) |

**Example prompt:** "Show me the 90-day price history for Walmart item 1689065034."

### `get_offers`

List current sellers on a Walmart product, including price, condition, fulfillment type, and which seller owns the buybox.

| Field     | Type   |
| --------- | ------ |
| `item_id` | string (required) |

**Example prompt:** "Who has the buybox on item 1689065034 and what's the next-cheapest seller?"

### `get_seller`

Walmart seller profile by `seller_id`: name, total listings, rating, status, location.

| Field       | Type   |
| ----------- | ------ |
| `seller_id` | string (required) |

**Example prompt:** "Tell me about Walmart seller 101037778."

### `get_reviews`

Review summary plus the top recent reviews for a Walmart product. Optional date range.

| Field        | Type   |
| ------------ | ------ |
| `item_id`    | string (required) |
| `start_date` | `YYYY-MM-DD` (optional) |
| `end_date`   | `YYYY-MM-DD` (optional) |

**Example prompt:** "Summarize what customers complain about in reviews of item 1689065034."

### `get_sales_stats`

Sales rank, primary category, estimated monthly units (and revenue when available).

| Field     | Type   |
| --------- | ------ |
| `item_id` | string (required) |

**Example prompt:** "Is Walmart item 1689065034 a fast mover? Give me the rank and estimated monthly units."

## Errors

Tool calls return structured JSON errors instead of crashing the agent:

| Status   | Error code        | Meaning                                                              |
| -------- | ----------------- | -------------------------------------------------------------------- |
| 401, 403 | `unauthorized`    | API key invalid or missing scope. Check `RETAILERAPI_API_KEY`.       |
| 404      | `not_found`       | Product, seller, or item_id not found.                               |
| 429      | `rate_limited`    | Quota or burst limit hit. Includes `retry_after_seconds`.            |
| 5xx      | `upstream_error`  | Backend issue. Retry shortly.                                        |
| —        | `missing_api_key` | `RETAILERAPI_API_KEY` env var not set. Pointer to docs included.     |

## Environment

| Variable               | Required | Default                          |
| ---------------------- | -------- | -------------------------------- |
| `RETAILERAPI_API_KEY`  | yes      | —                                |
| `RETAILERAPI_BASE_URL` | no       | `https://api.retailerapi.com/v1` |

## Develop locally

```bash
pnpm install
pnpm --filter @retailerapi/mcp build
RETAILERAPI_API_KEY=rk_live_… node packages/mcp/dist/index.js
```

The MCP Inspector (`npx @modelcontextprotocol/inspector`) is the easiest way to exercise the tools manually.

## License

MIT
