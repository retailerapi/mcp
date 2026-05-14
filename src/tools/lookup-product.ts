// `lookup_product` — resolves an identifier (UPC/EAN/ISBN/walmart item_id)
// into a normalized product summary suitable for the model.

import type { ToolDefinition } from './types.js';
import type { RetailerApiClient } from '../client.js';

interface LookupProductArgs {
  identifier?: unknown;
  identifier_type?: unknown;
  include_cross_retailer?: unknown;
  retailer?: unknown;
}

interface CrossRetailerCell {
  retailer: string;
  status: 'ok' | 'indexing' | 'stale' | 'not_found' | 'blocked' | 'error';
  price?: number;
  url?: string;
  in_stock?: boolean;
  fetched_at?: string;
}

interface RetailerLink {
  retailer: string;
  url: string;
  found_via?: string;
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
  retailer_links?: RetailerLink[];
  cross_retailer?: CrossRetailerCell[];
  [k: string]: unknown;
}

export const lookupProduct: ToolDefinition = {
  name: 'lookup_product',
  description:
    'Look up a product by UPC, EAN, ISBN, GTIN, ASIN, or Walmart item_id. Returns title, brand, primary image, current Walmart price, number of offers, item_id, walmart_url, AND retailer_links — the list of other retailers (Amazon, eBay, Target, Best Buy, Lowe\'s, Home Depot) that carry this product, with a direct URL to each. Discovery is free; set include_cross_retailer=true to also pull live price/stock per retailer (+2 tokens). Cells may be marked status="indexing" on first lookup; subsequent calls (after a few seconds) typically return populated data.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The product identifier — UPC, EAN, ISBN, GTIN, Amazon ASIN (B0XXXXXXXX), or Walmart item_id.',
        minLength: 1,
      },
      identifier_type: {
        type: 'string',
        enum: ['UPC', 'EAN', 'ISBN', 'GTIN', 'ASIN', 'item_id'],
        description:
          'Optional type hint. If omitted, the server auto-detects. Set explicitly when the input could be ambiguous (e.g. a 12-digit number that is both a valid UPC and a valid item_id). ASIN inputs route through the Amazon-first path; include_offers_reviews is silently ignored for ASIN since Amazon\'s PDP doesn\'t carry the marketplace-offers blob.',
      },
      include_cross_retailer: {
        type: 'boolean',
        description:
          'Include current pricing from non-Walmart retailers (Amazon, eBay, Lowe\'s, Target, Best Buy, Home Depot). Returns each retailer\'s status: "ok" (data current), "stale" (data older than retailer-specific TTL), "indexing" (no data yet — first request triggers a background fetch), "not_found" (retailer doesn\'t carry this product). Default: false.',
      },
      retailer: {
        type: 'string',
        enum: ['walmart', 'amazon', 'ebay', 'lowes', 'target', 'bestbuy', 'homedepot'],
        description:
          "Force a specific retailer's data as the primary source. Omit (or pass 'walmart') for the default catalog. Walmart item_id is rejected with non-walmart retailers — use UPC, EAN, ISBN, GTIN, or ASIN. Cost: 1 token flat (no surcharge). Returns 404 retailer_unavailable if the retailer's scraper waterfall is exhausted.",
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
    const includeCrossRetailer = args?.include_cross_retailer === true;
    const retailer = typeof args?.retailer === 'string' ? args.retailer.toLowerCase().trim() : undefined;

    const data = await client.get<UpstreamProduct>(`/products/${encodeURIComponent(id)}`, {
      format: idType,
      include_history: 'false',
      include_stats: 'false',
      include_cross_retailer: includeCrossRetailer ? 'true' : undefined,
      retailer,
    });

    return summarizeProduct(data, id, client, includeCrossRetailer);
  },
};

function summarizeProduct(
  d: UpstreamProduct,
  queriedId: string,
  client: RetailerApiClient,
  includeCrossRetailer: boolean,
): {
  item_id: string | undefined;
  title: string | undefined;
  brand: string | undefined;
  image: string | undefined;
  current_price: number | null;
  buybox_price: number | null;
  offers_count: number;
  walmart_url: string | undefined;
  queried_identifier: string;
  retailer_links?: RetailerLink[];
  cross_retailer?: CrossRetailerCell[];
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
    retailer_links: Array.isArray(d.retailer_links) && d.retailer_links.length ? d.retailer_links : undefined,
    cross_retailer: includeCrossRetailer && Array.isArray(d.cross_retailer) ? d.cross_retailer : undefined,
  };
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
