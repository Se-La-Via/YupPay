/**
 * Amount conversion and formatting helpers.
 *
 * Design rules:
 * - All amounts inside the SDK are bigint (raw minimal units).
 * - No floating point arithmetic: human values are parsed via integer math.
 * - Display defaults: thousand separator = NARROW NO-BREAK SPACE (U+202F),
 *   decimal separator = comma, max 2 fraction digits, half-up rounding.
 * - `formatAmountExact` keeps full precision (for balances / "max" buttons).
 */

import { toTokenInfo, type TokenRef } from './tokens.js';

/** Narrow no-break space — used as thousand separator. */
export const THIN_SPACE = ' ';

export type FormatOptions = {
  /** Override decimals (otherwise resolved from token). */
  decimals?: number;
  /** Number of fraction digits to show. Default: 2. */
  fractionDigits?: number;
  /** Thousand separator. Default: narrow no-break space. */
  thousandSep?: string;
  /** Decimal separator. Default: ','. */
  decimalSep?: string;
  /** If true — drop trailing zeros in fraction (e.g. "1,50" → "1,5"). Default: false. */
  trimTrailingZeros?: boolean;
};

function isDigits(s: string): boolean {
  return /^\d+$/.test(s);
}

/**
 * Convert a human input (e.g. "12,5", "12.5", " 1 234,56 ") to raw bigint
 * using the provided decimals. Throws on invalid input.
 *
 * Excess fraction digits are TRUNCATED (not rounded) to avoid surprising
 * the user — UI should validate length before calling, or use
 * `parseAmountSafe` which returns null instead of throwing.
 */
export function parseAmount(human: string, decimals: number): bigint {
  const r = parseAmountSafe(human, decimals);
  if (r == null) throw new Error(`Invalid amount: ${JSON.stringify(human)}`);
  return r;
}

export function parseAmountSafe(human: string, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 128) return null;
  if (typeof human !== 'string') return null;
  const norm = human
    .replace(/\s/g, '')
    .replace(/ /g, '')
    .replace(/,/g, '.')
    .trim();
  if (!norm) return null;
  const m = norm.match(/^(\d*)(?:\.(\d*))?$/);
  if (!m) return null;
  let intStr = m[1] ?? '';
  let fracStr = (m[2] ?? '').slice(0, decimals);
  if (intStr === '' && fracStr === '') return null;
  if (intStr === '') intStr = '0';
  if (decimals === 0 && (m[2]?.length ?? 0) > 0) return null;
  fracStr = decimals > 0 ? fracStr.padEnd(decimals, '0') : '';
  if (!isDigits(intStr) || (fracStr && !isDigits(fracStr))) return null;
  try {
    const intVal = BigInt(intStr);
    const fracVal = decimals > 0 && fracStr ? BigInt(fracStr) : 0n;
    return intVal * 10n ** BigInt(decimals) + fracVal;
  } catch {
    return null;
  }
}

/** Convenience: parse human amount for a known token. */
export function parseTokenAmount(human: string, token: TokenRef, fallbackDecimals?: number): bigint {
  const t = toTokenInfo(token, fallbackDecimals);
  return parseAmount(human, t.decimals);
}

export function toAmountRaw(human: string, token: TokenRef, fallbackDecimals?: number): string {
  return parseTokenAmount(human, token, fallbackDecimals).toString();
}

/** Group integer digits by 3 with the given separator. Negative input is preserved. */
function groupInteger(intDigits: string, sep: string): string {
  const neg = intDigits.startsWith('-');
  const d = neg ? intDigits.slice(1) : intDigits;
  const parts: string[] = [];
  for (let i = d.length; i > 0; i -= 3) {
    parts.unshift(d.slice(Math.max(0, i - 3), i));
  }
  return (neg ? '-' : '') + parts.join(sep);
}

function normalizeRaw(amountRaw: string | bigint | number): bigint {
  if (typeof amountRaw === 'bigint') return amountRaw;
  if (typeof amountRaw === 'number') {
    if (!Number.isFinite(amountRaw) || !Number.isInteger(amountRaw)) {
      throw new Error('amountRaw number must be a finite integer');
    }
    return BigInt(amountRaw);
  }
  if (typeof amountRaw !== 'string') throw new Error('amountRaw must be string | bigint | number');
  const s = amountRaw.replace(/[\s,_]/g, '').trim();
  if (!/^-?\d+$/.test(s)) throw new Error(`Invalid raw amount: ${JSON.stringify(amountRaw)}`);
  return BigInt(s);
}

/**
 * Format a raw amount with rounding to `fractionDigits` (default 2).
 * Uses half-up rounding. Adds thousand separators and a decimal separator.
 */
export function formatAmount(
  amountRaw: string | bigint | number,
  tokenOrOpts: TokenRef | FormatOptions,
  maybeOpts?: FormatOptions,
): string {
  let token: TokenRef | null = null;
  let opts: FormatOptions = {};
  if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null && !('contractId' in tokenOrOpts)) {
    opts = tokenOrOpts as FormatOptions;
  } else {
    token = tokenOrOpts as TokenRef;
    opts = maybeOpts ?? {};
  }

  const decimals = opts.decimals ?? (token ? toTokenInfo(token, opts.decimals).decimals : null);
  if (decimals == null || !Number.isInteger(decimals) || decimals < 0) {
    throw new Error('decimals required (pass a token or { decimals })');
  }
  const fractionDigits = opts.fractionDigits ?? 2;
  if (fractionDigits < 0 || fractionDigits > 36) {
    throw new Error('fractionDigits out of range');
  }
  const thousandSep = opts.thousandSep ?? THIN_SPACE;
  const decimalSep = opts.decimalSep ?? ',';

  const raw = normalizeRaw(amountRaw);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;

  const scale = 10n ** BigInt(decimals);
  const mult = 10n ** BigInt(fractionDigits);
  const half = scale / 2n;
  // Multiply first to avoid losing fraction info, then half-up round.
  const rounded = (abs * mult + half) / scale;
  const whole = rounded / mult;
  const frac = rounded % mult;

  const wholeStr = groupInteger(whole.toString(), thousandSep);
  let out: string;
  if (fractionDigits === 0) {
    out = wholeStr;
  } else {
    let fracStr = frac.toString().padStart(fractionDigits, '0');
    if (opts.trimTrailingZeros) fracStr = fracStr.replace(/0+$/, '');
    out = fracStr ? `${wholeStr}${decimalSep}${fracStr}` : wholeStr;
  }
  return neg ? `-${out}` : out;
}

/**
 * Exact formatting without rounding — keeps every non-zero fraction digit
 * up to `decimals`. Use for balance display / "max" buttons.
 */
export function formatAmountExact(
  amountRaw: string | bigint | number,
  tokenOrOpts: TokenRef | FormatOptions,
  maybeOpts?: FormatOptions,
): string {
  let token: TokenRef | null = null;
  let opts: FormatOptions = {};
  if (typeof tokenOrOpts === 'object' && tokenOrOpts !== null && !('contractId' in tokenOrOpts)) {
    opts = tokenOrOpts as FormatOptions;
  } else {
    token = tokenOrOpts as TokenRef;
    opts = maybeOpts ?? {};
  }
  const decimals = opts.decimals ?? (token ? toTokenInfo(token, opts.decimals).decimals : null);
  if (decimals == null) throw new Error('decimals required');
  const thousandSep = opts.thousandSep ?? THIN_SPACE;
  const decimalSep = opts.decimalSep ?? ',';

  const raw = normalizeRaw(amountRaw);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;

  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;

  const wholeStr = groupInteger(whole.toString(), thousandSep);
  let out: string;
  if (decimals === 0) {
    out = wholeStr;
  } else {
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    out = fracStr ? `${wholeStr}${decimalSep}${fracStr}` : wholeStr;
  }
  return neg ? `-${out}` : out;
}

/**
 * Convert raw bigint to plain decimal string (no separators, no rounding).
 * Useful for sending into other libs.
 */
export function rawToDecimalString(amountRaw: string | bigint | number, decimals: number): string {
  const raw = normalizeRaw(amountRaw);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  let out: string;
  if (decimals === 0) {
    out = whole.toString();
  } else {
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    out = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  }
  return neg ? `-${out}` : out;
}
