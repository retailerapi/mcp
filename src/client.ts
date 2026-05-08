// Thin HTTP client over https://api.retailerapi.com/v1.
//
// Maps every non-2xx status into a typed `RetailerApiError` so tool handlers
// can produce stable, model-friendly error messages (401 → "API key invalid",
// 429 → "Rate limited, retry in N", etc.).

const DEFAULT_BASE_URL = 'https://api.retailerapi.com/v1';
const KEY_DOC_URL = 'https://app.retailerapi.com/app/keys';

export class RetailerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly userMessage: string,
    public readonly endpoint: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(`retailerapi ${status} on ${endpoint}: ${userMessage}`);
    this.name = 'RetailerApiError';
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      `RETAILERAPI_API_KEY env var is not set. Get a key at ${KEY_DOC_URL} and add it to your MCP client config.`,
    );
    this.name = 'MissingApiKeyError';
  }
}

export interface RetailerApiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class RetailerApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RetailerApiClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.RETAILERAPI_API_KEY;
    if (!apiKey) throw new MissingApiKeyError();
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? process.env.RETAILERAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async get<T = unknown>(path: string, query: Record<string, string | undefined> = {}): Promise<T> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') params.set(k, v);
    }
    const qs = params.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;

    const r = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'retailerapi-mcp/0.1.0',
      },
    });

    const text = await r.text();

    if (r.status === 401 || r.status === 403) {
      throw new RetailerApiError(
        r.status,
        `API key invalid or unauthorized. Check RETAILERAPI_API_KEY at ${KEY_DOC_URL}.`,
        path,
      );
    }
    if (r.status === 404) {
      throw new RetailerApiError(r.status, 'Product not found.', path);
    }
    if (r.status === 429) {
      const retryAfterRaw = r.headers.get('retry-after');
      const retryAfter = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : undefined;
      const seconds = Number.isFinite(retryAfter) ? retryAfter : 60;
      throw new RetailerApiError(
        r.status,
        `Rate limited. Retry in ${seconds} seconds.`,
        path,
        seconds,
      );
    }
    if (r.status >= 500) {
      throw new RetailerApiError(
        r.status,
        'Upstream service issue. Try again shortly.',
        path,
      );
    }
    if (!r.ok) {
      // Other 4xx — surface the body if it looks like JSON.
      let msg = text.slice(0, 200);
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed?.error) msg = parsed.error;
      } catch {
        // not JSON
      }
      throw new RetailerApiError(r.status, msg || `HTTP ${r.status}`, path);
    }

    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new RetailerApiError(r.status, 'Invalid JSON returned by upstream.', path);
    }
  }
}
