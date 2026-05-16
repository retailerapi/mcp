// `lookup_product` — resolves an identifier (UPC/EAN/ISBN/walmart item_id)
// into a normalized product summary suitable for the model.

import type { ToolDefinition } from './types.js';
import type { RetailerApiClient } from '../client.js';

interface LookupProductArgs {
  identifier?: unknown;
  identifier_type?: unknown;
  include_cross_retailer?: unknown;
  include_seller_context?: unknown;
  retailer?: unknown;
  force_refresh?: unknown;
}

interface SellerContext {
  referral_fee_usd?: number | null;
  wfs_fee_usd?: number | null;
  restricted?: { flag: boolean; reason: string | null } | null;
  wfs_eligibility?: { enabled: boolean; reason: string | null } | null;
}

interface CrossRetailerCell {
  retailer: string;
  status: 'ok' | 'indexing' | 'stale' | 'not_found' | 'blocked' | 'error';
  price?: number | null;
  url?: string | null;
  in_stock?: boolean | null;
  unavailable?: boolean | null;
  sold_tag?: string | null;
  estimated_sales?: number | null;
  is_best_seller?: boolean | null;
  pack_count?: number | null;
  hazmat?: boolean | null;
  seller_context?: SellerContext | null;
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
  cross_retailer?: Record<string, CrossRetailerCell>;
  seller_context?: {
    restricted?: { any: boolean; retailers: string[]; primary_reason: string | null } | null;
  } | null;
  [k: string]: unknown;
}

export const lookupProduct: ToolDefinition = {
  name: 'lookup_product',
  description:
    'Look up a product by UPC, EAN, ISBN, GTIN, ASIN, or retailer item_id. Base call (1 token) returns title, brand, image, current price, offers_count, identifiers, retailer_links (other retailers carrying this product, URLs only), Bucket-1 facts (sold_tag, estimated_sales, is_best_seller, pack_count, hazmat), and computed marketplace fees (referral_fee_usd, wfs_fee_usd). Add include_cross_retailer=true (+2 tokens) for the cross_retailer block — cached per-retailer cells, read-only. Add include_seller_context=true (+3 tokens) for live seller-side state (is_restricted, WFS eligibility) on marketplace retailers. To force fresh data for a specific retailer, call with retailer=<slug> and force_refresh=true. Marketplace fees are FREE in base call (Keepa parity).',
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
          'Include the cross_retailer block — a map keyed by retailer slug of cached per-retailer cells (price, in_stock, Bucket-1 fields) for every retailer we have for this UPC. Each cell has a status: "ok" (data current), "stale" (older than retailer TTL), "indexing" (no data yet — background fetch will populate within ~30s), "not_found" (retailer doesn\'t carry this product). +2 tokens. READ-ONLY: never triggers fresh scrapes. To force a fresh scrape of a specific retailer, call with retailer=<slug> and force_refresh=true.',
      },
      include_seller_context: {
        type: 'boolean',
        description:
          'Include live seller-side state under cross_retailer.<retailer>.seller_context.restricted and .wfs_eligibility, plus top-level seller_context.restricted aggregation. +3 tokens. Marketplace fees (referral_fee_usd, wfs_fee_usd) are already free in the base call — this flag adds the live-state fields (is_restricted, restriction reason, WFS eligibility) that require a richer upstream pull. Applies to marketplace retailers only.',
      },
      retailer: {
        type: 'string',
        pattern: '^[a-z0-9]{2,30}$',
        description:
          "Anchor the response to a specific retailer's data. Slug format: lowercase alphanumeric only, 2-30 chars, no TLD or separators (homedepot not 'home-depot' or 'homedepot.com'). Vetted retailers have custom parsers; any other slug routes through a self-extending WebFetch waterfall against <slug>.com. Cost: 1 token flat. 404 codes: not_found (retailer doesn't carry) | retailer_unavailable (waterfall exhausted) | retailer_pending (bot-blocked, extension coming soon).",
      },
      force_refresh: {
        type: 'boolean',
        description:
          "Bypass cache and force a fresh scrape of the retailer specified by `retailer`. Only valid when `retailer` is also set — passing force_refresh alone returns 400. This is the ONLY way to force fresh data from the API. No additional token cost beyond the retailer surcharge.",
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
    const includeSellerContext = args?.include_seller_context === true;
    const retailer = typeof args?.retailer === 'string' ? args.retailer.toLowerCase().trim() : undefined;
    const forceRefresh = args?.force_refresh === true;

    const data = await client.get<UpstreamProduct>(`/products/${encodeURIComponent(id)}`, {
      format: idType,
      include_cross_retailer: includeCrossRetailer ? 'true' : undefined,
      include_seller_context: includeSellerContext ? 'true' : undefined,
      retailer,
      force_refresh: forceRefresh && retailer ? 'true' : undefined,
    });

    return summarizeProduct(data, id, client, includeCrossRetailer, includeSellerContext);
  },
};

function summarizeProduct(
  d: UpstreamProduct,
  queriedId: string,
  client: RetailerApiClient,
  includeCrossRetailer: boolean,
  includeSellerContext: boolean,
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
  cross_retailer?: Record<string, CrossRetailerCell>;
  seller_context?: { restricted?: { any: boolean; retailers: string[]; primary_reason: string | null } | null } | null;
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
    // cross_retailer is a map keyed by retailer slug. Only present when the
    // caller set include_cross_retailer=true (+2 tokens). Read-only over our
    // cache — to force a fresh scrape of a specific retailer, use
    // retailer=<slug> + force_refresh=true.
    cross_retailer:
      d.cross_retailer && typeof d.cross_retailer === 'object' && !Array.isArray(d.cross_retailer)
        ? d.cross_retailer
        : undefined,
    seller_context: includeSellerContext && d.seller_context ? d.seller_context : undefined,
  };
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
