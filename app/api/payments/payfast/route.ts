import { NextResponse } from 'next/server';
import { buildPayfastCheckout, isNahaKidsPackage, NAHAKIDS_PACKAGES } from '../../../../lib/payfast';

export const runtime = 'nodejs';

function publicBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim();
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY?.trim();
  const passphrase = process.env.PAYFAST_PASSPHRASE?.trim();

  if (!merchantId || !merchantKey || !passphrase) {
    return NextResponse.json({ ok: false, code: 'PAYFAST_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const body = await request.json() as { package?: unknown; paymentId?: unknown };
    if (!isNahaKidsPackage(body.package)) {
      return NextResponse.json({ ok: false, code: 'INVALID_PACKAGE' }, { status: 400 });
    }

    const paymentId = typeof body.paymentId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(body.paymentId)
      ? body.paymentId
      : crypto.randomUUID();
    const product = NAHAKIDS_PACKAGES[body.package];
    const baseUrl = publicBaseUrl(request);
    const testing = process.env.PAYFAST_SANDBOX === 'true';

    const fields = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${baseUrl}/?payment=success&m_payment_id=${encodeURIComponent(paymentId)}`,
      cancel_url: `${baseUrl}/?payment=cancelled&m_payment_id=${encodeURIComponent(paymentId)}`,
      notify_url: `${baseUrl}/api/payments/payfast/itn`,
      m_payment_id: paymentId,
      amount: product.amount.toFixed(2),
      item_name: product.itemName,
      item_description: product.description,
      custom_str1: body.package,
    };

    const checkout = buildPayfastCheckout(fields, passphrase);
    return NextResponse.json({
      ok: true,
      paymentId,
      package: body.package,
      amount: fields.amount,
      action: testing ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process',
      fields: checkout,
    });
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 });
  }
}
