export type AdventureId = 'football' | 'hero' | 'racer' | 'space';

export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type CharacterGenerationRequest = {
  jobId: string;
  childName: string;
  adventure: AdventureId;
  sourcePhoto: {
    kind: 'browser-temporary';
    mimeType: string;
    sizeBytes: number;
    expiresAt: string;
  };
  consent: {
    confirmed: true;
    actor: 'guardian' | 'authorised-educator';
    confirmedAt: string;
  };
  safety: {
    biometricIdentification: false;
    identityMatching: false;
    stylisedAssetOnly: true;
  };
};

export type SpriteFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
};

export type SpriteAnimation = {
  id: 'idle' | 'walk' | 'jump' | 'celebrate';
  frames: string[];
  loop: boolean;
};

export type RuntimeSpriteRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RuntimeManifest = {
  game_input?: string;
  degraded_static_fallback?: boolean;
  frame_layout?: {
    rows?: Record<string, RuntimeSpriteRect[]>;
    sheetWidth?: number;
    sheetHeight?: number;
    cellWidth?: number;
    cellHeight?: number;
  };
  animation?: {
    rows?: Record<string, { durations_ms?: number[] }>;
  };
};

export type CharacterAssetManifest = {
  schemaVersion: '1.0';
  characterId: string;
  adventure: AdventureId;
  status: GenerationStatus;
  atlas?: {
    imageUrl: string;
    width: number;
    height: number;
  };
  frames?: SpriteFrame[];
  animations?: SpriteAnimation[];
};

/**
 * Adapter seam for a real character/sprite generator.
 * The demo intentionally has no fake remote implementation.
 */
export interface CharacterGenerator {
  generate(request: CharacterGenerationRequest): Promise<CharacterAssetManifest>;
}
