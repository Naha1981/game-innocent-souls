import { toSpriteGenJob, SPRITE_GEN_STATES, SPRITE_GEN_VERSION } from '../lib/game-factory/sprite-gen-contract.ts';

const request = {
  jobId: '00000000-0000-4000-8000-000000000001',
  childName: 'Test Child',
  adventure: 'football',
  sourcePhoto: {
    kind: 'browser-temporary',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    expiresAt: '2026-09-11T20:00:00.000Z',
  },
  consent: {
    confirmed: true,
    actor: 'authorised-educator',
    confirmedAt: '2026-09-11T19:00:00.000Z',
  },
  safety: {
    biometricIdentification: false,
    identityMatching: false,
    stylisedAssetOnly: true,
  },
};

const job = toSpriteGenJob(request, 'codex');

if (SPRITE_GEN_VERSION !== '2.1.0') throw new Error('Unexpected sprite generation contract version.');
if (JSON.stringify(SPRITE_GEN_STATES) !== JSON.stringify(['idle', 'walk', 'jump', 'celebrate'])) throw new Error('Sprite state contract changed.');
if (job.schemaVersion !== '1.0') throw new Error('Unexpected sprite job schema version.');
if (job.jobId !== request.jobId) throw new Error('Job ID was not preserved.');
if (job.source.kind !== 'temporary-child-photo') throw new Error('Source must remain temporary-child-photo.');
if (job.character.identityLock !== 'stylised-only') throw new Error('Identity lock must remain stylised-only.');
if (job.character.negative.some(value => value === 'biometric-identification') === false) throw new Error('Biometric identification guard disappeared.');
if (job.character.negative.some(value => value === 'photorealistic-face') === false) throw new Error('Photorealistic face guard disappeared.');
if (job.atlas.transparentBackground !== true || job.atlas.layout !== 'row-per-animation') throw new Error('Atlas contract changed.');
if (job.retention.sourcePhoto !== 'delete-after-generation') throw new Error('Source retention policy changed.');
if (job.states.reduce((sum, state) => sum + state.frames, 0) !== 20) throw new Error('Animation frame contract changed.');

console.log('NahaKids generation contract checks: PASS');
