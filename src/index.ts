/**
 * @yuppay/sdk — public exports.
 *
 * Two layers:
 *   1. Stateless helpers (tokens, amount, price, convert, webhook)
 *      — work in any runtime, no API key needed.
 *   2. YupPayClient — HTTP client for invoice management; needs API key.
 */

export {
  DARAI,
  USDT,
  WNEAR,
  BUILTIN_TOKENS,
  resolveToken,
  toTokenInfo,
  type TokenInfo,
  type TokenRef,
} from './tokens.js';

export {
  THIN_SPACE,
  parseAmount,
  parseAmountSafe,
  parseTokenAmount,
  toAmountRaw,
  formatAmount,
  formatAmountExact,
  rawToDecimalString,
  type FormatOptions,
} from './amount.js';

export {
  REF_LIST_TOKEN_PRICE_URL,
  RefPriceProvider,
  defaultPriceProvider,
  getDaraiUsdPrice,
  getTokenUsdPrice,
  type PriceProvider,
  type RefPriceMap,
  type RefTokenPriceEntry,
  type RefPriceProviderOptions,
} from './price.js';

export {
  usdToToken,
  usdToDarai,
  tokenToUsd,
  type ConversionResult,
  type ConvertOptions,
} from './convert.js';

export {
  YupPayClient,
  YupPayApiError,
  DEFAULT_BASE_URL,
  SUPABASE_ANON_KEY_ENV_VAR,
  type YupPayClientOptions,
  type YupPayInvoice,
  type CreateInvoiceInput,
  type CreateInvoiceResult,
  type ListInvoicesInput,
} from './client.js';

export {
  verifyWebhookSignature,
  isWebhookValid,
  type VerifyWebhookInput,
  type VerifyWebhookResult,
} from './webhook.js';
