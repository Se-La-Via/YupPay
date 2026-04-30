import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatAmountExact,
  parseAmount,
  parseAmountSafe,
  rawToDecimalString,
  toAmountRaw,
  THIN_SPACE,
} from '../src/amount.js';
import { DARAI, USDT } from '../src/tokens.js';

describe('parseAmount', () => {
  it('parses comma decimals into raw bigint', () => {
    expect(parseAmount('1,5', 6)).toBe(1_500_000n);
    expect(parseAmount('1.5', 6)).toBe(1_500_000n);
  });
  it('handles thousand separators (spaces)', () => {
    expect(parseAmount('1 000,5', 2)).toBe(100_050n);
  });
  it('returns null on garbage via safe variant', () => {
    expect(parseAmountSafe('abc', 6)).toBeNull();
    expect(parseAmountSafe('', 6)).toBeNull();
    expect(parseAmountSafe('1,2,3', 6)).toBeNull();
  });
  it('handles 18 decimals (DarAi) without precision loss', () => {
    expect(parseAmount('1', 18)).toBe(10n ** 18n);
    expect(parseAmount('0,000000000000000001', 18)).toBe(1n);
  });
  it('truncates excess fraction digits (does not round up)', () => {
    expect(parseAmount('1,9999', 2)).toBe(199n);
  });
  it('rejects fractions for 0-decimals tokens', () => {
    expect(parseAmountSafe('1,5', 0)).toBeNull();
    expect(parseAmountSafe('1', 0)).toBe(1n);
  });
  it('toAmountRaw returns string', () => {
    expect(toAmountRaw('2,5', USDT)).toBe('2500000');
    expect(toAmountRaw('1', DARAI)).toBe('1000000000000000000');
  });
});

describe('formatAmount', () => {
  it('formats DarAi with default 2 fraction digits and narrow-space groups', () => {
    const out = formatAmount('1234567890000000000000', DARAI);
    expect(out).toBe(`1${THIN_SPACE}234,57`);
  });
  it('formats USDT with 6 decimals', () => {
    expect(formatAmount('12500000', USDT)).toBe('12,50');
    expect(formatAmount('12500000', USDT, { trimTrailingZeros: true })).toBe('12,5');
  });
  it('rounds half-up', () => {
    // 1.005 USDT (decimals 6) → 1.01 with 2 fraction digits
    expect(formatAmount('1005000', USDT)).toBe('1,01');
    // 1.004 → 1.00
    expect(formatAmount('1004000', USDT)).toBe('1,00');
  });
  it('respects custom fraction digits', () => {
    expect(formatAmount('1234567', USDT, { fractionDigits: 4 })).toBe('1,2346');
    expect(formatAmount('1000000', USDT, { fractionDigits: 0 })).toBe('1');
  });
  it('handles negative bigint', () => {
    expect(formatAmount(-1500000n, USDT)).toBe('-1,50');
  });
  it('groups large integer parts', () => {
    const oneMillion = (10n ** 6n) * (10n ** 18n);
    expect(formatAmount(oneMillion, DARAI)).toBe(
      `1${THIN_SPACE}000${THIN_SPACE}000,00`,
    );
  });
});

describe('formatAmountExact', () => {
  it('keeps full precision and trims trailing zeros', () => {
    expect(formatAmountExact('1234567', USDT)).toBe('1,234567');
    expect(formatAmountExact('1000000', USDT)).toBe('1');
  });
  it('produces the same human value parseAmount round-trips', () => {
    const human = '0,123456';
    const raw = parseAmount(human, 6);
    expect(formatAmountExact(raw, USDT)).toBe(human);
  });
});

describe('rawToDecimalString', () => {
  it('returns plain decimal without separators', () => {
    expect(rawToDecimalString('1500000', 6)).toBe('1.5');
    expect(rawToDecimalString('1000000', 6)).toBe('1');
    expect(rawToDecimalString('1', 6)).toBe('0.000001');
  });
});
