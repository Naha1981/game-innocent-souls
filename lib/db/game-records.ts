import { eq } from 'drizzle-orm';
import { getDb } from './index';
import { gameRecords } from './schema';
import type { RuntimeManifest } from '../game-factory/types';
import type { CharacterGenerationRequest } from '../game-factory/types';

export async function upsertGameRecord(input: {
  jobId: string;
  childName: string;
  adventure: CharacterGenerationRequest['adventure'];
  atlasData: string;
  atlasMimeType: string;
  manifest: RuntimeManifest;
}) {
  const db = getDb();
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  await db.insert(gameRecords).values({
    jobId: input.jobId,
    childName: input.childName,
    adventure: input.adventure,
    atlasData: input.atlasData,
    atlasMimeType: input.atlasMimeType,
    manifestJson: JSON.stringify(input.manifest),
    status: 'draft',
  }).onConflictDoUpdate({
    target: gameRecords.jobId,
    set: {
      childName: input.childName,
      adventure: input.adventure,
      atlasData: input.atlasData,
      atlasMimeType: input.atlasMimeType,
      manifestJson: JSON.stringify(input.manifest),
    },
  });
}

export async function getGameRecord(jobId: string) {
  const db = getDb();
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  const rows = await db.select().from(gameRecords).where(eq(gameRecords.jobId, jobId)).limit(1);
  return rows[0] ?? null;
}

export async function markGamePaid(jobId: string) {
  const db = getDb();
  if (!db) throw new Error('DATABASE_NOT_CONFIGURED');
  await db.update(gameRecords)
    .set({ status: 'paid', paidAt: new Date() })
    .where(eq(gameRecords.jobId, jobId));
}
