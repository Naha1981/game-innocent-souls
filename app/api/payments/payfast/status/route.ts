import { NextResponse } from 'next/server';
import { getPaymentOrder } from '../../../../../lib/db/payment-orders';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ ok: false, code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });

  const paymentId = new URL(request.url).searchParams.get('m_payment_id');
  if (!paymentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) {
    return NextResponse.json({ ok: false, code: 'INVALID_PAYMENT_ID' }, { status: 400 });
  }

  try {
    const order = await getPaymentOrder(paymentId);
    if (!order) return NextResponse.json({ ok: false, code: 'PAYMENT_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ ok: true, status: order.status }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, code: 'PAYMENT_STATUS_FAILED' }, { status: 500 });
  }
}
