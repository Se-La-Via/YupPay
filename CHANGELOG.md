# Changelog

Все значимые изменения проекта будут документироваться в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/), версионирование — [SemVer](https://semver.org/lang/ru/).

## [0.2.0] - 2026-05-06

### Fixed (critical)
- **`DEFAULT_BASE_URL` теперь указывает на боевой Supabase-проект YupPay** (`https://jkjgpbawhxtafmwsrseb.supabase.co`). В 0.1.0 значение было от старого dev-стенда и не резолвилось в DNS — интеграции, не передавшие `baseUrl`, падали с `ENOTFOUND`. Это блокировало интеграцию мерчантов «из коробки».
- **Защита от 401 при включённом JWT-perimeter**: если самохост развернут с `verify_jwt = true`, теперь можно передать `supabaseAnonKey` в конструктор (или env `YUPPAY_SUPABASE_ANON_KEY`). Подробное сообщение об ошибке подскажет это.

### Added
- Опция `supabaseAnonKey: string | null` в `YupPayClient`. По умолчанию SDK не требует anon JWT — это нужно только для самохостинга с `verify_jwt = true`.
- Экспорт `SUPABASE_ANON_KEY_ENV_VAR` для типизированного доступа к имени env-переменной.

### Notes for production YupPay
Боевой `yuppay-api` шлюз развёрнут с `verify_jwt = false` (см. `supabase/config.toml`), поэтому интеграция требует **только** `apiKey` (=`x-yuppay-api-key`). Опция `supabaseAnonKey` нужна только при самохостинге с включённой проверкой JWT на шлюзе.

### Migration from 0.1.0
- Достаточно `npm i @yuppay/sdk@latest`. API не сломан, default base URL теперь правильный.

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
