// `get_seller` — Walmart seller profile lookup.

import type { ToolDefinition } from './types.js';

interface GetSellerArgs {
  seller_id?: unknown;
}

interface UpstreamSeller {
  seller_id?: string;
  seller_name?: string;
  display_name?: string;
  total_listings?: number;
  num_listings?: number;
  rating?: number | null;
  average_rating?: number | null;
  review_count?: number | null;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  joined_date?: string | null;
  [k: string]: unknown;
}

export const getSeller: ToolDefinition = {
  name: 'get_seller',
  description:
    'Fetch a Walmart seller profile by seller_id. Returns name, total_listings, rating, status, and location fields when available.',
  inputSchema: {
    type: 'object',
    properties: {
      seller_id: {
        type: 'string',
        description: 'Walmart seller_id (often a numeric string). You can get this from `get_offers`.',
        minLength: 1,
      },
    },
    required: ['seller_id'],
    additionalProperties: false,
  },
  async handler(rawArgs, client) {
    const args = rawArgs as GetSellerArgs;
    if (typeof args?.seller_id !== 'string' || !args.seller_id.trim()) {
      throw new Error('`seller_id` is required and must be a non-empty string.');
    }
    const id = args.seller_id.trim();

    const data = await client.get<UpstreamSeller>(`/sellers/${encodeURIComponent(id)}`);

    return {
      seller_id: data?.seller_id ?? id,
      name: data?.display_name ?? data?.seller_name ?? null,
      total_listings: data?.total_listings ?? data?.num_listings ?? null,
      rating: data?.average_rating ?? data?.rating ?? null,
      review_count: data?.review_count ?? null,
      status: data?.status ?? null,
      location:
        data?.city || data?.state || data?.country
          ? {
              city: data?.city ?? null,
              state: data?.state ?? null,
              country: data?.country ?? null,
            }
          : null,
      joined_date: data?.joined_date ?? null,
    };
  },
};
