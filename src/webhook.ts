/**
 * Webhook signature verification.
 *
 * YupPay signs every webhook delivery with HMAC-SHA256:
 *
 *   X-YupPay-Signature: t=<unix-seconds>,v1=<hex>
 *
 *   v1 = HMAC_SHA256(secret, "${t}.${rawBody}")
 *
 * Always pass the RAW request body (string or Uint8Array) — JSON.stringify
 * of the parsed body changes whitespace and may break the signature.
 */

export type VerifyWebhookInput = {
  /** Raw request body bytes. Pass req.rawBody / await req.text() — never JSON.stringify(req.body). */
  rawBody: string | Uint8Array;
  /** Value of the `X-YupPay-Signature` header. */
  signatureHeader: string | null | undefined;
  /** App webhook signing secret (`whsec_...` / `yup_whsec_...` / `ypp_whsec_...`). */
  secret: string;
  /**
   * Maximum allowed clock skew between sender and receiver, in seconds.
   * Default: 300 (5 minutes). Pass 0 to disable the check (not recommended).
   */
  toleranceSec?: number;
  /** Override "now" for tests. */
  now?: () => number;
};

export type VerifyWebhookResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: string };

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

function toBytes(v: string | Uint8Array): Uint8Array {
  if (v instanceof Uint8Array) return v;
  return new TextEncoder().encode(v);
}

async function hmacSha256Hex(secret: string, payload: Uint8Array): Promise<string> {
  // Prefer Node crypto when available (faster, deterministic on workers).
  try {
    // dynamic import — keeps the bundle slim for browser builds
    const nodeCrypto = await import('node:crypto').catch(() => null as unknown as typeof import('node:crypto') | null);
    if (nodeCrypto && typeof nodeCrypto.createHmac === 'function') {
      return nodeCrypto.createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex');
    }
  } catch {
    /* fall through to WebCrypto */
  }
  const subtle = (globalThis.crypto && globalThis.crypto.subtle) || null;
  if (!subtle) {
    throw new Error('No crypto.subtle available — upgrade Node or run in a modern runtime.');
  }
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', key, payload as BufferSource);
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function parseSignatureHeader(header: string): { t: string | null; v1: string[] } {
  const parts = header.split(',').map((p) => p.trim()).filter(Boolean);
  let t: string | null = null;
  const v1: string[] = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    if (k === 't' && /^\d+$/.test(v)) t = v;
    else if (k === 'v1') v1.push(v);
  }
  return { t, v1 };
}

/**
 * Verify a webhook signature. Returns `{ valid: true, timestamp }` on success,
 * or `{ valid: false, reason }` describing why it failed.
 *
 * Throws only on programmer errors (missing secret).
 */
export async function verifyWebhookSignature(input: VerifyWebhookInput): Promise<VerifyWebhookResult> {
  if (!input.secret) throw new Error('verifyWebhookSignature: secret is required');
  const header = (input.signatureHeader ?? '').trim();
  if (!header) return { valid: false, reason: 'missing signature header' };
  const { t, v1 } = parseSignatureHeader(header);
  if (!t || v1.length === 0) return { valid: false, reason: 'malformed signature header' };

  const tolerance = input.toleranceSec ?? 300;
  if (tolerance > 0) {
    const now = Math.floor((input.now ? input.now() : Date.now()) / 1000);
    const ts = parseInt(t, 10);
    if (!Number.isFinite(ts)) return { valid: false, reason: 'invalid timestamp' };
    if (Math.abs(now - ts) > tolerance) {
      return { valid: false, reason: `timestamp outside tolerance (Δ=${Math.abs(now - ts)}s)` };
    }
  }

  const bodyBytes = toBytes(input.rawBody);
  const tBytes = new TextEncoder().encode(`${t}.`);
  const payload = new Uint8Array(tBytes.length + bodyBytes.length);
  payload.set(tBytes, 0);
  payload.set(bodyBytes, tBytes.length);

  const expected = await hmacSha256Hex(input.secret, payload);
  for (const candidate of v1) {
    if (candidate.length === expected.length && timingSafeEqualStr(candidate.toLowerCase(), expected)) {
      return { valid: true, timestamp: parseInt(t, 10) };
    }
  }
  return { valid: false, reason: 'signature mismatch' };
}

/**
 * Boolean shortcut. Prefer the full result version above so you can log
 * the failure reason during integration.
 */
export async function isWebhookValid(input: VerifyWebhookInput): Promise<boolean> {
  return (await verifyWebhookSignature(input)).valid;
}
