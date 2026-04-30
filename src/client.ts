/**
 * YupPay HTTP client.
 *
 * Talks to the YupPay edge function:
 *   POST {baseUrl}/functions/v1/yuppay-api
 *   Authorization: Bearer ypp_live_xxx
 *
 * Server-side usage:
 *   const client = new YupPayClient({ apiKey: 'ypp_live_...' });
 *   const inv = await client.createInvoice({ token: 'darai', amount: { usd: 9.99 } });
 *
 * Browser-side usage is the same — but never embed `ypp_live_*` in client code:
 *   create invoices on your server, then redirect users to `inv.payUrl`.
 */

import { toTokenInfo, type TokenInfo, type TokenRef, DARAI } from './tokens.js';
import { parseAmount } from './amount.js';
import { defaultPriceProvider, type PriceProvider } from './price.js';
import { usdToToken, type ConversionResult } from './convert.js';

export const DEFAULT_BASE_URL = 'https://hxgvqtxsgdscbylzakxo.supabase.co';

export type YupPayClientOptions = {
  /**
   * YupPay API key (`ypp_live_...` or `ypp_test_...`).
   * Required for server-side calls. If omitted, only public helpers
   * (price/convert/format) work — getInvoice etc. will throw.
   */
  apiKey?: string;
  /**
   * Default app id. When using an API key the server resolves it
   * automatically; passing it explicitly helps when one process serves
   * multiple apps.
   */
  appId?: string;
  /**
   * Base URL of the YupPay deployment. Defaults to the public Supabase
   * project. Override for self-hosted / staging.
   */
  baseUrl?: string;
  /**
   * Optional public origin used to build `pay_url` (browser link).
   * Defaults to `https://www.yupland.io`.
   */
  publicBaseUrl?: string;
  /** Override fetch (Node ≥18 has it built-in). */
  fetchImpl?: typeof fetch;
  /** Override price provider (e.g. mock or shared cache). */
  priceProvider?: PriceProvider;
  /** Network timeout per request, ms. Default: 15_000. */
  timeoutMs?: number;
  /** Extra HTTP headers (e.g. tracing). */
  headers?: Record<string, string>;
};

export type YupPayInvoice = {
  id: string;
  app_id: string;
  public_token: string;
  token_contract_id: string;
  amount_raw: string;
  payment_reference: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  metadata: Record<string, unknown> | null;
  expires_at: string | null;
  settlement_tx_hash: string | null;
  payer_near_account: string | null;
  created_at: string;
  updated_at: string | null;
  paid_at: string | null;
};

export type CreateInvoiceInput = {
  /** Token reference: 'darai' / 'usdt' / contract id / TokenInfo. */
  token: TokenRef;
  /**
   * Amount specification — exactly one of:
   * - `{ usd }`: convert to token via Ref Finance price (DarAi only by default).
   * - `{ token: '12.5' }`: human amount in tokens (string, comma or dot).
   * - `{ raw: '12500000' }`: raw minimal units (digits string or bigint).
   */
  amount:
    | { usd: number; rounding?: 'ceil' | 'round' | 'floor' }
    | { token: string }
    | { raw: string | bigint };
  /** Free-form metadata stored with the invoice. */
  metadata?: Record<string, unknown>;
  /**
   * Convenience: URL the buyer is redirected back to from the payment page.
   * Stored as `metadata.return_url`.
   */
  returnUrl?: string;
  /** Expiration: ISO string OR seconds-from-now. */
  expiresAt?: string | Date;
  expiresInSec?: number;
  /** Override merchant app id (otherwise inferred from API key). */
  appId?: string;
  /** Override the public origin used to construct `pay_url`. */
  publicBaseUrl?: string;
  /** For unknown tokens, decimals to use when parsing `amount.token`. */
  fallbackDecimals?: number;
};

export type CreateInvoiceResult = {
  invoice: YupPayInvoice;
  /** Browser link (e.g. https://www.yupland.io/pay/i/<token>). */
  payUrl: string | null;
  /** Telegram Mini App link. */
  payTgUrl: string | null;
  publicToken: string;
  amountRaw: string;
  /** Filled when amount.usd was used. */
  conversion?: ConversionResult;
};

export type ListInvoicesInput = {
  appId?: string;
  limit?: number;
  offset?: number;
  status?: 'pending' | 'paid' | 'expired' | 'cancelled';
};

export class YupPayApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly hint: string | null;
  readonly raw: unknown;
  constructor(status: number, body: unknown) {
    const code = pickStr(body, 'error');
    const message = pickStr(body, 'message') ?? code ?? `YupPay API error (HTTP ${status})`;
    super(message);
    this.name = 'YupPayApiError';
    this.status = status;
    this.code = code;
    this.hint = pickStr(body, 'hint');
    this.raw = body;
  }
}

function pickStr(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

export class YupPayClient {
  readonly baseUrl: string;
  readonly publicBaseUrl: string;
  readonly priceProvider: PriceProvider;
  private readonly apiKey: string | undefined;
  private readonly appId: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: YupPayClientOptions = {}) {
    this.apiKey = opts.apiKey?.trim() || undefined;
    this.appId = opts.appId?.trim() || undefined;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.publicBaseUrl = (opts.publicBaseUrl ?? 'https://www.yupland.io').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.priceProvider = opts.priceProvider ?? defaultPriceProvider;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.extraHeaders = { ...(opts.headers ?? {}) };
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('global fetch is unavailable. Pass { fetchImpl } or use Node ≥ 18.');
    }
  }

  /** Low-level: POST {action, ...params} to the YupPay edge function. */
  async call<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        `YupPayClient is read-only without an apiKey. Pass { apiKey: 'ypp_live_...' } to call "${action}".`,
      );
    }
    const url = `${this.baseUrl}/functions/v1/yuppay-api`;
    const body: Record<string, unknown> = { action, ...params };
    if (this.appId && body.app_id == null) body.app_id = this.appId;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'x-yuppay-api-key': this.apiKey,
          ...this.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(t);
    }

    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: 'invalid_json', message: text.slice(0, 500) };
      }
    }
    if (!res.ok) {
      throw new YupPayApiError(res.status, parsed);
    }
    if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).ok === false) {
      throw new YupPayApiError(res.status, parsed);
    }
    return parsed as T;
  }

  /** Resolve token info via the SDK registry (DarAi/USDT/wNEAR are built-in). */
  resolveToken(ref: TokenRef, fallbackDecimals?: number): TokenInfo {
    return toTokenInfo(ref, fallbackDecimals);
  }

  /**
   * Compute a token amount equivalent to the given USD value
   * using the configured PriceProvider. Useful for showing a price
   * before creating the invoice.
   */
  async priceInToken(usd: number, token: TokenRef = DARAI): Promise<ConversionResult> {
    return usdToToken(usd, token, { priceProvider: this.priceProvider });
  }

  /** Convenience: priceInToken(usd, DARAI). */
  async priceInDarai(usd: number): Promise<ConversionResult> {
    return this.priceInToken(usd, DARAI);
  }

  /** Resolve the requested amount to raw minimal units + (optional) conversion. */
  private async resolveAmount(
    input: CreateInvoiceInput,
  ): Promise<{ amountRaw: string; conversion?: ConversionResult; token: TokenInfo }> {
    const token = toTokenInfo(input.token, input.fallbackDecimals);
    const a = input.amount;
    if ('raw' in a) {
      const s = typeof a.raw === 'bigint' ? a.raw.toString() : String(a.raw).trim();
      if (!/^\d+$/.test(s) || s === '0') {
        throw new Error(`amount.raw must be a positive digit string, got: ${JSON.stringify(a.raw)}`);
      }
      return { amountRaw: s, token };
    }
    if ('token' in a) {
      const big = parseAmount(a.token, token.decimals);
      if (big <= 0n) throw new Error('amount.token must be > 0');
      return { amountRaw: big.toString(), token };
    }
    if ('usd' in a) {
      const conv = await usdToToken(a.usd, token, {
        priceProvider: this.priceProvider,
        rounding: a.rounding ?? 'ceil',
      });
      if (conv.amountRawBig <= 0n) {
        throw new Error('amount.usd resolves to zero — increase the USD value');
      }
      return { amountRaw: conv.amountRaw, conversion: conv, token };
    }
    throw new Error('amount must include one of: raw, token, usd');
  }

  /**
   * Create a payment invoice.
   *
   * Returns the raw invoice plus convenience fields:
   *  - `payUrl` — browser link to give the customer (preferred for web).
   *  - `payTgUrl` — Telegram Mini App link (preferred for tg-bots).
   *  - `publicToken` — short id used in URLs and webhooks.
   */
  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const { amountRaw, conversion, token } = await this.resolveAmount(input);

    let expiresAt: string | undefined;
    if (input.expiresAt instanceof Date) {
      expiresAt = input.expiresAt.toISOString();
    } else if (typeof input.expiresAt === 'string' && input.expiresAt.trim()) {
      expiresAt = input.expiresAt.trim();
    } else if (typeof input.expiresInSec === 'number' && input.expiresInSec > 0) {
      expiresAt = new Date(Date.now() + input.expiresInSec * 1000).toISOString();
    }

    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (input.returnUrl && metadata.return_url == null) {
      metadata.return_url = input.returnUrl;
    }

    const res = await this.call<{
      invoice: YupPayInvoice;
      pay_url: string | null;
      pay_tg_url: string | null;
    }>('create_invoice', {
      app_id: input.appId ?? this.appId,
      token_contract_id: token.contractId,
      amount_raw: amountRaw,
      metadata,
      expires_at: expiresAt,
      public_base_url: input.publicBaseUrl ?? this.publicBaseUrl,
    });

    return {
      invoice: res.invoice,
      payUrl: res.pay_url,
      payTgUrl: res.pay_tg_url,
      publicToken: res.invoice.public_token,
      amountRaw: res.invoice.amount_raw,
      ...(conversion ? { conversion } : {}),
    };
  }

  /** Get a single invoice by its public token (preferred) or internal id. */
  async getInvoice(
    publicTokenOrId: string,
    opts: { byId?: boolean; appId?: string } = {},
  ): Promise<YupPayInvoice> {
    const params: Record<string, unknown> = { app_id: opts.appId ?? this.appId };
    if (opts.byId) params.invoice_id = publicTokenOrId;
    else params.public_token = publicTokenOrId;
    const res = await this.call<{ invoice: YupPayInvoice }>('get_invoice', params);
    return res.invoice;
  }

  /** List invoices (most recent first). */
  async listInvoices(input: ListInvoicesInput = {}): Promise<YupPayInvoice[]> {
    const res = await this.call<{ invoices: YupPayInvoice[] }>('list_invoices', {
      app_id: input.appId ?? this.appId,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
      status: input.status,
    });
    return res.invoices ?? [];
  }

  /** Convenience: poll an invoice until it reaches a terminal state or timeout. */
  async waitForInvoice(
    publicToken: string,
    opts: { intervalMs?: number; timeoutMs?: number; appId?: string } = {},
  ): Promise<YupPayInvoice> {
    const interval = Math.max(1_000, opts.intervalMs ?? 4_000);
    const timeout = opts.timeoutMs ?? 30 * 60 * 1000;
    const deadline = Date.now() + timeout;
    let last: YupPayInvoice | null = null;
    while (Date.now() < deadline) {
      last = await this.getInvoice(publicToken, opts.appId ? { appId: opts.appId } : {});
      if (last.status !== 'pending') return last;
      await new Promise((r) => setTimeout(r, interval));
    }
    if (last) return last;
    throw new Error(`Timeout waiting for invoice ${publicToken}`);
  }
}
