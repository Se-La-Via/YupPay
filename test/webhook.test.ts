import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../src/webhook.js';

function sign(secret: string, body: string, t: number): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_1234567890';
  const body = JSON.stringify({ event: 'invoice.paid', invoice: { public_token: 'abc' } });

  it('accepts a valid signature', async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = sign(secret, body, t);
    const r = await verifyWebhookSignature({ rawBody: body, signatureHeader: header, secret });
    expect(r.valid).toBe(true);
  });

  it('rejects tampered body', async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = sign(secret, body, t);
    const r = await verifyWebhookSignature({
      rawBody: body + 'X',
      signatureHeader: header,
      secret,
    });
    expect(r.valid).toBe(false);
  });

  it('rejects wrong secret', async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = sign('whsec_other', body, t);
    const r = await verifyWebhookSignature({ rawBody: body, signatureHeader: header, secret });
    expect(r.valid).toBe(false);
  });

  it('rejects expired timestamp outside tolerance', async () => {
    const old = Math.floor(Date.now() / 1000) - 10_000;
    const header = sign(secret, body, old);
    const r = await verifyWebhookSignature({
      rawBody: body,
      signatureHeader: header,
      secret,
      toleranceSec: 300,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/timestamp/);
  });

  it('disables tolerance check when toleranceSec=0', async () => {
    const old = Math.floor(Date.now() / 1000) - 10_000;
    const header = sign(secret, body, old);
    const r = await verifyWebhookSignature({
      rawBody: body,
      signatureHeader: header,
      secret,
      toleranceSec: 0,
    });
    expect(r.valid).toBe(true);
  });

  it('handles bytes (Uint8Array) bodies', async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = sign(secret, body, t);
    const r = await verifyWebhookSignature({
      rawBody: new TextEncoder().encode(body),
      signatureHeader: header,
      secret,
    });
    expect(r.valid).toBe(true);
  });

  it('rejects missing or malformed header', async () => {
    expect(
      (await verifyWebhookSignature({ rawBody: body, signatureHeader: '', secret })).valid,
    ).toBe(false);
    expect(
      (await verifyWebhookSignature({ rawBody: body, signatureHeader: 'garbage', secret })).valid,
    ).toBe(false);
  });
});
