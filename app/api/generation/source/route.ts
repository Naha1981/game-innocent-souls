import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const workerUrl = process.env.SPRITE_GEN_WORKER_URL;

  if (!workerUrl) {
    return NextResponse.json(
      {
        ok: false,
        code: 'GENERATOR_NOT_CONFIGURED',
        message: 'The sprite generator is not connected yet.',
      },
      { status: 503 },
    );
  }

  const incoming = await request.formData();
  const file = incoming.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, code: 'SOURCE_FILE_REQUIRED' },
      { status: 400 },
    );
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return NextResponse.json(
      { ok: false, code: 'UNSUPPORTED_SOURCE_TYPE' },
      { status: 415 },
    );
  }

  if (file.size <= 0 || file.size > 8_000_000) {
    return NextResponse.json(
      { ok: false, code: 'SOURCE_TOO_LARGE' },
      { status: 413 },
    );
  }

  const form = new FormData();
  form.append('file', file, file.name || 'source-image');

  const headers: HeadersInit = {};
  const secret = process.env.SPRITE_GEN_SHARED_SECRET;
  if (secret) headers['x-worker-secret'] = secret;

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/source-photo`, {
      method: 'POST',
      headers,
      body: form,
      cache: 'no-store',
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { ok: false, code: 'INVALID_WORKER_RESPONSE' };
    }

    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { ok: false, code: 'GENERATOR_UNAVAILABLE', message: 'Sprite worker could not be reached.' },
      { status: 502 },
    );
  }
}
