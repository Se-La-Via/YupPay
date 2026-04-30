import { describe, expect, it } from 'vitest';
import { usdToToken, tokenToUsd } from '../src/convert.js';
import { DARAI, USDT } from '../src/tokens.js';
import type { PriceProvider } from '../src/price.js';

function fixedPriceProvider(prices: Record<string, number>): PriceProvider {
  return {
    async getUsdPrice(id) {
      return prices[id] ?? null;
    },
  };
}

describe('usdToToken', () => {
  it('converts $10 at $0.20/Darai to 50 Darai (raw 50e18)', async () => {
    const provider = fixedPriceProvider({ 'darai.tkn.near': 0.2 });
    const r = await usdToToken(10, DARAI, { priceProvider: provider });
    expect(r.amountRawBig).toBe(50n * 10n ** 18n);
    expect(r.amountHuman).toBe('50,00');
    expect(r.unitUsdPrice).toBe(0.2);
  });

  it('rounds up by default (favor merchant)', async () => {
    const provider = fixedPriceProvider({ 'darai.tkn.near': 0.3 });
    const r = await usdToToken(1, DARAI, { priceProvider: provider });
    // $1 / $0.30 = 3.333... → ceil → at least covers
    const floor = (10n ** 18n) * 3n + (10n ** 18n) / 3n;
    expect(r.amountRawBig).toBeGreaterThanOrEqual(floor);
  });

  it('respects rounding=floor', async () => {
    const provider = fixedPriceProvider({ 'darai.tkn.near': 0.3 });
    const ceil = await usdToToken(1, DARAI, { priceProvider: provider, rounding: 'ceil' });
    const floor = await usdToToken(1, DARAI, { priceProvider: provider, rounding: 'floor' });
    expect(ceil.amountRawBig).toBeGreaterThan(floor.amountRawBig);
  });

  it('throws when no price is available', async () => {
    const provider = fixedPriceProvider({});
    await expect(usdToToken(1, DARAI, { priceProvider: provider })).rejects.toThrow(/No USD price/);
  });

  it('uses unitUsdPrice override without calling provider', async () => {
    const r = await usdToToken(2, USDT, { unitUsdPrice: 1 });
    // $2 at $1/USDT → 2 USDT (6 decimals) = 2_000_000
    expect(r.amountRawBig).toBe(2_000_000n);
  });
});

describe('tokenToUsd', () => {
  it('converts raw token amount to USD', async () => {
    const provider = fixedPriceProvider({ 'darai.tkn.near': 0.2 });
    const usd = await tokenToUsd(50n * 10n ** 18n, DARAI, { priceProvider: provider });
    expect(usd).toBeCloseTo(10, 6);
  });
});
