/**
 * Token price lookup via Ref Finance public API.
 * https://api.ref.finance/list-token-price
 *
 * The default `PriceProvider` caches results in-memory (TTL 60s) and
 * deduplicates concurrent requests. Pass a custom provider to the client
 * if you need different caching (Redis, Cloudflare KV, etc.).
 */

export type RefTokenPriceEntry = {
  price: string;
  symbol?: string;
  decimal?: number;
};

export type RefPriceMap = Record<string, RefTokenPriceEntry>;

export const REF_LIST_TOKEN_PRICE_URL = 'https://api.ref.finance/list-token-price';

export interface PriceProvider {
  /** Returns USD price as positive finite number, or null if unknown. */
  getUsdPrice(contractId: string): Promise<number | null>;
  /** Optional bulk fetch — returns a map of contractId → entry. */
  getAll?(): Promise<RefPriceMap>;
}

export type RefPriceProviderOptions = {
  /** Cache TTL in milliseconds. Default: 60_000. */
  ttlMs?: number;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Override URL. */
  url?: string;
  /** Network timeout (ms). Default: 8000. */
  timeoutMs?: number;
};

type CacheEntry = { at: number; data: RefPriceMap };

export class RefPriceProvider implements PriceProvider {
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly url: string;
  private readonly timeoutMs: number;
  private cache: CacheEntry | null = null;
  private inflight: Promise<RefPriceMap> | null = null;

  constructor(opts: RefPriceProviderOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 60_000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.url = opts.url ?? REF_LIST_TOKEN_PRICE_URL;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error(
        'global fetch is not available — pass { fetchImpl } or upgrade to Node ≥ 18.',
      );
    }
  }

  async getAll(): Promise<RefPriceMap> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.ttlMs) {
      return this.cache.data;
    }
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(this.url, {
          headers: { Accept: 'application/json' },
          signal: ac.signal,
        });
        if (!res.ok) {
          if (this.cache) return this.cache.data;
          throw new Error(`Ref price API ${res.status}`);
        }
        const data = (await res.json()) as RefPriceMap;
        this.cache = { at: Date.now(), data };
        return data;
      } catch (e) {
        if (this.cache) return this.cache.data;
        throw e;
      } finally {
        clearTimeout(t);
      }
    })();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  async getUsdPrice(contractId: string): Promise<number | null> {
    const all = await this.getAll();
    const entry = all[contractId];
    if (!entry) return null;
    const n = parseFloat(entry.price);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
}

/** Default singleton — convenient for one-off scripts. */
export const defaultPriceProvider: PriceProvider = new RefPriceProvider();

/** Shortcut: USD price of DarAi via the default provider. */
export async function getDaraiUsdPrice(provider: PriceProvider = defaultPriceProvider): Promise<number | null> {
  return provider.getUsdPrice('darai.tkn.near');
}

/** Shortcut: USD price of any contract via the default provider. */
export async function getTokenUsdPrice(
  contractId: string,
  provider: PriceProvider = defaultPriceProvider,
): Promise<number | null> {
  return provider.getUsdPrice(contractId);
}
