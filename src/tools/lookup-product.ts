// `lookup_product` — resolves an identifier (UPC/EAN/ISBN/walmart item_id)
// into a normalized product summary suitable for the model.

import type { ToolDefinition } from './types.js';
import type { RetailerApiClient } from '../client.js';

interface LookupProductArgs {
  identifier?: unknown;
  identifier_type?: unknown;
}

interface UpstreamProduct {
  item_id?: string | number;
  title?: string;
  brand?: string;
  image?: string;
  image_url?: string;
  primary_image?: string;
  current_price?: number | string | null;
  buybox_price?: number | string | null;
  walmart_url?: string;
  url?: string;
  offers?: unknown[];
  current_offers?: unknown[];
  num_offers?: number;
  [k: string]: unknown;
}

export const lookupProduct: ToolDefinition = {
  name: 'lookup_product',
  description:
    'Look up a Walmart product by UPC, EAN, ISBN, or Walmart item_id. Returns title, brand, primary image, current price, number of offers, item_id, and walmart_url. Use this as the entry point when the user gives you any product identifier.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The product identifier — UPC, EAN, ISBN, or Walmart item_id.',
        minLength: 1,
      },
      identifier_type: {
        type: 'string',
        enum: ['UPC', 'EAN', 'ISBN', 'item_id'],
        description:
          'Optional type hint. If omitted, the server auto-detects. Set explicitly when the input could be ambiguous (e.g. a 12-digit number that is both a valid UPC and a valid item_id).',
      },
    },
    required: ['identifier'],
    additionalProperties: false,
  },
  async handler(rawArgs, client) {
    const args = rawArgs as LookupProductArgs;
    if (typeof args?.identifier !== 'string' || !args.identifier.trim()) {
      throw new Error('`identifier` is required and must be a non-empty string.');
    }
    const id = args.identifier.trim();
    const idType = typeof args?.identifier_type === 'string' ? args.identifier_type : undefined;

    const data = await client.get<UpstreamProduct>(`/products/${encodeURIComponent(id)}`, {
      format: idType,
      include_history: 'false',
      include_stats: 'false',
    });

    return summarizeProduct(data, id, client);
  },
};

function summarizeProduct(d: UpstreamProduct, queriedId: string, client: RetailerApiClient): {
  item_id: string | undefined;
  title: string | undefined;
  brand: string | undefined;
  image: string | undefined;
  current_price: number | null;
  buybox_price: number | null;
  offers_count: number;
  walmart_url: string | undefined;
  queried_identifier: string;
} {
  void client; // reserved — may use for follow-up calls in future
  const item_id =
    d.item_id !== undefined && d.item_id !== null ? String(d.item_id) : undefined;
  const offersArr = Array.isArray(d.offers)
    ? d.offers
    : Array.isArray(d.current_offers)
      ? d.current_offers
      : undefined;
  const offers_count =
    typeof d.num_offers === 'number'
      ? d.num_offers
      : offersArr
        ? offersArr.length
        : 0;
  return {
    item_id,
    title: typeof d.title === 'string' ? d.title : undefined,
    brand: typeof d.brand === 'string' ? d.brand : undefined,
    image:
      typeof d.image === 'string'
        ? d.image
        : typeof d.image_url === 'string'
          ? d.image_url
          : typeof d.primary_image === 'string'
            ? d.primary_image
            : undefined,
    current_price: toNumber(d.current_price),
    buybox_price: toNumber(d.buybox_price),
    offers_count,
    walmart_url:
      typeof d.walmart_url === 'string'
        ? d.walmart_url
        : typeof d.url === 'string'
          ? d.url
          : item_id
            ? `https://www.walmart.com/ip/${item_id}`
            : undefined,
    queried_identifier: queriedId,
  };
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
