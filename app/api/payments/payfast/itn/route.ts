import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { NextResponse } from 'next/server';
import { NAHAKIDS_PACKAGES } from '../../../../../lib/payfast';

export const runtime = 'nodejs';

const PAYFAST_HOSTS = new Set(['www.payfast.co.za', 'w1w.payfast.co.za', 'w2w.payfast.co.za', 'sandbox.payfast.co.za']);

function signatureForItn(fields: Array<[string, string]>, passphrase: string): string {
  const pairs = fields
    .filter(([key, value]) => key !== 'signature' && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`);
  pairs.push(`passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`);
  return createHash('md5').update(pairs.join('&')).digest('hex');
}

async function payfastIps(): Promise<Set<string>> {
  const addresses = new Set<string>();
  for (const host of PAYFAST_HOSTS) {
    try {
      const results = await lookup(host, { all: true });
      for (const result of results) addresses.add(result.address);
    } catch {
      // A DNS failure should not make an otherwise valid ITN trusted.
    }
  }
  return addresses;
}

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || null;
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim();
  const passphrase = process.env.PAYFAST_PASSPHRASE?.trim();
  if (!merchantId || !passphrase) return new NextResponse('Not configured', { status: 503 });

  try {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    const fields = Array.from(params.entries());
    const suppliedSignature = params.get('signature');
    if (!suppliedSignature || signatureForItn(fields, passphrase) !== suppliedSignature) {
      return new NextResponse('Invalid signature', { status: 400 });
    }

    const merchant = params.get('merchant_id');
    const paymentStatus = params.get('payment_status');
    const paymentId = params.get('m_payment_id');
    const packageId = params.get('custom_str1');
    const gross = params.get('amount_gross');

    if (merchant !== merchantId || paymentStatus !== 'COMPLETE' || !paymentId || !packageId || !gross || !(packageId in NAHAKIDS_PACKAGES)) {
      return new NextResponse('Invalid transaction', { status: 400 });
    }

    const expected = NAHAKIDS_PACKAGES[packageId as keyof typeof NAHAKIDS_PACKAGES].amount.toFixed(2);
    if (Number(gross).toFixed(2) !== expected) return new NextResponse('Amount mismatch', { status: 400 });

    const sourceIp = requestIp(request);
    const trustedIps = await payfastIps();
    if (!sourceIp || !trustedIps.has(sourceIp)) return new NextResponse('Invalid source', { status: 403 });

    const sandbox = process.env.PAYFAST_SANDBOX === 'true';
    const validationUrl = sandbox
      ? 'https://sandbox.payfast.co.za/eng/query/validate'
      : 'https://www.payfast.co.za/eng/query/validate';
    const validationResponse = await fetch(validationUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: raw,
      cache: 'no-store',
    });
    const validation = (await validationResponse.text()).trim();
    if (!validationResponse.ok || validation !== 'VALID') return new NextResponse('Payfast validation failed', { status: 400 });

    // MVP fulfillment sink. Do not grant paid entitlements from the browser return URL.
    // The verified ITN is the authoritative payment event. Durable order storage will be added
    // when the product account/entitlement layer is introduced.
    console.info(JSON.stringify({
      type: 'nahakids.payment.completed',
      paymentId,
      package: packageId,
      pfPaymentId: params.get('pf_payment_id'),
      amount: gross,
    }));

    return new NextResponse('OK', { status: 200 });
  } catch {
    return new NextResponse('Invalid notification', { status: 400 });
  }
}
