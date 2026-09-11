import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getGameRecord } from '@/lib/db/game-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validJobId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  if (!validJobId(params.jobId)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const game = await getGameRecord(params.jobId);
    if (!game || game.status !== 'paid') {
      return new NextResponse('Not found', { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
    const gameUrl = `${baseUrl.replace(/\/$/, '')}/g/${encodeURIComponent(params.jobId)}`;
    const png = await QRCode.toBuffer(gameUrl, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    return new NextResponse(png as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('QR unavailable', { status: 503 });
  }
}
