// `get_sales_stats` — sales rank, est monthly units, category. Maps to the
// /v1/products/{id}/sales endpoint, which proxies tools-be /Sales.

import type { ToolDefinition } from './types.js';

interface GetSalesStatsArgs {
  item_id?: unknown;
}

interface UpstreamSales {
  item_id?: string | number;
  sales_rank?: number | null;
  rank?: number | null;
  category?: string | null;
  primary_category?: string | null;
  category_path?: string[] | null;
  estimated_monthly_units?: number | null;
  estimated_monthly_sales?: number | null;
  monthly_units?: number | null;
  estimated_monthly_revenue?: number | null;
  current_price?: number | string | null;
  buybox_price?: number | string | null;
  stats?: Record<string, unknown> | null;
  [k: string]: unknown;
}

export const getSalesStats: ToolDefinition = {
  name: 'get_sales_stats',
  description:
    'Get sales statistics for a Walmart product: category, sales rank, and estimated monthly units. Use this to gauge how fast a SKU moves before sourcing or arbitrage decisions.',
  inputSchema: {
    type: 'object',
    properties: {
      item_id: {
        type: 'string',
        description: 'Walmart item_id, UPC, EAN, or ISBN.',
        minLength: 1,
      },
    },
    required: ['item_id'],
    additionalProperties: false,
  },
  async handler(rawArgs, client) {
    const args = rawArgs as GetSalesStatsArgs;
    if (typeof args?.item_id !== 'string' || !args.item_id.trim()) {
      throw new Error('`item_id` is required and must be a non-empty string.');
    }
    const id = args.item_id.trim();

    const data = await client.get<UpstreamSales>(
      `/products/${encodeURIComponent(id)}/sales`,
    );

    return {
      item_id: data?.item_id !== undefined && data?.item_id !== null ? String(data.item_id) : id,
      sales_rank: data?.sales_rank ?? data?.rank ?? null,
      category: data?.primary_category ?? data?.category ?? null,
      category_path: Array.isArray(data?.category_path) ? data.category_path : null,
      estimated_monthly_units:
        data?.estimated_monthly_units ??
        data?.monthly_units ??
        data?.estimated_monthly_sales ??
        null,
      estimated_monthly_revenue: data?.estimated_monthly_revenue ?? null,
      current_price: toNumber(data?.current_price),
      buybox_price: toNumber(data?.buybox_price),
      raw_stats: data?.stats ?? null,
    };
  },
};

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
