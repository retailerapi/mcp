// `get_offers` — list current sellers on a Walmart item. Pulls the product
// detail (which carries the offers array post-normalize) and projects the
// seller-facing fields the model needs.

import type { ToolDefinition } from './types.js';

interface GetOffersArgs {
  item_id?: unknown;
}

interface NormalizedOffer {
  seller_id?: string | null;
  seller_name?: string | null;
  price?: number | null;
  is_buy_box?: boolean;
  in_stock?: boolean | null;
  [k: string]: unknown;
}

interface ProductWithOffers {
  item_id?: string | number;
  offers?: NormalizedOffer[];
  seller_id?: string | null;
  [k: string]: unknown;
}

export const getOffers: ToolDefinition = {
  name: 'get_offers',
  description:
    'List the current sellers on a Walmart product. Returns each offer with seller_id, seller_name, price, in_stock, and an is_buy_box flag. Use to compare seller prices or find the buy-box holder.',
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

    const data = await client.get<ProductWithOffers>(`/products/${encodeURIComponent(id)}`, {
      format: 'item_id',
      include_history: 'false',
      include_stats: 'false',
      include_offers: 'true',
    });

    const offers = Array.isArray(data?.offers) ? data.offers : [];
    const buyBoxSellerId = typeof data?.seller_id === 'string' ? data.seller_id : null;

    const projected = offers.map((o) => ({
      seller_id: o.seller_id ?? null,
      seller_name: o.seller_name ?? null,
      price: typeof o.price === 'number' ? o.price : null,
      in_stock: typeof o.in_stock === 'boolean' ? o.in_stock : null,
      is_buy_box:
        typeof o.is_buy_box === 'boolean'
          ? o.is_buy_box
          : buyBoxSellerId !== null && o.seller_id === buyBoxSellerId,
    }));

    return {
      item_id: id,
      offer_count: projected.length,
      buy_box_seller_id: buyBoxSellerId,
      offers: projected,
    };
  },
};
