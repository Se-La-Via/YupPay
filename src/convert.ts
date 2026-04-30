/**
 * USD ⇄ token conversion using a PriceProvider.
 *
 * The conversion uses integer-only math against a fixed precision
 * (USD_PRECISION = 6), so results are deterministic and free of
 * floating-point drift.
 */

import { toTokenInfo, type TokenRef, DARAI } from './tokens.js';
import { defaultPriceProvider, type PriceProvider } from './price.js';

/** Internal precision for USD math: 6 decimals (1 USD = 1_000_000 micro-USD). */
const USD_PRECISION = 6;
const USD_SCALE = 10n ** BigInt(USD_PRECISION);

function usdToMicroBig(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`Invalid USD value: ${usd}`);
  }
  // Round to USD_PRECISION digits via string to avoid binary float drift.
  const rounded = (Math.round(usd * Number(USD_SCALE))).toString();
  return BigInt(rounded);
}

function priceToMicroBig(price: number): bigint {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid price: ${price}`);
  }
  return BigInt(Math.round(price * Number(USD_SCALE)));
}

export type ConversionResult = {
  /** Raw token amount (minimal units), as decimal string. */
  amountRaw: string;
  /** Same value as bigint. */
  amountRawBig: bigint;
  /** Human-readable token amount, formatted with default rules (max 2 fraction digits). */
  amountHuman: string;
  /** USD price per 1 token used for the conversion. */
  unitUsdPrice: number;
  /** Original USD value. */
  usd: number;
  /** Token info used. */
  token: { contractId: string; decimals: number; symbol: string };
};

export type ConvertOptions = {
  /** Override the price provider (e.g. mock in tests). */
  priceProvider?: PriceProvider;
  /** Force unit price (skip the provider). */
  unitUsdPrice?: number;
  /** Round mode for the resulting raw amount. Default: 'ceil' (favor merchant). */
  rounding?: 'ceil' | 'round' | 'floor';
  /** Override decimals for unknown tokens. */
  fallbackDecimals?: number;
};

/**
 * Convert a USD amount into a raw token amount using the live price.
 *
 * Default rounding is `ceil` so the merchant never collects less than the
 * declared USD value due to truncation.
 */
export async function usdToToken(
  usd: number,
  token: TokenRef,
  opts: ConvertOptions = {},
): Promise<ConversionResult> {
  const t = toTokenInfo(token, opts.fallbackDecimals);
  const provider = opts.priceProvider ?? defaultPriceProvider;
  const unit = opts.unitUsdPrice ?? (await provider.getUsdPrice(t.contractId));
  if (unit == null || unit <= 0) {
    throw new Error(
      `No USD price available for ${t.contractId}. Pass { unitUsdPrice } explicitly.`,
    );
  }

  const usdMicro = usdToMicroBig(usd);
  const priceMicro = priceToMicroBig(unit);
  const tokenScale = 10n ** BigInt(t.decimals);

  // raw = (usdMicro * tokenScale) / priceMicro
  const numerator = usdMicro * tokenScale;
  const rounding = opts.rounding ?? 'ceil';
  let raw: bigint;
  if (rounding === 'ceil') {
    raw = (numerator + priceMicro - 1n) / priceMicro;
  } else if (rounding === 'floor') {
    raw = numerator / priceMicro;
  } else {
    raw = (numerator + priceMicro / 2n) / priceMicro;
  }

  const human = formatHumanForConvert(raw, t.decimals);

  return {
    amountRaw: raw.toString(),
    amountRawBig: raw,
    amountHuman: human,
    unitUsdPrice: unit,
    usd,
    token: { contractId: t.contractId, decimals: t.decimals, symbol: t.symbol },
  };
}

/** Convert a raw token amount into its USD value (number, may lose precision). */
export async function tokenToUsd(
  amountRaw: string | bigint,
  token: TokenRef,
  opts: ConvertOptions = {},
): Promise<number> {
  const t = toTokenInfo(token, opts.fallbackDecimals);
  const provider = opts.priceProvider ?? defaultPriceProvider;
  const unit = opts.unitUsdPrice ?? (await provider.getUsdPrice(t.contractId));
  if (unit == null || unit <= 0) {
    throw new Error(`No USD price available for ${t.contractId}.`);
  }
  const raw = typeof amountRaw === 'bigint' ? amountRaw : BigInt(String(amountRaw).trim());
  const tokenScale = 10n ** BigInt(t.decimals);
  // Approximate: raw / tokenScale * price. Done via string for stability.
  const wholeStr = (raw / tokenScale).toString();
  const fracStr = (raw % tokenScale).toString().padStart(t.decimals, '0');
  const num = parseFloat(`${wholeStr}.${fracStr}` || '0');
  return num * unit;
}

/** Shortcut for the most common case: USD → DarAi. */
export async function usdToDarai(usd: number, opts: ConvertOptions = {}): Promise<ConversionResult> {
  return usdToToken(usd, DARAI, opts);
}

function formatHumanForConvert(raw: bigint, decimals: number): string {
  // Inline mini-formatter to avoid a circular import with ./amount.
  const THIN_SPACE = ' ';
  const fractionDigits = 2;
  const scale = 10n ** BigInt(decimals);
  const mult = 10n ** BigInt(fractionDigits);
  const half = scale / 2n;
  const rounded = (raw * mult + half) / scale;
  const whole = rounded / mult;
  const frac = rounded % mult;
  const wholeDigits = whole.toString();
  const parts: string[] = [];
  for (let i = wholeDigits.length; i > 0; i -= 3) {
    parts.unshift(wholeDigits.slice(Math.max(0, i - 3), i));
  }
  const wholeStr = parts.join(THIN_SPACE);
  const fracStr = frac.toString().padStart(fractionDigits, '0');
  return `${wholeStr},${fracStr}`;
}
