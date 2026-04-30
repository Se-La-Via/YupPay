# @yuppay/sdk

Официальный SDK для приёма оплаты через **YupPay** — платежи в токенах **DarAi** или **USDT** в сети NEAR (NEP-141).
Подключение к мерчанту в 5 строк, без зависимостей от Supabase SDK или near-api-js.

- Серверный + браузерный (универсальный пакет, ESM/CJS, TypeScript-типы).
- Курс DarAi/USDT берётся с [api.ref.finance](https://api.ref.finance/list-token-price) — счёт можно выставлять сразу в USD, SDK сам пересчитает в Darai по актуальному курсу.
- Все суммы внутри — `bigint` (минимальные единицы), без потерь точности на JS-числах.
- Красивое форматирование: разделители разрядов, не более 2 знаков после запятой, корректный учёт `decimals` токена.
- Проверка подписи webhook (HMAC-SHA256) — встроена.
- Готовый веб-компонент `<yuppay-button>` для вставки кнопки оплаты на любой сайт.
- CLI `yuppay` для быстрого теста без кода.

> **Поддерживаемые токены по умолчанию:** Darai (`darai.tkn.near`, 18 decimals), USDT (`usdt.tether-token.near`, 6 decimals). Можно использовать любой NEP-141, передав `decimals` явно.

---

## Установка

```bash
npm i @yuppay/sdk
# или
pnpm add @yuppay/sdk
# или
bun add @yuppay/sdk
```

Требует **Node ≥ 18** (используется встроенный `fetch`). В Bun, Deno, Cloudflare Workers, Vercel Edge — работает «из коробки».

---

## Быстрый старт (сервер)

```ts
import { YupPayClient } from '@yuppay/sdk';

const yp = new YupPayClient({
  apiKey: process.env.YUPPAY_API_KEY!, // ypp_live_xxx
});

// Выставляем счёт в USD — SDK пересчитает в Darai по курсу ref.finance.
const invoice = await yp.createInvoice({
  token: 'darai',
  amount: { usd: 9.99 },
  metadata: { orderId: 'order-42' },
  returnUrl: 'https://shop.example/orders/42',
  expiresInSec: 15 * 60,
});

console.log(invoice.payUrl);    // → https://www.yupland.io/pay/i/<token>
console.log(invoice.payTgUrl);  // → https://t.me/<bot>?startapp=i_<token>
```

Перенаправьте покупателя на `payUrl` (для веба) или `payTgUrl` (для Telegram-бота). YupPay примет оплату, статус счёта станет `paid` и придёт webhook.

### Альтернативные форматы суммы

```ts
// 1) USD → Darai по курсу
yp.createInvoice({ token: 'darai', amount: { usd: 9.99 } });

// 2) Сразу в токенах (человеко-читаемо)
yp.createInvoice({ token: 'darai', amount: { token: '12,5' } });

// 3) В минимальных единицах
yp.createInvoice({ token: 'usdt', amount: { raw: '12500000' } }); // 12.50 USDT
```

---

## Получение курса и форматирование

```ts
import {
  getDaraiUsdPrice,
  formatAmount,
  formatAmountExact,
  parseAmount,
  toAmountRaw,
  DARAI,
  USDT,
} from '@yuppay/sdk';

await getDaraiUsdPrice();           // → 0.0123  (USD за 1 Darai, кэш 60с)

formatAmount('1234567890000000000000', DARAI);
// → '1 234,57'   (узкий пробел, запятая, 2 знака, half-up)

formatAmount('12500000', USDT, { trimTrailingZeros: true });
// → '12,5'

formatAmountExact('1', USDT);       // → '0,000001' (без округления)

parseAmount('12,5', 6);              // → 12500000n  (bigint, точно)
toAmountRaw('12,5', USDT);           // → '12500000'
```

Дефолты форматирования соответствуют требованиям ТЗ:
- разделитель разрядов — узкий неразрывный пробел ` `,
- десятичный — запятая,
- максимум **2 знака** после запятой (опц. `fractionDigits`),
- округление **half-up**,
- учёт `decimals` токена (18 для Darai, 6 для USDT, 24 для wNEAR).

---

## Webhook: проверка подписи

YupPay подписывает каждый webhook заголовком:

```
X-YupPay-Signature: t=<unix-сек>,v1=<hex>
```

```ts
import { verifyWebhookSignature } from '@yuppay/sdk';

const result = await verifyWebhookSignature({
  rawBody: await req.text(),                       // ВАЖНО: raw body, не JSON.stringify!
  signatureHeader: req.headers.get('x-yuppay-signature'),
  secret: process.env.YUPPAY_WEBHOOK_SECRET!,      // whsec_xxx из кабинета
  toleranceSec: 300,                                // окно по умолчанию 5 мин
});

if (!result.valid) return new Response(result.reason, { status: 400 });
// → result.timestamp — время отправки в секундах
```

В Express нужно подключить `express.raw()` именно для роута webhook — `express.json()` нельзя, иначе тело пересоберётся и подпись не сойдётся.

---

## Веб-компонент `<yuppay-button>`

Подходит для лендингов и no-code сайтов. Создавать счёт **всё равно нужно на сервере** — кнопка только редиректит на готовую ссылку.

```html
<script type="module" src="https://unpkg.com/@yuppay/sdk/dist/browser-button.js"></script>

<yuppay-button
  pay-url="https://www.yupland.io/pay/i/abcdef..."
  pay-tg-url="https://t.me/Yup_Ai_bot?startapp=i_abcdef..."
  label="Оплатить через YupPay">
</yuppay-button>
```

Компонент сам определит контекст:
- внутри Telegram WebApp откроет `pay-tg-url` через `Telegram.WebApp.openTelegramLink`,
- в обычном браузере откроет `pay-url` в новой вкладке.

События: `yuppay:open`, `yuppay:error`.

---

## CLI

```bash
yuppay price --token darai
yuppay format 1234567890000000000000 --token darai      # → "1 234,57 Darai"

export YUPPAY_API_KEY=ypp_live_xxx
yuppay create-invoice --usd 9.99 --return-url https://shop.example/order/42
yuppay get-invoice <publicToken>
```

---

## API клиента

| Метод | Назначение |
| --- | --- |
| `new YupPayClient({ apiKey, baseUrl?, publicBaseUrl?, priceProvider? })` | Конструктор. |
| `priceInDarai(usd)` / `priceInToken(usd, token)` | Конвертация USD → токен по курсу (без создания счёта). |
| `createInvoice({ token, amount, metadata?, returnUrl?, expiresInSec?, expiresAt? })` | Создаёт счёт. |
| `getInvoice(publicToken)` | Возвращает счёт. |
| `listInvoices({ limit?, offset?, status? })` | Список счётов. |
| `waitForInvoice(publicToken, { intervalMs?, timeoutMs? })` | Polling до терминального статуса. |
| `call(action, params)` | Низкоуровневый вызов любого `action` API. |

Ошибки бросаются как `YupPayApiError` с полями `status`, `code`, `hint`.

---

## Формирование цены: USD → Darai

```ts
const yp = new YupPayClient({ apiKey: ... });
const r = await yp.priceInDarai(9.99);
// {
//   amountRaw:    '811382113821138211382',
//   amountRawBig: 811382113821138211382n,
//   amountHuman:  '811,38',
//   unitUsdPrice: 0.01231,
//   usd:          9.99,
//   token:        { contractId: 'darai.tkn.near', decimals: 18, symbol: 'Darai' },
// }
```

По умолчанию используется округление **`ceil`** — мерчант никогда не получит меньше заявленной USD-стоимости из-за округления вниз. Можно переопределить:

```ts
yp.priceInToken(9.99, 'darai').then(r => r);                 // ceil
usdToToken(9.99, 'darai', { rounding: 'round' });            // ближайшее
usdToToken(9.99, 'darai', { rounding: 'floor' });            // вниз
usdToToken(9.99, 'darai', { unitUsdPrice: 0.012 });          // фиксированная цена (не дёргать ref.finance)
```

### Кастомный источник цен

Подключите Redis/KV или офлайн-источник:

```ts
import { YupPayClient, type PriceProvider } from '@yuppay/sdk';

const myProvider: PriceProvider = {
  async getUsdPrice(contractId) {
    return await redis.get(`price:${contractId}`);
  },
};

const yp = new YupPayClient({ apiKey, priceProvider: myProvider });
```

---

## Поддержка произвольных NEP-141 токенов

```ts
import { YupPayClient, type TokenInfo } from '@yuppay/sdk';

const MY_TOKEN: TokenInfo = {
  contractId: 'my.token.near',
  decimals: 8,
  symbol: 'MYT',
};

await yp.createInvoice({ token: MY_TOKEN, amount: { token: '12,5' } });
```

> Важно: контракт должен быть включён в `YUPPAY_ALLOWED_TOKEN_CONTRACTS` в настройках развёртывания YupPay (если whitelist задан).

---

## Самохостинг и кастомный домен

```ts
new YupPayClient({
  apiKey,
  baseUrl: 'https://my-yuppay.supabase.co',     // свой Supabase-проект
  publicBaseUrl: 'https://pay.myshop.com',      // куда вести покупателя (pay_url)
});
```

---

## Безопасность

- **Никогда** не вшивайте `ypp_live_*` в браузерный JS — создавайте счёт только на сервере.
- В webhook-эндпоинте всегда работайте с **сырым телом** (`req.text()` / `express.raw()`), иначе подпись не сойдётся.
- Включите проверку `toleranceSec` (по умолчанию 5 мин) — защищает от replay-атак.
- Храните `YUPPAY_WEBHOOK_SECRET` отдельно от `YUPPAY_API_KEY`. Это разные секреты с разными префиксами.

---

## Лицензия

[MIT](./LICENSE) © Se-La-Via / YupPay
