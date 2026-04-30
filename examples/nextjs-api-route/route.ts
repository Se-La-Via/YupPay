// Next.js App Router API route: /app/api/yuppay/checkout/route.ts
// и /app/api/yuppay/webhook/route.ts
//
// npm i @yuppay/sdk

import { NextRequest, NextResponse } from 'next/server';
import { YupPayClient, verifyWebhookSignature } from '@yuppay/sdk';

const yp = new YupPayClient({ apiKey: process.env.YUPPAY_API_KEY! });

// POST /api/yuppay/checkout
export async function POST(req: NextRequest) {
  const { usd, orderId } = await req.json();
  const r = await yp.createInvoice({
    token: 'darai',
    amount: { usd: Number(usd) },
    metadata: { orderId },
    returnUrl: `https://shop.example/orders/${orderId}`,
    expiresInSec: 15 * 60,
  });
  return NextResponse.json({
    payUrl: r.payUrl,
    payTgUrl: r.payTgUrl,
    publicToken: r.publicToken,
  });
}

// POST /api/yuppay/webhook  — отдельным route.ts с такой логикой:
export async function webhook(req: NextRequest) {
  const raw = await req.text();
  const r = await verifyWebhookSignature({
    rawBody: raw,
    signatureHeader: req.headers.get('x-yuppay-signature'),
    secret: process.env.YUPPAY_WEBHOOK_SECRET!,
  });
  if (!r.valid) return new NextResponse(r.reason, { status: 400 });

  const event = JSON.parse(raw);
  // ... обработать event.event === 'invoice.paid'
  return NextResponse.json({ ok: true });
}
