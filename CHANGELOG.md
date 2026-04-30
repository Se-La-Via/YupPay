# Changelog

Все значимые изменения проекта будут документироваться в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/), версионирование — [SemVer](https://semver.org/lang/ru/).

## [0.1.0] - 2026-04-30

### Added
- Первая публичная версия SDK.
- `YupPayClient`: `createInvoice`, `getInvoice`, `listInvoices`, `waitForInvoice`, `priceInDarai`/`priceInToken`.
- Пересчёт USD ↔ Darai/USDT через `api.ref.finance/list-token-price` с кэшем 60 секунд (`RefPriceProvider`, `PriceProvider` интерфейс для DI).
- Точная работа с суммами через `bigint`: `parseAmount`, `formatAmount`, `formatAmountExact`, `toAmountRaw`, `rawToDecimalString`.
- Форматирование сумм по ru-локали: разделитель — узкий неразрывный пробел, десятичный — запятая, по умолчанию 2 знака после запятой, half-up.
- Проверка подписи webhook (`verifyWebhookSignature`, HMAC-SHA256) с защитой от replay через `toleranceSec`.
- Веб-компонент `<yuppay-button>` для no-code/static сайтов.
- CLI `yuppay`: `price`, `format`, `create-invoice`, `get-invoice`, `usd-to-token`.
- 29 unit-тестов, типы TypeScript, dual ESM/CJS сборка через tsup.
