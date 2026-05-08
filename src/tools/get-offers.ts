// `get_offers` — list current sellers on a Walmart item. We pull the
// product detail (which embeds current offers) and project the seller-facing
// fields the model needs.

import type { ToolDefinition } from './types.js';

interface GetOffersArgs {
  item_id?: unknown;
}

interface UpstreamOffer {
  seller_id?: string;
  seller_name?: string | null;
  seller_display_name?: string | null;
  current_price?: number | string | null;
  price?: number | string | null;
  condition_text?: string | null;
  condition?: string | null;
  buybox_owner?: boolean | null;
  is_buybox?: boolean | null;
  fulfillment_type?: string | null;
  availability_status?: string | null;
  [k: string]: unknown;
}

interface UpstreamProductWithOffers {
  item_id?: string | number;
  offers?: UpstreamOffer[];
  current_offers?: UpstreamOffer[];
  buybox_seller_id?: string;
  [k: string]: unknown;
}

export const getOffers: ToolDefinition = {
  name: 'get_offers',
  description:
    'List the current sellers on a Walmart product. Returns each offer with seller_id, seller_name, price, condition, and a buybox_owner flag. Use this to compare seller prices or find the buybox holder.',
  inputSchema: {
    type: 'object',
    properties: {
      item_id: {
        type: 'string',
        description: 'Walmart item_id. Use `lookup_product` first if you only have a UPC.',
        minLength: 1,
      },
    },
    required: ['item_id'],
    additionalProperties: false,
  },
  async handler(rawArgs, client) {
    const args = rawArgs as GetOffersArgs;
    if (typeof args?.item_id !== 'string' || !args.item_id.trim()) {
      throw new Error('`item_id` is required and must be a non-empty string.');
    }
    const id = args.item_id.trim();

    const data = await client.get<UpstreamProductWithOffers>(`/products/${encodeURIComponent(id)}`, {
      format: 'item_id',
      include_history: 'false',
      include_stats: 'false',
    });

    const raw = Array.isArray(data?.offers)
      ? data.offers
      : Array.isArray(data?.current_offers)
        ? data.current_offers
        : [];

    const buyboxSellerId = data?.buybox_seller_id ?? undefined;

    const offers = raw.map((o) => ({
      seller_id: o.seller_id ?? null,
      seller_name: o.seller_display_name ?? o.seller_name ?? null,
      price: toNumber(o.current_price ?? o.price),
      condition: o.condition_text ?? o.condition ?? null,
      fulfillment_type: o.fulfillment_type ?? null,
      availability_status: o.availability_status ?? null,
      buybox_owner:
        typeof o.is_buybox === 'boolean'
          ? o.is_buybox
          : typeof o.buybox_owner === 'boolean'
            ? o.buybox_owner
            : buyboxSellerId !== undefined && o.seller_id === buyboxSellerId,
    }));

    return {
      item_id: id,
      offer_count: offers.length,
      offers,
    };
  },
};

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
