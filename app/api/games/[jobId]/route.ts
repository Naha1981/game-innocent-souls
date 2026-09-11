import { NextResponse } from 'next/server';
import { getGameRecord } from '../../../../lib/db/game-records';
import { isUuid } from '../../../../lib/payments/order';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  if (!isUuid(params.jobId)) return NextResponse.json({ ok: false, code: 'INVALID_JOB_ID' }, { status: 400 });
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ ok: false, code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });

  try {
    const record = await getGameRecord(params.jobId);
    if (!record) return NextResponse.json({ ok: false, code: 'GAME_NOT_FOUND' }, { status: 404 });
    if (record.status !== 'paid') return NextResponse.json({ ok: false, code: 'GAME_NOT_PAID' }, { status: 403 });

    let manifest: unknown;
    try { manifest = JSON.parse(record.manifestJson); } catch { return NextResponse.json({ ok: false, code: 'INVALID_STORED_MANIFEST' }, { status: 500 }); }

    return NextResponse.json({
      ok: true,
      game: {
        jobId: record.jobId,
        childName: record.childName,
        adventure: record.adventure,
        atlas: { encoding: 'base64', mimeType: record.atlasMimeType, data: record.atlasData },
        manifest,
        paidAt: record.paidAt,
      },
    }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, code: 'GAME_LOAD_FAILED' }, { status: 500 });
  }
}
