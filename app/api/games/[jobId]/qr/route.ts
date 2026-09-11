import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getGameRecord } from '@/lib/db/game-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ jobId: string }> };

function validJobId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { jobId } = await params;
  if (!validJobId(jobId)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const game = await getGameRecord(jobId);
    if (!game || game.status !== 'paid') {
      return new NextResponse('Not found', { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
    const gameUrl = `${baseUrl.replace(/\/$/, '')}/g/${encodeURIComponent(jobId)}`;
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
