import { createHash } from 'node:crypto';

export const PAYFAST_LIVE_PROCESS_URL = 'https://www.payfast.co.za/eng/process';
export const PAYFAST_SANDBOX_PROCESS_URL = 'https://sandbox.payfast.co.za/eng/process';

export const NAHAKIDS_PACKAGES = {
  starter: { amount: 199, itemName: 'NahaKids Mini', description: '1 personalised child character and mini-game' },
  hero: { amount: 499, itemName: 'NahaKids Hero', description: 'Personalised character, animations, environment and mini-game' },
  family: { amount: 999, itemName: 'NahaKids Family', description: 'Personalised family game package for up to 4 children' },
} as const;

export type NahaKidsPackage = keyof typeof NAHAKIDS_PACKAGES;

export function isNahaKidsPackage(value: unknown): value is NahaKidsPackage {
  return typeof value === 'string' && value in NAHAKIDS_PACKAGES;
}

export function payfastSignature(data: Record<string, string>, passphrase?: string): string {
  const pairs = Object.entries(data)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`);

  if (passphrase) {
    pairs.push(`passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`);
  }

  return createHash('md5').update(pairs.join('&')).digest('hex');
}

export function buildPayfastCheckout(data: Record<string, string>, passphrase?: string) {
  return { ...data, signature: payfastSignature(data, passphrase) };
}

export function normaliseAmount(value: unknown): string | null {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 5 || amount > 100000) return null;
  return amount.toFixed(2);
}
