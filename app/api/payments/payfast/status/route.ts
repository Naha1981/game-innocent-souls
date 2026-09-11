import { NextResponse } from 'next/server';
import { getPaymentOrder } from '../../../../../lib/db/payment-orders';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ ok: false, code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  const paymentId = new URL(request.url).searchParams.get('m_payment_id');
  if (!paymentId || !/^[A-Za-z0-9_-]{1,100}$/.test(paymentId)) {
    return NextResponse.json({ ok: false, code: 'INVALID_PAYMENT_ID' }, { status: 400 });
  }

  try {
    const order = await getPaymentOrder(paymentId);
    if (!order) return NextResponse.json({ ok: false, code: 'PAYMENT_NOT_FOUND' }, { status: 404 });

    return NextResponse.json({
      ok: true,
      paymentId: order.paymentId,
      package: order.packageId,
      status: order.status,
      jobId: order.jobId,
      paidAt: order.paidAt,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, code: 'PAYMENT_STATUS_FAILED' }, { status: 500 });
  }
}
