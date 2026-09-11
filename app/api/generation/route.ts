import { NextResponse } from 'next/server';
import { claimGeneration, getPaymentOrder, markGenerationComplete, releaseGenerationClaim } from '@/lib/db/payment-orders';
import { upsertGameRecord } from '@/lib/db/game-records';
import { toSpriteGenJob, type SpriteGenProvider } from '@/lib/game-factory/sprite-gen-contract';
import type { CharacterGenerationRequest } from '@/lib/game-factory/types';
import { isUuid } from '@/lib/payments/order';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const workerUrl = process.env.SPRITE_GEN_WORKER_URL;
  const workerSecret = process.env.SPRITE_GEN_SHARED_SECRET?.trim();
  if (!workerUrl || !workerSecret) return NextResponse.json({ ok: false, code: 'GENERATOR_NOT_CONFIGURED', message: 'The sprite generator is not securely connected yet.' }, { status: 503 });
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ ok: false, code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 });

  let body: { paymentId?: unknown; provider?: SpriteGenProvider };
  try { body = await request.json() as { paymentId?: unknown; provider?: SpriteGenProvider }; }
  catch { return NextResponse.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }); }

  if (typeof body.paymentId !== 'string' || !isUuid(body.paymentId)) return NextResponse.json({ ok: false, code: 'INVALID_PAYMENT_ID' }, { status: 400 });

  let order;
  try { order = await getPaymentOrder(body.paymentId); }
  catch { return NextResponse.json({ ok: false, code: 'PAYMENT_LOOKUP_FAILED' }, { status: 500 }); }
  if (!order) return NextResponse.json({ ok: false, code: 'PAYMENT_NOT_FOUND' }, { status: 404 });
  if (order.status !== 'paid') return NextResponse.json({ ok: false, code: 'PAYMENT_NOT_VERIFIED' }, { status: 402 });
  if (!order.jobId || !isUuid(order.jobId)) return NextResponse.json({ ok: false, code: 'INVALID_PAYMENT_JOB' }, { status: 400 });
  if (!order.sourceObjectRef || !order.generationRequestJson) return NextResponse.json({ ok: false, code: 'GENERATION_ORDER_DATA_MISSING' }, { status: 409 });
  if (order.generationStatus === 'complete') return NextResponse.json({ ok: false, code: 'GENERATION_ALREADY_COMPLETE', jobId: order.jobId }, { status: 409 });
  if (order.generationStatus === 'running') return NextResponse.json({ ok: false, code: 'GENERATION_ALREADY_RUNNING', jobId: order.jobId }, { status: 409 });

  let generationRequest: CharacterGenerationRequest;
  try {
    generationRequest = JSON.parse(order.generationRequestJson) as CharacterGenerationRequest;
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_STORED_GENERATION_REQUEST' }, { status: 500 });
  }
  if (generationRequest.jobId !== order.jobId || !generationRequest.consent?.confirmed || generationRequest.safety?.biometricIdentification || generationRequest.safety?.identityMatching || !generationRequest.safety?.stylisedAssetOnly) {
    return NextResponse.json({ ok: false, code: 'GENERATION_POLICY_VIOLATION' }, { status: 400 });
  }

  let claimed = false;
  try {
    claimed = await claimGeneration(body.paymentId);
    if (!claimed) return NextResponse.json({ ok: false, code: 'GENERATION_ALREADY_RUNNING' }, { status: 409 });

    const provider = body.provider ?? 'codex';
    const job = toSpriteGenJob({ ...generationRequest, sourceObjectRef: order.sourceObjectRef }, provider);
    const authenticatedHeaders: HeadersInit = { 'content-type': 'application/json', 'x-worker-secret': workerSecret };

    const workerResponse = await fetch(`${workerUrl.replace(/\/$/, '')}/generate`, {
      method: 'POST',
      headers: authenticatedHeaders,
      body: JSON.stringify({ ...job, sourceObjectRef: order.sourceObjectRef }),
      cache: 'no-store',
    });
    const text = await workerResponse.text();
    let result: any;
    try { result = JSON.parse(text); } catch { result = { ok: false, code: 'INVALID_WORKER_RESPONSE' }; }

    if (workerResponse.ok && result?.ok) {
      const atlas = result.result?.atlas;
      const manifest = result.result?.manifest;
      if (!atlas?.encoding || atlas.encoding !== 'base64' || typeof atlas.data !== 'string' || !manifest?.frame_layout?.rows) {
        await releaseGenerationClaim(body.paymentId);
        return NextResponse.json({ ok: false, code: 'INVALID_GENERATOR_OUTPUT' }, { status: 502 });
      }
      await upsertGameRecord({
        jobId: generationRequest.jobId,
        childName: generationRequest.childName.trim(),
        adventure: generationRequest.adventure,
        atlasData: atlas.data,
        atlasMimeType: atlas.mimeType === 'image/webp' ? 'image/webp' : 'image/png',
        manifest,
        status: 'paid',
      });
      await markGenerationComplete(body.paymentId);
      return NextResponse.json({
        ok: true,
        jobId: generationRequest.jobId,
        game: { childName: generationRequest.childName.trim(), adventure: generationRequest.adventure },
        result,
      }, { status: workerResponse.status });
    }

    await releaseGenerationClaim(body.paymentId);
    return NextResponse.json(result, { status: workerResponse.status });
  } catch {
    if (claimed) await releaseGenerationClaim(body.paymentId).catch(() => {});
    return NextResponse.json({ ok: false, code: 'GENERATOR_UNAVAILABLE', message: 'Sprite worker could not be reached.' }, { status: 502 });
  }
}
