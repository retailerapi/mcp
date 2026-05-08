// `price_history` — returns the time series of prices + stock state for a
// Walmart item. Optional `range` trims the array client-side to keep token
// counts reasonable (the upstream returns full history regardless).

import type { ToolDefinition } from './types.js';

const RANGE_DAYS: Record<string, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: null,
};

interface PriceHistoryArgs {
  item_id?: unknown;
  range?: unknown;
}

interface UpstreamProductWithHistory {
  item_id?: string | number;
  price_history?: Array<{
    recorded_at?: string;
    timestamp?: string;
    price?: number | string | null;
    in_stock?: boolean | null;
  }>;
  [k: string]: unknown;
}

export const priceHistory: ToolDefinition = {
  name: 'price_history',
  description:
    'Get the price history time series for a Walmart product by item_id. Returns an array of {recorded_at, price, in_stock} samples. Use the `range` parameter to limit the window (default 30d).',
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
    const range = typeof args?.range === 'string' && args.range in RANGE_DAYS ? args.range : '30d';
    const id = args.item_id.trim();

    const data = await client.get<UpstreamProductWithHistory>(`/products/${encodeURIComponent(id)}`, {
      format: 'item_id',
      include_history: 'true',
      include_stats: 'false',
    });

    const raw = Array.isArray(data?.price_history) ? data.price_history : [];
    const days = RANGE_DAYS[range];
    const cutoff =
      days === null ? null : Date.now() - days * 24 * 60 * 60 * 1000;

    const samples = raw
      .map((row) => ({
        recorded_at: row?.recorded_at ?? row?.timestamp ?? null,
        price: toNumber(row?.price),
        in_stock: typeof row?.in_stock === 'boolean' ? row.in_stock : null,
      }))
      .filter((row) => {
        if (!row.recorded_at) return false;
        if (cutoff === null) return true;
        const t = Date.parse(row.recorded_at);
        return Number.isFinite(t) && t >= cutoff;
      });

    return {
      item_id: id,
      range,
      sample_count: samples.length,
      samples,
    };
  },
};

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
