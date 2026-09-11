import { eq } from 'drizzle-orm';
import { getDb } from '../../lib/db';
import { paymentOrders } from '../../lib/db/schema';

export type PaymentOrderStatus = 'pending' | 'paid' | 'cancelled' | 'failed';

export async function createPaymentOrder(input: {
  paymentId: string;
  packageId: string;
  amountCents: number;
  jobId?: string;
}) {
  const db = getDb();
  if (!db) return null;
  const [order] = await db.insert(paymentOrders).values({
    paymentId: input.paymentId,
    packageId: input.packageId,
    amountCents: input.amountCents,
    jobId: input.jobId ?? null,
    status: 'pending',
  }).onConflictDoNothing().returning();
  return order ?? null;
}

export async function getPaymentOrder(paymentId: string) {
  const db = getDb();
  if (!db) return null;
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.paymentId, paymentId)).limit(1);
  return order ?? null;
}

export async function markPaymentPaid(input: {
  paymentId: string;
  packageId: string;
  amountCents: number;
  pfPaymentId?: string | null;
}) {
  const db = getDb();
  if (!db) return null;
  const [order] = await db.update(paymentOrders)
    .set({
      status: 'paid',
      pfPaymentId: input.pfPaymentId ?? null,
      paidAt: new Date(),
    })
    .where(eq(paymentOrders.paymentId, input.paymentId))
    .returning();
  if (!order || order.packageId !== input.packageId || order.amountCents !== input.amountCents) return null;
  return order;
}
