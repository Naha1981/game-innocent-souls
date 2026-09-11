import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const paymentOrders = pgTable('payment_orders', {
  paymentId: text('payment_id').primaryKey(),
  packageId: text('package_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull().default('pending'),
  generationStatus: text('generation_status').notNull().default('pending'),
  jobId: text('job_id'),
  sourceObjectRef: text('source_object_ref'),
  generationRequestJson: text('generation_request_json'),
  pfPaymentId: text('pf_payment_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});

export const gameRecords = pgTable('game_records', {
  jobId: text('job_id').primaryKey(),
  childName: text('child_name').notNull(),
  adventure: text('adventure').notNull(),
  atlasData: text('atlas_data').notNull(),
  atlasMimeType: text('atlas_mime_type').notNull().default('image/png'),
  manifestJson: text('manifest_json').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});
