// `get_reviews` — review summary + a small sample of recent reviews.

import type { ToolDefinition } from './types.js';

interface GetReviewsArgs {
  item_id?: unknown;
  start_date?: unknown;
  end_date?: unknown;
}

interface UpstreamReview {
  rating?: number | null;
  title?: string | null;
  text?: string | null;
  body?: string | null;
  reviewer?: string | null;
  reviewer_name?: string | null;
  date?: string | null;
  submitted_at?: string | null;
  helpful_count?: number | null;
  verified_purchase?: boolean | null;
  [k: string]: unknown;
}

interface ReviewSummary {
  average_rating?: number | null;
  total_reviews?: number | null;
  rating_distribution?: Record<string, number> | null;
  sentiment?: { positive?: number; neutral?: number; negative?: number };
  verified_purchases?: number | null;
  non_verified_purchases?: number | null;
}

interface MonthlyBucket {
  month?: string | null;
  total_reviews?: number;
  average_rating?: number | null;
  sentiment?: { positive?: number | null; neutral?: number | null; negative?: number | null };
}

interface UpstreamReviews {
  identifier?: string;
  item_id?: string | number;
  // Modern flat shape returned by /v1/products/{id}/reviews
  summary?: ReviewSummary;
  monthly_breakdown?: MonthlyBucket[];
  top_reviews?: UpstreamReview[];
  // Legacy fallback shape (pre-2026-05-12 envelope)
  average_rating?: number | null;
  rating?: number | null;
  total_reviews?: number | null;
  review_count?: number | null;
  rating_distribution?: Record<string, number> | null;
  reviews?: UpstreamReview[];
  [k: string]: unknown;
}

const TOP_N = 10;

export const getReviews: ToolDefinition = {
  name: 'get_reviews',
  description:
    'Get a Walmart product review summary plus the top recent reviews. Returns average_rating, total_reviews, rating distribution, and an array of up to 10 reviews. Optional date range narrows the window.',
  inputSchema: {
    type: 'object',
    properties: {
      item_id: {
        type: 'string',
        description: 'Walmart item_id.',
        minLength: 1,
      },
      start_date: {
        type: 'string',
        description: 'Optional ISO date (YYYY-MM-DD). Reviews on or after this date.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      end_date: {
        type: 'string',
        description: 'Optional ISO date (YYYY-MM-DD). Reviews on or before this date.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
    },
    required: ['item_id'],
    additionalProperties: false,
  },
  async handler(rawArgs, client) {
    const args = rawArgs as GetReviewsArgs;
    if (typeof args?.item_id !== 'string' || !args.item_id.trim()) {
      throw new Error('`item_id` is required and must be a non-empty string.');
    }
    const id = args.item_id.trim();
    const startDate = typeof args?.start_date === 'string' ? args.start_date : undefined;
    const endDate = typeof args?.end_date === 'string' ? args.end_date : undefined;

    const data = await client.get<UpstreamReviews>(
      `/products/${encodeURIComponent(id)}/reviews`,
      {
        start_date: startDate,
        end_date: endDate,
      },
    );

    const reviewsRaw = Array.isArray(data?.top_reviews)
      ? data.top_reviews
      : Array.isArray(data?.reviews)
        ? data.reviews
        : [];
    const top = reviewsRaw.slice(0, TOP_N).map((r) => ({
      rating: typeof r.rating === 'number' ? r.rating : null,
      title: r.title ?? null,
      text: r.text ?? r.body ?? null,
      reviewer: r.reviewer_name ?? r.reviewer ?? null,
      submitted_at: r.submitted_at ?? r.date ?? null,
      helpful_count: typeof r.helpful_count === 'number' ? r.helpful_count : null,
      verified_purchase:
        typeof r.verified_purchase === 'boolean' ? r.verified_purchase : null,
    }));

    // Read from the modern summary shape first; fall back to flat fields for
    // pre-2026-05-12 deployments.
    const summary = data?.summary ?? {};
    return {
      item_id: id,
      summary: {
        average_rating: summary.average_rating ?? data?.average_rating ?? data?.rating ?? null,
        total_reviews: summary.total_reviews ?? data?.total_reviews ?? data?.review_count ?? null,
        rating_distribution: summary.rating_distribution ?? data?.rating_distribution ?? null,
        sentiment: summary.sentiment ?? null,
        verified_purchases: summary.verified_purchases ?? null,
        non_verified_purchases: summary.non_verified_purchases ?? null,
        date_range:
          startDate || endDate
            ? { start_date: startDate ?? null, end_date: endDate ?? null }
            : null,
      },
      monthly_breakdown: Array.isArray(data?.monthly_breakdown) ? data.monthly_breakdown : null,
      top_reviews: top,
    };
  },
};
