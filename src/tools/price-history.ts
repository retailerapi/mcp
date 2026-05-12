// `price_history` — returns the time series of prices + stock state for a
// Walmart item. Hits the dedicated /v1/products/{id}/history endpoint which
// is server-side filtered by timeframe + costs less than bundling history
// into a full product lookup.

import type { ToolDefinition } from './types.js';

type Range = '7d' | '30d' | '90d' | '1y' | 'all';
const RANGES: Range[] = ['7d', '30d', '90d', '1y', 'all'];

interface PriceHistoryArgs {
  item_id?: unknown;
  range?: unknown;
}

interface HistoryResponse {
  identifier?: string;
  retailer?: string;
  timeframe?: string;
  observations?: Array<{
    observed_at?: string | null;
    price?: number | null;
    in_stock?: boolean | null;
  }>;
  stats?: Record<string, unknown>;
  [k: string]: unknown;
}

export const priceHistory: ToolDefinition = {
  name: 'price_history',
  description:
    'Get the price history time series for a Walmart product. Returns `{ identifier, retailer, timeframe, observations[], stats }`. Use the `range` parameter to limit the window (default 30d). Cheaper than chaining lookup_product with history.',
  inputSchema: {
    type: 'object',
    properties: {
      item_id: {
        type: 'string',
        description: 'Walmart item_id (numeric string). Get this from `lookup_product` if you only have a UPC.',
        minLength: 1,
      },
      range: {
        type: 'string',
        enum: ['7d', '30d', '90d', '1y', 'all'],
        description: 'Time range. Defaults to 30d.',
        default: '30d',
      },
    },
    required: ['item_id'],
    additionalProperties: false,
  },
  async handler(rawArgs, client) {
    const args = rawArgs as PriceHistoryArgs;
    if (typeof args?.item_id !== 'string' || !args.item_id.trim()) {
      throw new Error('`item_id` is required and must be a non-empty string.');
    }
    const range: Range = (typeof args?.range === 'string' && (RANGES as string[]).includes(args.range))
      ? (args.range as Range)
      : '30d';
    const id = args.item_id.trim();

    const data = await client.get<HistoryResponse>(`/products/${encodeURIComponent(id)}/history`, {
      timeframe: range,
      retailer: 'walmart',
    });

    return {
      identifier: data.identifier ?? id,
      retailer: data.retailer ?? 'walmart',
      timeframe: data.timeframe ?? range,
      observations: Array.isArray(data.observations) ? data.observations : [],
      stats: data.stats ?? null,
    };
  },
};
