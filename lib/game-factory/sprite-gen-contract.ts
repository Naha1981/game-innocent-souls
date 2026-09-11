import type { AdventureId, CharacterGenerationRequest } from './types';

export const SPRITE_GEN_VERSION = '2.1.0';

export const SPRITE_GEN_STATES = ['idle', 'walk', 'jump', 'celebrate'] as const;

export type SpriteGenState = (typeof SPRITE_GEN_STATES)[number];

export type SpriteGenProvider = 'codex' | 'grok';

export type SpriteGenJob = {
  schemaVersion: '1.0';
  jobId: string;
  adventure: AdventureId;
  provider: SpriteGenProvider;
  source: {
    kind: 'temporary-child-photo';
    mimeType: string;
    sizeBytes: number;
  };
  character: {
    style: 'friendly-2d-game-character';
    identityLock: 'stylised-only';
    negative: string[];
  };
  states: Array<{
    id: SpriteGenState;
    frames: number;
  }>;
  atlas: {
    format: 'png';
    transparentBackground: true;
    layout: 'row-per-animation';
  };
  retention: {
    sourcePhoto: 'delete-after-generation';
    generatedAsset: 'retain-until-parent-or-operator-deletes';
  };
};

/**
 * Converts the browser generation contract into the canonical sprite-gen request.
 * It deliberately contains metadata only. The child photo never gets embedded in
 * this JSON contract; the worker owns secure temporary file/object transfer.
 */
export function toSpriteGenJob(
  request: CharacterGenerationRequest,
  provider: SpriteGenProvider,
): SpriteGenJob {
  return {
    schemaVersion: '1.0',
    jobId: request.jobId,
    adventure: request.adventure,
    provider,
    source: {
      kind: 'temporary-child-photo',
      mimeType: request.sourcePhoto.mimeType,
      sizeBytes: request.sourcePhoto.sizeBytes,
    },
    character: {
      style: 'friendly-2d-game-character',
      identityLock: 'stylised-only',
      negative: ['photorealistic-face', 'biometric-identification', 'text', 'watermark', 'extra-limbs'],
    },
    states: [
      { id: 'idle', frames: 4 },
      { id: 'walk', frames: 6 },
      { id: 'jump', frames: 4 },
      { id: 'celebrate', frames: 6 },
    ],
    atlas: {
      format: 'png',
      transparentBackground: true,
      layout: 'row-per-animation',
    },
    retention: {
      sourcePhoto: 'delete-after-generation',
      generatedAsset: 'retain-until-parent-or-operator-deletes',
    },
  };
}
