/**
 * Минимальный пример: магазин на Express, который:
 *  1. POST /checkout — создаёт счёт в YupPay (USD → DarAi по курсу) и возвращает ссылки.
 *  2. POST /yuppay/webhook — принимает уведомление об оплате с проверкой HMAC.
 *
 * Запуск:
 *   npm i express github:Se-La-Via/YupPay   (SDK пока не в npm-реестре)
 *   YUPPAY_API_KEY=yup_live_xxx YUPPAY_WEBHOOK_SECRET=whsec_xxx node server.mjs
 */
import express from 'express';
import { YupPayClient, verifyWebhookSignature, formatAmount, DARAI } from '@yuppay/sdk';

const app = express();
const yp = new YupPayClient({ apiKey: process.env.YUPPAY_API_KEY });

// Создание счёта: магазин принимает оплату в DarAi по курсу к USD.
app.post('/checkout', express.json(), async (req, res) => {
  const usd = Number(req.body?.usd ?? 9.99);
  const orderId = String(req.body?.orderId ?? `order-${Date.now()}`);
  try {
    const r = await yp.createInvoice({
      token: 'darai',
      amount: { usd },
      metadata: { orderId },
      returnUrl: `https://shop.example/orders/${orderId}`,
      expiresInSec: 15 * 60,
    });
    res.json({
      orderId,
      payUrl: r.payUrl,
      payTgUrl: r.payTgUrl,
      humanAmount: `${formatAmount(r.amountRaw, DARAI)} ${DARAI.symbol}`,
      rate: r.conversion?.unitUsdPrice,
      publicToken: r.publicToken,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

// Webhook от YupPay: ВАЖНО — сырое тело (express.raw), не express.json.
app.post(
  '/yuppay/webhook',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const result = await verifyWebhookSignature({
      rawBody: req.body,
      signatureHeader: req.header('x-yuppay-signature'),
      secret: process.env.YUPPAY_WEBHOOK_SECRET,
    });
    if (!result.valid) return res.status(400).json({ error: result.reason });

    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'invoice.paid') {
      // TODO: пометить заказ оплаченным, отгрузить товар и т.п.
      console.log('paid:', event.invoice?.public_token);
    }
    res.json({ ok: true });
  },
);

app.listen(3000, () => console.log('http://localhost:3000'));
