'use client';

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterGenerationRequest, RuntimeManifest } from '../lib/game-factory/types';
import { PLAYER_START_POSITION, collectiblePosition, hasWon, isCollectibleHit, nextPlayerPosition } from '../lib/game-factory/gameplay';
import { getThemeGameplay } from '../lib/game-factory/theme-gameplay';
import type { GameTelemetryEvent } from '../lib/game-factory/telemetry';

type Theme = { id: CharacterGenerationRequest['adventure']; name: string; line: string; icon: string };
const themes: Theme[] = [
  { id: 'football', name: 'Street Football', line: 'Score your first goal.', icon: '⚽' },
  { id: 'hero', name: 'Superhero', line: 'Save the neighbourhood.', icon: '🦸' },
  { id: 'racer', name: 'Speed Racer', line: 'Beat the clock.', icon: '🏎️' },
  { id: 'space', name: 'Space Explorer', line: 'Reach the stars.', icon: '🚀' },
];

const PHOTO_TTL_MS = 30 * 60 * 1000;
type GenerationState = 'idle' | 'uploading' | 'awaiting_payment' | 'generating' | 'succeeded' | 'error';
type PaymentState = 'idle' | 'starting' | 'pending' | 'paid' | 'error';
type GeneratedAsset = { atlasDataUrl: string; manifest: RuntimeManifest };
type TelemetryExtra = Omit<GameTelemetryEvent, 'event'>;

export default function Home() {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<CharacterGenerationRequest['adventure']>('football');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoMeta, setPhotoMeta] = useState<{ mimeType: string; sizeBytes: number; expiresAt: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [trialReady, setTrialReady] = useState(false);
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
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [animationState, setAnimationState] = useState<'idle' | 'walk' | 'jump' | 'celebrate'>('idle');
  const [frameIndex, setFrameIndex] = useState(0);

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
  const racerMode = theme === 'racer';
  const timerPercent = racerMode ? Math.max(0, Math.min(100, (timeLeft / (gameSpec.timeLimitSeconds ?? 30)) * 100)) : 100;

  function track(event: GameTelemetryEvent['event'], extra: TelemetryExtra = {}) {
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, ...extra }),
      keepalive: true,
    }).catch(() => {});
  }

  function resetRound() {
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
    setGenerationError(null);
    setPaymentError(null);
    setGeneratedAsset(null);
    setPaymentState('idle');
    setTrialReady(false);
    resetRound();
    photoDeletedRef.current = false;
    track('photo_selected', { adventure: theme });
  }

  function beginFreeStage() {
    if (!photo || !photoFile || !consent || !name.trim()) return;
    resetRound();
    setTrialReady(true);
    setPlaying(true);
    gameStartedAtRef.current = Date.now();
    track('game_started', { adventure: theme });
  }

  function finishWin() {
    setGameWon(true);
    setPlaying(false);
    setAnimationState('celebrate');
    track('game_won', { adventure: theme, durationMs: gameStartedAtRef.current ? Date.now() - gameStartedAtRef.current : undefined });
    gameStartedAtRef.current = null;
  }

  function move(direction: -1 | 1) {
    if (!playing || gameWon || gameLost) return;
    const next = nextPlayerPosition(position, direction);
    setPosition(next);
    setAnimationState('walk');
    if (isCollectibleHit(next, starsCollected)) {
      const nextStars = starsCollected + 1;
      setStarsCollected(nextStars);
      setAnimationState('idle');
      if (nextStars >= gameSpec.goalCount && hasWon(nextStars, next)) finishWin();
    } else if (starsCollected >= gameSpec.goalCount && hasWon(starsCollected, next)) {
      finishWin();
    }
  }

  function jump() {
    if (!playing || gameWon || gameLost) return;
    setAnimationState('jump');
    window.setTimeout(() => setAnimationState(current => current === 'jump' ? 'idle' : current), 650);
  }

  function actionFeedback() {
    if (!playing || gameWon || gameLost) return;
    setAnimationState('celebrate');
    window.setTimeout(() => setAnimationState(current => current === 'celebrate' ? 'idle' : current), 900);
  }

  async function beginPersonalisation() {
    if (!photoFile || !photoMeta || !consent || !name.trim() || paymentState === 'starting' || paymentState === 'pending') return;
    const request: CharacterGenerationRequest = {
      jobId: crypto.randomUUID(),
      childName: name.trim(),
      adventure: theme,
      sourcePhoto: { kind: 'browser-temporary', ...photoMeta },
      consent: { confirmed: true, actor: 'authorised-educator', confirmedAt: new Date().toISOString() },
      safety: { biometricIdentification: false, identityMatching: false, stylisedAssetOnly: true },
    };
    setJobId(request.jobId);
    setGenerationError(null);
    setPaymentError(null);
    setGenerationState('uploading');
    try {
      const form = new FormData();
      form.append('file', photoFile, photoFile.name || 'child-image');
      const sourceResponse = await fetch('/api/generation/source', { method: 'POST', body: form, cache: 'no-store' });
      const sourceResult = await sourceResponse.json();
      if (!sourceResponse.ok || !sourceResult.sourceObjectRef) throw new Error(sourceResult.message || sourceResult.code || 'Temporary image upload failed.');
      setSourceObjectRef(sourceResult.sourceObjectRef);
      setGenerationState('awaiting_payment');

      const paymentResponse = await fetch('/api/payments/payfast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package: 'hero', jobId: request.jobId, sourceObjectRef: sourceResult.sourceObjectRef, generationRequest: request }),
      });
      const paymentResult = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentResult.ok) throw new Error(paymentResult.code || 'Could not start secure checkout.');
      setPaymentId(paymentResult.paymentId);
      setPaymentState('pending');
      const formElement = document.createElement('form');
      formElement.method = 'POST';
      formElement.action = paymentResult.action;
      formElement.style.display = 'none';
      for (const [key, value] of Object.entries(paymentResult.fields as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        formElement.appendChild(input);
      }
      document.body.appendChild(formElement);
      formElement.submit();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not start secure checkout.';
      setGenerationState('error');
      setPaymentState('error');
      setPaymentError(reason);
      setGenerationError(reason);
    }
  }

  async function generatePaidGame(verifiedPaymentId: string) {
    setGenerationState('generating');
    setGenerationError(null);
    try {
      const response = await fetch('/api/generation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: verifiedPaymentId }),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || result.code || 'Paid generation could not be completed.');
      const atlas = result.result?.result?.atlas;
      const manifest = result.result?.result?.manifest as RuntimeManifest | undefined;
      if (!atlas?.data || atlas.encoding !== 'base64' || !manifest?.frame_layout?.rows) throw new Error('Generator returned no playable atlas.');
      setJobId(result.jobId ?? jobId);
      setGeneratedAsset({ atlasDataUrl: `data:${atlas.mimeType || 'image/png'};base64,${atlas.data}`, manifest });
      setTheme(result.game?.adventure ?? theme);
      setGenerationState('succeeded');
      setPaymentState('paid');
      resetRound();
      track('generation_succeeded', { jobId: result.jobId ?? jobId ?? undefined, adventure: result.game?.adventure ?? theme });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Paid generation could not be completed.';
      setGenerationState('error');
      setGenerationError(reason);
      track('generation_failed', { jobId: jobId ?? undefined, adventure: theme, reason });
    }
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
    const timer = window.setInterval(() => setTimeLeft(current => {
      if (current <= 1) {
        window.clearInterval(timer);
        setGameLost(true);
        setPlaying(false);
        setAnimationState('idle');
        track('game_lost', { adventure: theme, reason: 'timer_expired' });
        gameStartedAtRef.current = null;
        return 0;
      }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [playing, racerMode, gameWon, gameLost, theme]);

  useEffect(() => {
    if (!generatedAsset || !activeRects.length) return;
    const durations = generatedAsset.manifest.animation?.rows?.[animationState]?.durations_ms ?? [];
    const duration = durations[frameIndex % Math.max(1, durations.length)] ?? (animationState === 'idle' ? 250 : 125);
    const timer = window.setTimeout(() => setFrameIndex(i => (i + 1) % activeRects.length), Math.max(50, duration));
    return () => window.clearTimeout(timer);
  }, [generatedAsset, animationState, activeRects.length, frameIndex]);

  useEffect(() => {
    if (!photoMeta) return;
    const remaining = Math.max(0, new Date(photoMeta.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      setPhoto(null);
      setPhotoFile(null);
      setPhotoMeta(null);
      setTrialReady(false);
      resetRound();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [photoMeta]);

  useEffect(() => {
    const returnedPaymentId = new URLSearchParams(window.location.search).get('m_payment_id');
    if (!returnedPaymentId) return;
    setPaymentId(returnedPaymentId);
    setPaymentState('pending');
    setGenerationState('awaiting_payment');
    let attempts = 0;
    let generating = false;
    const poll = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/payments/payfast/status?m_payment_id=${encodeURIComponent(returnedPaymentId)}`, { cache: 'no-store' });
        const result = await response.json();
        if (response.ok && result.status === 'paid') {
          window.clearInterval(poll);
          if (!generating) {
            generating = true;
            await generatePaidGame(returnedPaymentId);
          }
        }
      } catch {}
      if (attempts >= 20) window.clearInterval(poll);
    }, 3000);
    return () => window.clearInterval(poll);
  }, []);

  function deletePhoto() {
    setPhoto(null);
    setPhotoFile(null);
    setPhotoMeta(null);
    setTrialReady(false);
    resetRound();
    setConsent(false);
  }

  const freePlayerStyle = photo ? {
    width: 104,
    height: 104,
    borderRadius: '50%',
    backgroundImage: `url(${photo})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    border: '6px solid rgba(255,255,255,.95)',
    boxShadow: '0 8px 28px rgba(0,0,0,.18)',
  } : undefined;

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
      <header className="top"><div className="brand">NAHALABS / NAHAKIDS</div><div className="badge">FREE FIRST STAGE</div></header>
      <section className="hero"><div className="eyebrow">Upload • See yourself • Play • Then unlock</div><h1>Put yourself inside the game.</h1><p>Upload a child photo or drawing. We turn it into the hero you can play with for the first stage — free. The upgrade only appears after the child finishes.</p></section>

      <section className="workspace">
        <div className="card">
          <div className="section-kicker">01 / YOUR HERO</div><h2>Start with a photo or drawing</h2>
          <p className="muted">This free stage uses the image directly in the browser. Nothing is sent for AI generation until the parent chooses to unlock the personalised game.</p>
          <label className="muted" htmlFor="name">Child&apos;s first name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lerato" style={{ width: '100%', padding: 13, marginTop: 6, border: '1px solid #dfe5dc', borderRadius: 12 }} />
          <div className="drop">
            {photo ? <div className="photo-wrap"><img src={photo} alt="Child photo or drawing" /><button className="delete-photo" onClick={deletePhoto}>Choose another</button></div> : <div><strong>Upload a photo or your drawing</strong><br/><span className="muted">JPG, PNG or WebP • max 8 MB</span><br/><br/><label className="upload">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto}/></label></div>}
          </div>
          <div className="section-kicker adventure-kicker">02 / ADVENTURE</div><h2>Choose the stage</h2>
          <div className="themes">{themes.map(t => <button type="button" key={t.id} className={`theme ${theme === t.id ? 'active' : ''}`} onClick={() => { setTheme(t.id); resetRound(); }}><b>{t.icon} {t.name}</b><span className="muted">{t.line}</span></button>)}</div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I am authorised to use this child&apos;s image for this experience.</span></label>
          <button className="cta" disabled={!photo || !name.trim() || !consent || trialReady} onClick={beginFreeStage}>{trialReady ? 'STAGE 1 IN PROGRESS…' : 'PLAY STAGE 1 FREE'}</button>
        </div>

        <div className="card game">
          <div><div className="section-kicker">03 / FREE STAGE</div><h2>{name ? `${name}&apos;s adventure` : 'See yourself in the game'}</h2><p className="muted">Collect everything. Reach the finish. Complete the entire first stage.</p></div>
          <div className={`game-screen ${playing ? 'playing' : ''}`}>
            <div className="sun"/><div className="hill"/><div className="game-label">{photo ? `${selected.icon} ${name || 'YOUR HERO'} — ${selected.name}` : 'YOUR HERO — ADVENTURE'}</div>
            {playing && !gameWon && <div className="collectible" style={{ left: `${collectiblePosition(starsCollected)}%` }}>{gameSpec.collectible}</div>}
            {playing && <div className="finish-gate" style={{ left: `${gameSpec.goalPosition}%` }} aria-label={gameSpec.finish}>{gameSpec.finish}</div>}
            {generatedAsset && activeRect ? <div className="player generated-player" style={{ ...spriteStyle, left: `${position}%` }} aria-label={`${name} personalised game character`} /> : photo ? <div className="player" style={{ ...freePlayerStyle, left: `${position}%` }} aria-label={`${name} free-stage hero`} /> : <div className="player" style={{ left: `${position}%` }} />}
            {playing && <div className="score">{racerMode ? `CHECKPOINTS ${starsCollected}/${gameSpec.goalCount}` : `${gameSpec.collectible} ${starsCollected}/${gameSpec.goalCount}`}</div>}
            {playing && racerMode && <div className="timer" aria-label={`Time remaining ${timeLeft} seconds`}><strong>{timeLeft}s</strong><span style={{ width: `${timerPercent}%` }} /></div>}
            {!photo && <div className="screen-message">Upload a photo or drawing to see yourself in the game.</div>}
            {photo && !trialReady && !gameWon && <button className="play-button" onClick={beginFreeStage}>▶ PLAY {name ? name.toUpperCase() : 'FREE STAGE'}</button>}
            {gameWon && <div className="win-message"><strong>🎉 {name.toUpperCase()} DID IT!</strong><span>You finished the entire free Stage 1.</span><button onClick={resetRound}>PLAY AGAIN</button></div>}
            {gameLost && <div className="win-message"><strong>⏱️ TIME&apos;S UP!</strong><span>Try the first stage again.</span><button onClick={beginFreeStage}>TRY AGAIN</button></div>}
          </div>
          {playing && !gameWon && !gameLost && <div className="controls"><div className="game-title">{starsCollected >= gameSpec.goalCount ? gameSpec.actionHint : gameSpec.objective}</div><div className="control-row"><button onClick={() => move(-1)} aria-label="Move left">←</button><button onClick={() => move(1)} aria-label="Move right">→</button><button onClick={jump}>JUMP</button><button onClick={actionFeedback}>{gameSpec.actionLabel}</button><button className="stop" onClick={resetRound}>STOP</button></div><div className="muted">Use ← → or A / D. Space / W jumps. Finish the stage to unlock the personalised game.</div></div>}
          <div className="pipeline-card"><div className="pipeline-head"><strong>WHAT HAPPENS NEXT</strong><span>{gameWon ? 'PARENT UNLOCK' : 'FREE STAGE'}</span></div><div className="pipeline-grid"><span>1<strong>See yourself</strong></span><span>2<strong>Play Stage 1 free</strong></span><span>3<strong>Finish the stage</strong></span><span>4<strong>Parent unlocks full game</strong></span></div></div>
        </div>
      </section>

      {gameWon && !generatedAsset && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Unlock personalised game"><div className="card" style={{ maxWidth: 560, margin: '8vh auto', position: 'relative' }}><div className="section-kicker">🎉 YOU&apos;RE HOOKED</div><h2>Make {name}&apos;s hero permanent.</h2><p className="muted">{name} just completed the whole first stage using their photo/drawing. Unlock the personalised game with real character animations and the full adventure.</p><div className="pipeline-grid"><span>PAY ONCE<strong>R499</strong></span><span>NO SUBSCRIPTION<strong>One-off</strong></span><span>NO CREDIT CARD REQUIRED<strong>Use available PayFast local methods</strong></span><span>PRIVACY<strong>Photo is only sent for paid generation</strong></span></div><button className="cta" onClick={() => setTrialReady(false)} disabled={paymentState === 'starting' || paymentState === 'pending'}>UNLOCK {name.toUpperCase()} — R499</button><button className="delete-photo" onClick={() => setGameWon(false)} style={{ marginTop: 10 }}>Keep playing free</button>{paymentError && <div className="muted" role="alert" style={{ marginTop: 12 }}>{paymentError}</div>}{generationError && <div className="muted" role="alert" style={{ marginTop: 8 }}>{generationError}</div>}</div></div>}

      {gameWon && !generatedAsset && <div style={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 50, display: 'flex', justifyContent: 'center' }}><button className="cta" style={{ maxWidth: 560 }} onClick={beginPersonalisation} disabled={!photoFile || !photoMeta || !consent || paymentState === 'starting' || paymentState === 'pending'}>{paymentState === 'starting' ? 'STARTING SECURE CHECKOUT…' : paymentState === 'pending' ? 'WAITING FOR PAYMENT…' : 'UNLOCK MY PERSONALISED GAME — R499'}</button></div>}

      {generationState === 'generating' && <div className="modal-backdrop"><div className="card" style={{ maxWidth: 500, margin: '15vh auto' }}><div className="section-kicker">PERSONALISING</div><h2>Creating {name}&apos;s real game character…</h2><p className="muted">Payment is verified. We are now generating the playable character and animation set.</p></div></div>}

      {generationState === 'succeeded' && generatedAsset && <div className="modal-backdrop"><div className="card" style={{ maxWidth: 560, margin: '8vh auto' }}><div className="section-kicker">✅ PAYMENT VERIFIED</div><h2>{name}&apos;s personalised game is ready.</h2><p className="muted">The real generated character is now unlocked. Play the full adventure and share it with family.</p><button className="cta" onClick={() => { resetRound(); setPlaying(true); }}>PLAY FULL GAME</button></div></div>}

      <footer className="footer">NahaLabs • NahaKids • Free Stage 1 • Photo/drawing stays in the browser until the parent chooses the paid personalised upgrade.</footer>
    </main>
  );
}
