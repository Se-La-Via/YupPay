/**
 * Built-in token registry.
 *
 * All amounts in the YupPay API are transmitted in raw minimal units
 * (a string of digits, no decimal separator). Token decimals are required
 * to convert between human-readable values and raw units.
 */

export type TokenInfo = {
  /** NEP-141 contract id on NEAR mainnet. */
  contractId: string;
  /** Number of decimals (e.g. 18 for DarAi, 6 for USDT). */
  decimals: number;
  /** Display ticker. */
  symbol: string;
  /** Optional alias for short references in SDK calls. */
  alias?: 'darai' | 'usdt' | 'wnear';
};

export const DARAI: TokenInfo = {
  contractId: 'darai.tkn.near',
  decimals: 18,
  symbol: 'Darai',
  alias: 'darai',
};

export const USDT: TokenInfo = {
  contractId: 'usdt.tether-token.near',
  decimals: 6,
  symbol: 'USDT',
  alias: 'usdt',
};

export const WNEAR: TokenInfo = {
  contractId: 'wrap.near',
  decimals: 24,
  symbol: 'wNEAR',
  alias: 'wnear',
};

export const BUILTIN_TOKENS: readonly TokenInfo[] = [DARAI, USDT, WNEAR];

const BY_KEY: Record<string, TokenInfo> = {};
for (const t of BUILTIN_TOKENS) {
  BY_KEY[t.contractId.toLowerCase()] = t;
  if (t.alias) BY_KEY[t.alias] = t;
  BY_KEY[t.symbol.toLowerCase()] = t;
}

/**
 * Resolve a token reference (alias / symbol / contract id) to TokenInfo.
 * Returns null for unknown contracts — caller may pass an explicit `decimals`.
 */
export function resolveToken(ref: string): TokenInfo | null {
  if (!ref) return null;
  const k = ref.trim().toLowerCase();
  return BY_KEY[k] ?? null;
}

export type TokenRef =
  | 'darai'
  | 'usdt'
  | 'wnear'
  | string
  | TokenInfo;

export function toTokenInfo(ref: TokenRef, fallbackDecimals?: number): TokenInfo {
  if (typeof ref === 'object' && ref) return ref;
  const found = resolveToken(ref);
  if (found) return found;
  if (typeof fallbackDecimals === 'number' && Number.isInteger(fallbackDecimals) && fallbackDecimals >= 0) {
    return {
      contractId: ref,
      decimals: fallbackDecimals,
      symbol: ref.split('.')[0] ?? ref,
    };
  }
  throw new Error(
    `Unknown token "${ref}". Pass a TokenInfo object with explicit decimals, ` +
      `or use one of: darai, usdt, wnear.`,
  );
}
