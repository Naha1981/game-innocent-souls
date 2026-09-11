import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildPayfastCheckout, isNahaKidsPackage, NAHAKIDS_PACKAGES } from '../../../../lib/payfast';
import { createPaymentOrder } from '../../../../lib/db/payment-orders';
import { paymentAmountCents, isUuid } from '../../../../lib/payments/order';

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
  if (!merchantId || !merchantKey || !passphrase) return NextResponse.json({ ok: false, code: 'PAYFAST_NOT_CONFIGURED' }, { status: 503 });
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ ok: false, code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });

  try {
    const body = await request.json() as {
      package?: unknown;
      jobId?: unknown;
      sourceObjectRef?: unknown;
      generationRequest?: unknown;
    };
    if (!isNahaKidsPackage(body.package)) return NextResponse.json({ ok: false, code: 'INVALID_PACKAGE' }, { status: 400 });
    if (typeof body.jobId !== 'string' || !isUuid(body.jobId)) return NextResponse.json({ ok: false, code: 'INVALID_JOB_ID' }, { status: 400 });
    if (typeof body.sourceObjectRef !== 'string' || !/^tmp:\/\/[0-9a-f]{32}$/.test(body.sourceObjectRef)) {
      return NextResponse.json({ ok: false, code: 'INVALID_SOURCE_OBJECT_REF' }, { status: 400 });
    }
    if (!body.generationRequest || typeof body.generationRequest !== 'object' || Array.isArray(body.generationRequest)) {
      return NextResponse.json({ ok: false, code: 'INVALID_GENERATION_REQUEST' }, { status: 400 });
    }

    const generationRequest = body.generationRequest as Record<string, unknown>;
    if (generationRequest.jobId !== body.jobId || generationRequest.consent === undefined || generationRequest.safety === undefined) {
      return NextResponse.json({ ok: false, code: 'GENERATION_ORDER_MISMATCH' }, { status: 400 });
    }

    const paymentId = randomUUID();
    const product = NAHAKIDS_PACKAGES[body.package];
    await createPaymentOrder({
      paymentId,
      packageId: body.package,
      amountCents: paymentAmountCents(product.amount),
      jobId: body.jobId,
      sourceObjectRef: body.sourceObjectRef,
      generationRequestJson: JSON.stringify(generationRequest),
    });

    const baseUrl = publicBaseUrl(request);
    const testing = process.env.PAYFAST_SANDBOX === 'true';
    const returnPath = '/';
    const fields = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${baseUrl}${returnPath}?payment=success&m_payment_id=${paymentId}`,
      cancel_url: `${baseUrl}${returnPath}?payment=cancelled&m_payment_id=${paymentId}`,
      notify_url: `${baseUrl}/api/payments/payfast/itn`,
      m_payment_id: paymentId,
      amount: product.amount.toFixed(2),
      item_name: product.itemName,
      item_description: product.description,
      custom_str1: body.package,
      custom_str2: body.jobId,
    };
    const checkout = buildPayfastCheckout(fields, passphrase);
    return NextResponse.json({ ok: true, paymentId, package: body.package, amount: fields.amount, action: testing ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process', fields: checkout });
  } catch (error) {
    if (error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED') return NextResponse.json({ ok: false, code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });
    return NextResponse.json({ ok: false, code: 'PAYMENT_ORDER_FAILED' }, { status: 500 });
  }
}
