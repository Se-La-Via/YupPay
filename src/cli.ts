/**
 * Minimal CLI for quick testing without writing code.
 *
 *   yuppay create-invoice --usd 9.99 --token darai
 *   yuppay create-invoice --token-amount 12.5 --token usdt
 *   yuppay get-invoice <publicToken>
 *   yuppay price [--token darai]
 *   yuppay format <amountRaw> --token darai [--fraction 2]
 *
 * Reads YUPPAY_API_KEY (and optionally YUPPAY_BASE_URL) from environment.
 */

import { YupPayClient } from './client.js';
import { formatAmount, formatAmountExact } from './amount.js';
import { defaultPriceProvider } from './price.js';
import { toTokenInfo } from './tokens.js';
import { usdToToken } from './convert.js';

type Args = Record<string, string | boolean> & { _: string[] };

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next != null && !next.startsWith('--')) {
          out[a.slice(2)] = next;
          i++;
        } else {
          out[a.slice(2)] = true;
        }
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`yuppay: ${msg}\n`);
  process.exit(code);
}

function help(): void {
  const text = `
yuppay — quick CLI for YupPay SDK

Commands:
  create-invoice    Create a payment invoice (needs YUPPAY_API_KEY).
                    Either --usd <n> or --token-amount <n> or --raw <units>.
                    Optional: --token <darai|usdt|contract.id>, --return-url, --expires-in <sec>.

  get-invoice <pt>  Fetch an invoice by its publicToken.

  price             Print current USD price for a token via Ref Finance.
                    --token <darai|usdt|wnear|contract.id>   (default: darai)

  format <raw>      Format raw minimal units for human display.
                    --token <ref> [--fraction <n>] [--exact]

Environment:
  YUPPAY_API_KEY    Server API key (ypp_live_…). Required for create/get.
  YUPPAY_BASE_URL   Override Supabase base URL.

Examples:
  yuppay price --token darai
  yuppay format 1500000000000000000000 --token darai
  yuppay create-invoice --usd 9.99 --return-url https://shop.example/order/42
`.trim();
  process.stdout.write(text + '\n');
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    help();
    return;
  }

  if (cmd === 'price') {
    const ref = String(args.token ?? 'darai');
    const t = toTokenInfo(ref);
    const p = await defaultPriceProvider.getUsdPrice(t.contractId);
    if (p == null) fail(`no price for ${t.contractId}`);
    process.stdout.write(`${t.symbol}\t$${p}\t(${t.contractId})\n`);
    return;
  }

  if (cmd === 'format') {
    const raw = args._[0];
    if (!raw) fail('format: <raw> required');
    const ref = String(args.token ?? 'darai');
    const fraction = args.fraction != null ? parseInt(String(args.fraction), 10) : 2;
    const fn = args.exact ? formatAmountExact : formatAmount;
    const t = toTokenInfo(ref);
    process.stdout.write(`${fn(raw, t, { fractionDigits: fraction })} ${t.symbol}\n`);
    return;
  }

  const apiKey = process.env.YUPPAY_API_KEY;
  const baseUrl = process.env.YUPPAY_BASE_URL;
  if (!apiKey && (cmd === 'create-invoice' || cmd === 'get-invoice')) {
    fail('YUPPAY_API_KEY env var is required');
  }
  const client = new YupPayClient({
    apiKey,
    baseUrl,
  });

  if (cmd === 'create-invoice') {
    const tokenRef = String(args.token ?? 'darai');
    let amount: { usd: number } | { token: string } | { raw: string };
    if (args.usd != null) amount = { usd: parseFloat(String(args.usd)) };
    else if (args['token-amount'] != null) amount = { token: String(args['token-amount']) };
    else if (args.raw != null) amount = { raw: String(args.raw) };
    else fail('one of --usd / --token-amount / --raw is required');

    const expiresInSec = args['expires-in'] != null ? parseInt(String(args['expires-in']), 10) : undefined;
    const returnUrl = args['return-url'] != null ? String(args['return-url']) : undefined;

    const r = await client.createInvoice({
      token: tokenRef,
      amount: amount!,
      ...(returnUrl ? { returnUrl } : {}),
      ...(expiresInSec ? { expiresInSec } : {}),
    });
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return;
  }

  if (cmd === 'get-invoice') {
    const pt = args._[0];
    if (!pt) fail('get-invoice: <publicToken> required');
    const inv = await client.getInvoice(pt);
    process.stdout.write(JSON.stringify(inv, null, 2) + '\n');
    return;
  }

  if (cmd === 'usd-to-token') {
    const usd = parseFloat(String(args.usd ?? args._[0] ?? ''));
    if (!Number.isFinite(usd)) fail('--usd <number> required');
    const tokenRef = String(args.token ?? 'darai');
    const r = await usdToToken(usd, tokenRef);
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return;
  }

  fail(`unknown command: ${cmd}. Run "yuppay help" for usage.`);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`yuppay: ${msg}\n`);
  process.exit(1);
});
