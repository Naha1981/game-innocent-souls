'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterGenerationRequest, RuntimeManifest } from '../lib/game-factory/types';
import { GAME_GOAL_STARS, FINISH_POSITION, PLAYER_START_POSITION, collectiblePosition, hasWon, isCollectibleHit, nextPlayerPosition } from '../lib/game-factory/gameplay';
import { getThemeGameplay } from '../lib/game-factory/theme-gameplay';
import type { GameTelemetryEvent } from '../lib/game-factory/telemetry';

type Theme = { id: CharacterGenerationRequest['adventure']; name: string; line: string; icon: string };
const themes: Theme[] = [
  { id: 'football', name: 'Street Football', line: 'Score your first goal.', icon: '⚽' },
  { id: 'hero', name: 'Superhero', line: 'Save the neighbourhood.', icon: '🦸' },
  { id: 'racer', name: 'Speed Racer', line: 'Beat the clock.', icon: '🏎️' },
  { id: 'space', name: 'Space Explorer', line: 'Reach the stars.', icon: '🚀' },
];

const PHOTO_TTL_MS = 15 * 60 * 1000;
type GenerationState = 'idle' | 'uploading' | 'generating' | 'succeeded' | 'error';
type GeneratedAsset = { atlasDataUrl: string; manifest: RuntimeManifest };

type TelemetryExtra = Omit<GameTelemetryEvent, 'event'>;

export default function Home() {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<CharacterGenerationRequest['adventure']>('football');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoMeta, setPhotoMeta] = useState<{ mimeType: string; sizeBytes: number; expiresAt: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [created, setCreated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [gameLost, setGameLost] = useState(false);
  const [starsCollected, setStarsCollected] = useState(0);
  const [position, setPosition] = useState(PLAYER_START_POSITION);
  const [timeLeft, setTimeLeft] = useState(30);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [sourceObjectRef, setSourceObjectRef] = useState<string | null>(null);
  const [generatedAsset, setGeneratedAsset] = useState<GeneratedAsset | null>(null);
  const [animationState, setAnimationState] = useState<'idle' | 'walk' | 'jump' | 'celebrate'>('idle');
  const [frameIndex, setFrameIndex] = useState(0);

  const generationStartedAtRef = useRef<number | null>(null);
  const gameStartedAtRef = useRef<number | null>(null);
  const photoDeletedRef = useRef(false);

  const selected = useMemo(() => themes.find(t => t.id === theme)!, [theme]);
  const gameSpec = useMemo(() => getThemeGameplay(theme), [theme]);
  const activeRects = generatedAsset?.manifest.frame_layout?.rows?.[animationState] ?? [];
  const activeRect = activeRects[frameIndex % Math.max(1, activeRects.length)];
  const cellWidth = generatedAsset?.manifest.frame_layout?.cellWidth ?? 256;
  const cellHeight = generatedAsset?.manifest.frame_layout?.cellHeight ?? 256;
  const sheetWidth = generatedAsset?.manifest.frame_layout?.sheetWidth ?? 1024;
  const sheetHeight = generatedAsset?.manifest.frame_layout?.sheetHeight ?? 1024;
  const currentCollectiblePosition = collectiblePosition(starsCollected);
  const racerMode = theme === 'racer';
  const timerPercent = racerMode ? Math.max(0, Math.min(100, (timeLeft / (gameSpec.timeLimitSeconds ?? 30)) * 100)) : 100;

  function track(event: GameTelemetryEvent['event'], extra: TelemetryExtra = {}) {
    const payload: GameTelemetryEvent = { event, ...extra };
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Telemetry must never block or break the game experience.
    });
  }

  function clearGeneratedAsset() {
    setGeneratedAsset(null);
    setAnimationState('idle');
    setFrameIndex(0);
  }

  function resetGame() {
    setPlaying(false);
    setGameWon(false);
    setGameLost(false);
    setStarsCollected(0);
    setPosition(PLAYER_START_POSITION);
    setTimeLeft(gameSpec.timeLimitSeconds ?? 30);
    setAnimationState('idle');
    setFrameIndex(0);
    gameStartedAtRef.current = null;
  }

  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    if (file.size > 8 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
    setPhotoFile(file);
    setPhotoMeta({ mimeType: file.type, sizeBytes: file.size, expiresAt: new Date(Date.now() + PHOTO_TTL_MS).toISOString() });
    setCreated(false);
    resetGame();
    setJobId(null);
    setSourceObjectRef(null);
    setGenerationState('idle');
    setGenerationError(null);
    clearGeneratedAsset();
    photoDeletedRef.current = false;
    track('photo_selected', { adventure: theme });
  }

  async function createGame() {
    if (!photoFile || !photoMeta || !consent || !name.trim() || generationState === 'uploading' || generationState === 'generating') return;

    const request: CharacterGenerationRequest = {
      jobId: crypto.randomUUID(),
      childName: name.trim(),
      adventure: theme,
      sourcePhoto: { kind: 'browser-temporary', ...photoMeta },
      consent: { confirmed: true, actor: 'authorised-educator', confirmedAt: new Date().toISOString() },
      safety: { biometricIdentification: false, identityMatching: false, stylisedAssetOnly: true },
    };

    setJobId(request.jobId);
    setCreated(true);
    resetGame();
    setGenerationError(null);
    clearGeneratedAsset();
    setGenerationState('uploading');
    generationStartedAtRef.current = Date.now();
    track('generation_started', { jobId: request.jobId, adventure: theme });

    try {
      const form = new FormData();
      form.append('file', photoFile, photoFile.name || 'child-photo');
      const sourceResponse = await fetch('/api/generation/source', { method: 'POST', body: form, cache: 'no-store' });
      const sourceResult = await sourceResponse.json();
      if (!sourceResponse.ok || !sourceResult.sourceObjectRef) {
        throw new Error(sourceResult.message || sourceResult.code || 'Temporary photo upload failed.');
      }

      setSourceObjectRef(sourceResult.sourceObjectRef);
      setGenerationState('generating');

      const generationResponse = await fetch('/api/generation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, sourceObjectRef: sourceResult.sourceObjectRef }),
        cache: 'no-store',
      });
      const generationResult = await generationResponse.json();
      if (!generationResponse.ok || !generationResult.ok) {
        throw new Error(generationResult.message || generationResult.code || 'Character generation failed.');
      }

      const result = generationResult.result;
      const atlas = result?.atlas;
      const manifest = result?.manifest as RuntimeManifest | undefined;
      if (!atlas?.data || atlas.encoding !== 'base64' || !manifest?.frame_layout?.rows) {
        throw new Error('Generator succeeded but returned no playable atlas.');
      }
      setGeneratedAsset({ atlasDataUrl: `data:${atlas.mimeType || 'image/png'};base64,${atlas.data}`, manifest });
      setAnimationState('idle');
      setFrameIndex(0);
      setGenerationState('succeeded');
      track('generation_succeeded', {
        jobId: request.jobId,
        adventure: theme,
        durationMs: generationStartedAtRef.current ? Date.now() - generationStartedAtRef.current : undefined,
      });
      generationStartedAtRef.current = null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Generation could not be completed.';
      setGenerationState('error');
      setGenerationError(reason);
      track('generation_failed', {
        jobId: request.jobId,
        adventure: theme,
        durationMs: generationStartedAtRef.current ? Date.now() - generationStartedAtRef.current : undefined,
        reason,
      });
      generationStartedAtRef.current = null;
    }
  }

  function play() {
    if (!generatedAsset) return;
    resetGame();
    setTimeLeft(gameSpec.timeLimitSeconds ?? 30);
    setPlaying(true);
    gameStartedAtRef.current = Date.now();
    track('game_started', { jobId: jobId ?? undefined, adventure: theme });
  }

  function finishWin() {
    setGameWon(true);
    setPlaying(false);
    setAnimationState('celebrate');
    track('game_won', {
      jobId: jobId ?? undefined,
      adventure: theme,
      durationMs: gameStartedAtRef.current ? Date.now() - gameStartedAtRef.current : undefined,
    });
    gameStartedAtRef.current = null;
  }

  function move(direction: -1 | 1) {
    if (!playing || gameWon || gameLost || !generatedAsset) return;
    const nextPosition = nextPlayerPosition(position, direction);
    setPosition(nextPosition);
    setAnimationState('walk');

    if (isCollectibleHit(nextPosition, starsCollected)) {
      const nextStars = starsCollected + 1;
      setStarsCollected(nextStars);
      setAnimationState('idle');
      if (hasWon(nextStars, nextPosition)) finishWin();
    } else if (starsCollected >= gameSpec.goalCount && hasWon(starsCollected, nextPosition)) {
      finishWin();
    }
  }

  function jump() {
    if (!playing || gameWon || gameLost || !generatedAsset) return;
    setAnimationState('jump');
    window.setTimeout(() => {
      setAnimationState(current => current === 'jump' ? 'idle' : current);
    }, 650);
  }

  function actionFeedback() {
    if (!playing || gameWon || gameLost || !generatedAsset) return;
    setAnimationState('celebrate');
    window.setTimeout(() => setAnimationState(current => current === 'celebrate' ? 'idle' : current), 900);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') move(-1);
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') move(1);
      if (e.key === ' ' || e.key.toLowerCase() === 'w') jump();
      if (e.key.toLowerCase() === 'c') actionFeedback();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!playing || !racerMode || gameWon || gameLost) return;
    const timer = window.setInterval(() => {
      setTimeLeft(current => {
        if (current <= 1) {
          window.clearInterval(timer);
          setGameLost(true);
          setPlaying(false);
          setAnimationState('idle');
          track('game_lost', {
            jobId: jobId ?? undefined,
            adventure: theme,
            durationMs: gameStartedAtRef.current ? Date.now() - gameStartedAtRef.current : undefined,
            reason: 'timer_expired',
          });
          gameStartedAtRef.current = null;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, racerMode, gameWon, gameLost, jobId, theme]);

  useEffect(() => {
    if (!generatedAsset || !activeRects.length) return;
    const durations = generatedAsset.manifest.animation?.rows?.[animationState]?.durations_ms ?? [];
    const duration = durations[frameIndex % Math.max(1, durations.length)] ?? (animationState === 'idle' ? 250 : 125);
    const timer = window.setTimeout(() => {
      setFrameIndex(i => (i + 1) % activeRects.length);
    }, Math.max(50, duration));
    return () => window.clearTimeout(timer);
  }, [generatedAsset, animationState, activeRects.length, frameIndex]);

  useEffect(() => {
    if (!photoMeta) return;
    const remaining = Math.max(0, new Date(photoMeta.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      if (!photoDeletedRef.current) {
        track('photo_deleted', { jobId: jobId ?? undefined, adventure: theme, reason: 'ttl_expired' });
        photoDeletedRef.current = true;
      }
      setPhoto(null);
      setPhotoFile(null);
      setPhotoMeta(null);
      setCreated(false);
      resetGame();
      setConsent(false);
      setJobId(null);
      setSourceObjectRef(null);
      setGenerationState('idle');
      setGenerationError(null);
      clearGeneratedAsset();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [photoMeta, jobId, theme]);

  function deletePhoto() {
    if (!photoDeletedRef.current) {
      track('photo_deleted', { jobId: jobId ?? undefined, adventure: theme, reason: 'user_deleted' });
      photoDeletedRef.current = true;
    }
    setPhoto(null);
    setPhotoFile(null);
    setPhotoMeta(null);
    setCreated(false);
    resetGame();
    setConsent(false);
    setJobId(null);
    setSourceObjectRef(null);
    setGenerationState('idle');
    setGenerationError(null);
    clearGeneratedAsset();
  }

  const generationLabel = generationState === 'uploading' ? 'UPLOADING TEMPORARY PHOTO…' : generationState === 'generating' ? 'GENERATING CHARACTER…' : generationState === 'succeeded' ? 'REAL GENERATION COMPLETE' : generationState === 'error' ? 'REAL GENERATION NEEDS ATTENTION' : 'READY FOR GENERATOR';
  const spriteStyle = activeRect && generatedAsset ? {
    width: cellWidth,
    height: cellHeight,
    backgroundImage: `url(${generatedAsset.atlasDataUrl})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${activeRect.x}px -${activeRect.y}px`,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
  } : undefined;

  return (
    <main className="shell">
      <header className="top"><div className="brand">NAHALABS / KIDS GAME FACTORY</div><div className="badge">DEMO • SOWETO</div></header>
      <section className="hero"><div className="eyebrow">Photo → character → game</div><h1>Turn a child’s imagination into a game.</h1><p>For creches, schools and families. Create a personalised mini-game in minutes — with guardian permission and privacy built into the experience.</p></section>

      <section className="workspace">
        <div className="card">
          <div className="section-kicker">01 / HERO FACTORY</div><h2>Create the hero</h2>
          <p className="muted">The photo is uploaded only when you create the game, through a temporary server-side handoff. The worker deletes its source after generation.</p>
          <label className="muted" htmlFor="name">Child&apos;s first name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lerato" style={{ width: '100%', padding: 13, marginTop: 6, border: '1px solid #dfe5dc', borderRadius: 12 }} />
          <div className="drop">
            {photo ? <div className="photo-wrap"><img src={photo} alt="Temporary child preview" /><button className="delete-photo" onClick={deletePhoto}>Delete photo</button></div> : <div><strong>Choose a photo</strong><br/><span className="muted">Guardian or authorised teacher consent is required.</span><br/><br/><label className="upload">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto}/></label><div className="photo-note">JPG, PNG or WebP • max 8 MB</div></div>}
          </div>
          {photo && <label className="upload secondary-upload">Replace photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto}/></label>}

          <div className="section-kicker adventure-kicker">02 / ADVENTURE</div><h2>Choose an adventure</h2>
          <div className="themes">{themes.map(t => <button type="button" key={t.id} className={`theme ${theme === t.id ? 'active' : ''}`} onClick={() => { setTheme(t.id); resetGame(); }}><b>{t.icon} {t.name}</b><span className="muted">{t.line}</span></button>)}</div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I confirm I am authorised to provide this child&apos;s photo for this demo experience.</span></label>
          <button className="cta" disabled={!photoFile || !name.trim() || !consent || generationState === 'uploading' || generationState === 'generating'} onClick={createGame}>{generationState === 'uploading' ? 'UPLOADING…' : generationState === 'generating' ? 'GENERATING…' : 'CREATE GAME'}</button>
          {generationError && <div className="muted" role="alert" style={{ marginTop: 10 }}>Real generator: {generationError}</div>}
        </div>

        <div className="card game">
          <div><div className="section-kicker">03 / PLAYABLE GAME</div><h2>Play</h2><p className="muted">When generation succeeds, the game uses the real sprite-gen atlas and its manifest rectangles. No runtime frame-grid guessing.</p></div>
          <div className={`game-screen ${playing ? 'playing' : ''}`}>
            <div className="sun"/><div className="hill"/>
            <div className="game-label">{created ? `${selected.icon} ${name} — ${selected.name}` : 'YOUR CHILD — ADVENTURE'}</div>
            {playing && !gameWon && <div className="collectible" style={{ left: `${currentCollectiblePosition}%` }}>{gameSpec.collectible}</div>}
            {playing && <div className="finish-gate" style={{ left: `${gameSpec.goalPosition}%` }} aria-label={gameSpec.finish}>{gameSpec.finish}</div>}
            {generatedAsset && activeRect ? <div className="player generated-player" style={{ ...spriteStyle, left: `${position}%` }} aria-label="Generated child game character" /> : <div className="player" style={{ left: `${position}%` }} aria-label="Prototype player character" />}
            {playing && <div className="score">{racerMode ? `CHECKPOINTS ${starsCollected}/${gameSpec.goalCount}` : `${gameSpec.collectible} ${starsCollected}/${gameSpec.goalCount}`}</div>}
            {playing && racerMode && <div className="timer" aria-label={`Time remaining ${timeLeft} seconds`}><strong>{timeLeft}s</strong><span style={{ width: `${timerPercent}%` }} /></div>}
            {!created && <div className="screen-message">Create a hero to begin</div>}
            {created && generationState !== 'succeeded' && <div className="screen-message">{generationState === 'error' ? 'Generation needs attention' : 'Your real hero is being created…'}</div>}
            {created && generationState === 'succeeded' && !playing && !gameWon && !gameLost && <button className="play-button" onClick={play}>▶ PLAY {name.toUpperCase()}</button>}
            {gameWon && <div className="win-message"><strong>🎉 YOU DID IT!</strong><span>{name} completed: {gameSpec.objective}</span><button onClick={play}>PLAY AGAIN</button></div>}
            {gameLost && <div className="win-message"><strong>⏱️ TIME&apos;S UP!</strong><span>{name} missed the finish. Try the {selected.name} again.</span><button onClick={play}>TRY AGAIN</button></div>}
          </div>
          {created ? <div className="pipeline-card">
            <div className="pipeline-head"><strong>Generation pipeline</strong><span>{generationLabel}</span></div>
            <div className="pipeline-grid"><span>Adventure<strong>{selected.name}</strong></span><span>Objective<strong>{gameSpec.objective}</strong></span><span>Animations<strong>Idle · Walk · Jump · Celebrate</strong></span><span>Safety<strong>No biometric ID</strong></span><span>Source<strong>Temporary • deleted after generation</strong></span></div>
            <div className="pipeline-id">Job {jobId?.slice(0, 8)}…{sourceObjectRef ? ' • source secured' : ''}{generatedAsset ? ' • atlas loaded' : ''}</div>
          </div> : <div><div className="game-title">Your game appears here</div><div className="steps"><span className="step">PHOTO</span><span className="step">CHARACTER</span><span className="step">ANIMATION</span><span className="step">PLAY</span></div></div>}
          {playing && !gameWon && !gameLost && <div className="controls"><div className="game-title">{starsCollected >= gameSpec.goalCount ? gameSpec.actionHint : gameSpec.objective}</div><div className="control-row"><button onClick={() => move(-1)} aria-label="Move left">←</button><button onClick={() => move(1)} aria-label="Move right">→</button><button onClick={jump} disabled={!generatedAsset}>JUMP</button><button onClick={actionFeedback} disabled={!generatedAsset}>{gameSpec.actionLabel}</button><button className="stop" onClick={() => resetGame()}>STOP</button></div><div className="muted">Use ← → or A / D to move. Space / W jumps. C triggers {gameSpec.actionLabel.toLowerCase()} feedback. {gameSpec.actionHint}</div></div>}
        </div>
      </section>
      <footer className="footer">NahaLabs • Creche demo • No facial recognition • Browser preview expires after 15 minutes. Production source retention is worker-controlled and deletion is enforced after generation.</footer>
    </main>
  );
}
