import { and, eq, ne } from 'drizzle-orm';
import { getDb } from './index';
import { paymentOrders } from './schema';
import type { NahaKidsPackage } from '../payfast';

export async function createPaymentOrder(input: {
  paymentId: string;
  packageId: NahaKidsPackage;
  amountCents: number;
  jobId?: string;
  sourceObjectRef?: string;
  generationRequestJson?: string;
}) {
  const db = getDb();
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  await db.insert(paymentOrders).values({
    paymentId: input.paymentId,
    packageId: input.packageId,
    amountCents: input.amountCents,
    status: 'pending',
    jobId: input.jobId ?? null,
    sourceObjectRef: input.sourceObjectRef ?? null,
    generationRequestJson: input.generationRequestJson ?? null,
  });
}

export async function markPaymentPaid(input: {
  paymentId: string;
  packageId: NahaKidsPackage;
  amountCents: number;
  pfPaymentId?: string;
}) {
  const db = getDb();
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  const result = await db.update(paymentOrders)
    .set({ status: 'paid', pfPaymentId: input.pfPaymentId ?? null, paidAt: new Date() })
    .where(and(
      eq(paymentOrders.paymentId, input.paymentId),
      eq(paymentOrders.packageId, input.packageId),
      eq(paymentOrders.amountCents, input.amountCents),
      ne(paymentOrders.status, 'paid'),
    ))
    .returning({ paymentId: paymentOrders.paymentId });
  return result.length === 1;
}

export async function getPaymentOrder(paymentId: string) {
  const db = getDb();
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  const rows = await db.select().from(paymentOrders).where(eq(paymentOrders.paymentId, paymentId)).limit(1);
  return rows[0] ?? null;
}
