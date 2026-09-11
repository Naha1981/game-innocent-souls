import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export function getDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  return drizzle(neon(url));
}
