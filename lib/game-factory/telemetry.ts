import type { AdventureId } from './types';

export const TELEMETRY_EVENTS = [
  'photo_selected',
  'generation_started',
  'generation_succeeded',
  'generation_failed',
  'game_started',
  'game_won',
  'game_lost',
  'photo_deleted',
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];

export type GameTelemetryEvent = {
  event: TelemetryEventName;
  jobId?: string;
  adventure?: AdventureId;
  durationMs?: number;
  reason?: string;
};

const JOB_ID = /^[0-9a-f-]{36}$/i;

export function sanitizeTelemetryEvent(input: unknown): GameTelemetryEvent | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  if (typeof value.event !== 'string' || !TELEMETRY_EVENTS.includes(value.event as TelemetryEventName)) return null;

  const event: GameTelemetryEvent = { event: value.event as TelemetryEventName };
  if (typeof value.jobId === 'string' && JOB_ID.test(value.jobId)) event.jobId = value.jobId;
  if (typeof value.adventure === 'string' && ['football', 'hero', 'racer', 'space'].includes(value.adventure)) {
    event.adventure = value.adventure as AdventureId;
  }
  if (typeof value.durationMs === 'number' && Number.isFinite(value.durationMs) && value.durationMs >= 0 && value.durationMs <= 86_400_000) {
    event.durationMs = Math.round(value.durationMs);
  }
  if (typeof value.reason === 'string') event.reason = value.reason.slice(0, 160);
  return event;
}
