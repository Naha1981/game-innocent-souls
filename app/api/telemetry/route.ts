import { NextResponse } from 'next/server';
import { sanitizeTelemetryEvent } from '../../../lib/game-factory/telemetry';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const event = sanitizeTelemetryEvent(await request.json());
    if (!event) {
      return NextResponse.json({ ok: false, code: 'INVALID_TELEMETRY' }, { status: 400 });
    }

    // MVP sink: structured server logs. No photo, child name, IP, user-agent,
    // or raw request payload is persisted. A durable analytics sink can be
    // introduced later without changing the client event contract.
    console.info('[nahakids.telemetry]', JSON.stringify(event));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_REQUEST' }, { status: 400 });
  }
}
