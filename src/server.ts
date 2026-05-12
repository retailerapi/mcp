// MCP server bootstrap. Wires up each tool module, lazy-instantiates the
// HTTP client (so a missing env var becomes a structured tool-call error
// rather than a process crash on startup — Claude Desktop swallows stdout
// silently otherwise), and serves over stdio.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  RetailerApiClient,
  RetailerApiError,
  MissingApiKeyError,
} from './client.js';
import type { ToolDefinition } from './tools/types.js';
import { lookupProduct } from './tools/lookup-product.js';
import { priceHistory } from './tools/price-history.js';
import { getOffers } from './tools/get-offers.js';
import { getSeller } from './tools/get-seller.js';
import { getReviews } from './tools/get-reviews.js';
import { PKG_NAME, PKG_VERSION } from './version.js';

const TOOLS: ToolDefinition[] = [
  lookupProduct,
  priceHistory,
  getOffers,
  getSeller,
  getReviews,
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

const SERVER_NAME = PKG_NAME;
const SERVER_VERSION = PKG_VERSION;

export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  let _client: RetailerApiClient | null = null;
  function getClient(): RetailerApiClient {
    if (_client) return _client;
    _client = new RetailerApiClient();
    return _client;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const tool = TOOLS_BY_NAME.get(name);
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}. Available: ${TOOLS.map((t) => t.name).join(', ')}`,
          },
        ],
      };
    }

    try {
      const client = getClient();
      const result = await tool.handler(args ?? {}, client);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: formatError(e),
          },
        ],
      };
    }
  });

  return server;
}

function formatError(e: unknown): string {
  if (e instanceof MissingApiKeyError) {
    return JSON.stringify(
      {
        error: 'missing_api_key',
        message: e.message,
        docs_url: 'https://app.retailerapi.com/app/keys',
      },
      null,
      2,
    );
  }
  if (e instanceof RetailerApiError) {
    return JSON.stringify(
      {
        error: classifyStatus(e.status),
        status: e.status,
        message: e.userMessage,
        endpoint: e.endpoint,
        retry_after_seconds: e.retryAfterSeconds,
      },
      null,
      2,
    );
  }
  if (e instanceof Error) {
    return JSON.stringify({ error: 'tool_error', message: e.message }, null, 2);
  }
  return JSON.stringify({ error: 'unknown', message: String(e) }, null, 2);
}

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  return 'request_error';
}
