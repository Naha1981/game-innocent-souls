import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const paymentOrders = pgTable('payment_orders', {
  paymentId: text('payment_id').primaryKey(),
  packageId: text('package_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull().default('pending'),
  jobId: text('job_id'),
  pfPaymentId: text('pf_payment_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});
