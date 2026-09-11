import { NextResponse } from 'next/server';
import { toSpriteGenJob, type SpriteGenProvider } from '@/lib/game-factory/sprite-gen-contract';
import type { CharacterGenerationRequest } from '@/lib/game-factory/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const workerUrl = process.env.SPRITE_GEN_WORKER_URL;

  if (!workerUrl) {
    return NextResponse.json(
      { ok: false, code: 'GENERATOR_NOT_CONFIGURED', message: 'The sprite generator is not connected yet. The demo remains browser-only.' },
      { status: 503 },
    );
  }

  let body: CharacterGenerationRequest & { provider?: SpriteGenProvider };
  try {
    body = (await request.json()) as CharacterGenerationRequest & { provider?: SpriteGenProvider };
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 });
  }

  if (!body.jobId || !body.childName || !body.sourcePhoto || !body.consent?.confirmed) {
    return NextResponse.json({ ok: false, code: 'INVALID_GENERATION_REQUEST' }, { status: 400 });
  }

  if (!body.safety?.stylisedAssetOnly || body.safety.biometricIdentification || body.safety.identityMatching) {
    return NextResponse.json({ ok: false, code: 'SAFETY_POLICY_VIOLATION' }, { status: 400 });
  }

  const sourceObjectRef = (body as CharacterGenerationRequest & { sourceObjectRef?: string }).sourceObjectRef;
  if (!sourceObjectRef) {
    return NextResponse.json(
      { ok: false, code: 'SOURCE_PHOTO_TRANSFER_REQUIRED', message: 'Upload the temporary source photo before generation.' },
      { status: 400 },
    );
  }

  const provider = body.provider ?? 'codex';
  const job = toSpriteGenJob(body, provider);
  const authenticatedHeaders: HeadersInit = { 'content-type': 'application/json' };
  const secret = process.env.SPRITE_GEN_SHARED_SECRET;
  if (secret) authenticatedHeaders['x-worker-secret'] = secret;

  try {
    const workerResponse = await fetch(`${workerUrl.replace(/\/$/, '')}/generate`, {
      method: 'POST',
      headers: authenticatedHeaders,
      body: JSON.stringify({ ...job, sourceObjectRef }),
      cache: 'no-store',
    });

    const text = await workerResponse.text();
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      result = { ok: false, code: 'INVALID_WORKER_RESPONSE' };
    }
    return NextResponse.json(result, { status: workerResponse.status });
  } catch {
    return NextResponse.json(
      { ok: false, code: 'GENERATOR_UNAVAILABLE', message: 'Sprite worker could not be reached.' },
      { status: 502 },
    );
  }
}
