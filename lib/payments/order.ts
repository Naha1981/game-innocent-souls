export const PAYMENT_ORDER_STATUSES = ['pending', 'paid', 'cancelled', 'failed'] as const;
export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

export type PaymentOrder = {
  paymentId: string;
  packageId: 'starter' | 'hero' | 'family';
  amountCents: number;
  status: PaymentOrderStatus;
  jobId?: string;
  pfPaymentId?: string;
  createdAt: string;
  paidAt?: string;
};

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function paymentAmountCents(amount: number): number {
  return Math.round(amount * 100);
}
