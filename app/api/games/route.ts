import { NextResponse } from 'next/server';
import { upsertGameRecord } from '../../../lib/db/game-records';
import { isUuid } from '../../../lib/payments/order';
import type { RuntimeManifest, CharacterGenerationRequest } from '../../../lib/game-factory/types';

export const runtime = 'nodejs';

const ADVENTURES = new Set(['football', 'hero', 'racer', 'space']);
const MAX_ATLAS_DATA = 12 * 1024 * 1024;

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ ok: false, code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });
  }
  try {
    const body = await request.json() as {
      jobId?: unknown;
      childName?: unknown;
      adventure?: unknown;
      atlasData?: unknown;
      atlasMimeType?: unknown;
      manifest?: unknown;
    };
    if (!isUuid(body.jobId)) return NextResponse.json({ ok: false, code: 'INVALID_JOB_ID' }, { status: 400 });
    if (typeof body.childName !== 'string' || body.childName.trim().length < 1 || body.childName.trim().length > 40) {
      return NextResponse.json({ ok: false, code: 'INVALID_CHILD_NAME' }, { status: 400 });
    }
    if (typeof body.adventure !== 'string' || !ADVENTURES.has(body.adventure)) {
      return NextResponse.json({ ok: false, code: 'INVALID_ADVENTURE' }, { status: 400 });
    }
    if (typeof body.atlasData !== 'string' || body.atlasData.length < 100 || body.atlasData.length > MAX_ATLAS_DATA) {
      return NextResponse.json({ ok: false, code: 'INVALID_ATLAS' }, { status: 400 });
    }
    if (body.atlasMimeType !== 'image/png' && body.atlasMimeType !== 'image/webp') {
      return NextResponse.json({ ok: false, code: 'INVALID_ATLAS_MIME' }, { status: 400 });
    }
    if (!body.manifest || typeof body.manifest !== 'object') {
      return NextResponse.json({ ok: false, code: 'INVALID_MANIFEST' }, { status: 400 });
    }

    await upsertGameRecord({
      jobId: body.jobId,
      childName: body.childName.trim(),
      adventure: body.adventure as CharacterGenerationRequest['adventure'],
      atlasData: body.atlasData,
      atlasMimeType: body.atlasMimeType,
      manifest: body.manifest as RuntimeManifest,
    });
    return NextResponse.json({ ok: true, jobId: body.jobId });
  } catch {
    return NextResponse.json({ ok: false, code: 'GAME_SAVE_FAILED' }, { status: 500 });
  }
}
