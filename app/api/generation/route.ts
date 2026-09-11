import { NextResponse } from 'next/server';
import { toSpriteGenJob, type SpriteGenProvider } from '@/lib/game-factory/sprite-gen-contract';
import type { CharacterGenerationRequest } from '@/lib/game-factory/types';

/**
 * Honest integration boundary for the future sprite worker.
 *
 * We intentionally do not pretend generation succeeded when no worker is
 * configured. The browser prototype remains local-only until a secure worker
 * endpoint is deployed.
 */
export async function POST(request: Request) {
  const workerUrl = process.env.SPRITE_GEN_WORKER_URL;

  if (!workerUrl) {
    return NextResponse.json(
      {
        ok: false,
        code: 'GENERATOR_NOT_CONFIGURED',
        message: 'The sprite generator is not connected yet. The demo remains browser-only.',
      },
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

  const provider = body.provider ?? 'codex';
  const job = toSpriteGenJob(body, provider);

  // The worker contract is metadata-first. Secure photo transfer will be added
  // with the production object-storage/TTL implementation; never put a child
  // photo into this JSON payload.
  const workerResponse = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(job),
    cache: 'no-store',
  });

  if (!workerResponse.ok) {
    return NextResponse.json(
      { ok: false, code: 'GENERATOR_UNAVAILABLE', upstreamStatus: workerResponse.status },
      { status: 502 },
    );
  }

  const result = await workerResponse.json();
  return NextResponse.json({ ok: true, jobId: body.jobId, result }, { status: 202 });
}
