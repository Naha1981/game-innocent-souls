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
  const [freeTrialStarted, setFreeTrialStarted] = useState(false);
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
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
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
  const freeUnlockOpen = gameWon && !created;

  function track(event: GameTelemetryEvent['event'], extra: TelemetryExtra = {}) {
    const payload: GameTelemetryEvent = { event, ...extra };
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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

  function startFreeStage() {
    if (!name.trim()) return;
    resetRound();
    setFreeTrialStarted(true);
    setCreated(false);
    track('game_started', { adventure: theme });
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
    photoDeletedRef.current = false;
    track('photo_selected', { adventure: theme });
  }

  async function startPayment(request: CharacterGenerationRequest, securedSourceRef: string) {
    if (paymentState === 'starting' || paymentState === 'pending' || paymentState === 'paid') return;
    setPaymentState('starting');
    setPaymentError(null);
    try {
      const response = await fetch('/api/payments/payfast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package: 'hero', jobId: request.jobId, sourceObjectRef: securedSourceRef, generationRequest: request }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.code || 'Could not start secure checkout.');
      setPaymentId(result.paymentId);
      setPaymentState('pending');
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = result.action;
      form.style.display = 'none';
      for (const [key, value] of Object.entries(result.fields as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      setPaymentState('error');
      setPaymentError(error instanceof Error ? error.message : 'Could not start secure checkout.');
      setGenerationState('error');
    }
  }

  async function beginPersonalisation() {
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
    setGenerationError(null);
    setPaymentError(null);
    setGenerationState('uploading');
    try {
      const form = new FormData();
      form.append('file', photoFile, photoFile.name || 'child-photo');
      const sourceResponse = await fetch('/api/generation/source', { method: 'POST', body: form, cache: 'no-store' });
      const sourceResult = await sourceResponse.json();
      if (!sourceResponse.ok || !sourceResult.sourceObjectRef) throw new Error(sourceResult.message || sourceResult.code || 'Temporary photo upload failed.');
      setSourceObjectRef(sourceResult.sourceObjectRef);
      setGenerationState('awaiting_payment');
      await startPayment(request, sourceResult.sourceObjectRef);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not prepare the secure checkout.';
      setGenerationState('error');
      setGenerationError(reason);
      setPaymentState('error');
      setPaymentError(reason);
    }
  }

  async function generatePaidGame(verifiedPaymentId: string) {
    setGenerationState('generating');
    setGenerationError(null);
    generationStartedAtRef.current = Date.now();
    track('generation_started', { jobId: jobId ?? undefined, adventure: theme });
    try {
      const generationResponse = await fetch('/api/generation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: verifiedPaymentId }),
        cache: 'no-store',
      });
      const generationResult = await generationResponse.json();
      if (!generationResponse.ok || !generationResult.ok) throw new Error(generationResult.message || generationResult.code || 'Paid generation could not be completed.');
      const result = generationResult.result;
      const atlas = result?.result?.atlas;
      const manifest = result?.result?.manifest as RuntimeManifest | undefined;
      if (!atlas?.data || atlas.encoding !== 'base64' || !manifest?.frame_layout?.rows) throw new Error('Generator succeeded but returned no playable atlas.');
      if (generationResult.game?.childName) setName(generationResult.game.childName);
      if (generationResult.game?.adventure) setTheme(generationResult.game.adventure);
      setJobId(generationResult.jobId ?? jobId);
      setCreated(true);
      setGeneratedAsset({ atlasDataUrl: `data:${atlas.mimeType || 'image/png'};base64,${atlas.data}`, manifest });
      resetRound();
      setGenerationState('succeeded');
      setPaymentState('paid');
      track('generation_succeeded', { jobId: generationResult.jobId ?? jobId ?? undefined, adventure: generationResult.game?.adventure ?? theme, durationMs: generationStartedAtRef.current ? Date.now() - generationStartedAtRef.current : undefined });
      generationStartedAtRef.current = null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Paid generation could not be completed.';
      setGenerationState('error');
      setGenerationError(reason);
      track('generation_failed', { jobId: jobId ?? undefined, adventure: theme, durationMs: generationStartedAtRef.current ? Date.now() - generationStartedAtRef.current : undefined, reason });
      generationStartedAtRef.current = null;
    }
  }

  function play() {
    resetRound();
    setPlaying(true);
    setFreeTrialStarted(true);
    gameStartedAtRef.current = Date.now();
    track('game_started', { jobId: jobId ?? undefined, adventure: theme });
  }

  function finishWin() {
    setGameWon(true);
    setPlaying(false);
    setAnimationState('celebrate');
    track('game_won', { jobId: jobId ?? undefined, adventure: theme, durationMs: gameStartedAtRef.current ? Date.now() - gameStartedAtRef.current : undefined });
    gameStartedAtRef.current = null;
  }

  function move(direction: -1 | 1) {
    if (!playing || gameWon || gameLost) return;
    const nextPosition = nextPlayerPosition(position, direction);
    setPosition(nextPosition);
    setAnimationState('walk');
    if (isCollectibleHit(nextPosition, starsCollected)) {
      const nextStars = starsCollected + 1;
      setStarsCollected(nextStars);
      setAnimationState('idle');
      if (hasWon(nextStars, nextPosition)) finishWin();
    } else if (starsCollected >= gameSpec.goalCount && hasWon(starsCollected, nextPosition)) finishWin();
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
        track('game_lost', { jobId: jobId ?? undefined, adventure: theme, durationMs: gameStartedAtRef.current ? Date.now() - gameStartedAtRef.current : undefined, reason: 'timer_expired' });
        gameStartedAtRef.current = null;
        return 0;
      }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [playing, racerMode, gameWon, gameLost, jobId, theme]);

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
      if (!photoDeletedRef.current) {
        track('photo_deleted', { jobId: jobId ?? undefined, adventure: theme, reason: 'ttl_expired' });
        photoDeletedRef.current = true;
      }
      setPhoto(null);
      setPhotoFile(null);
      setPhotoMeta(null);
      setConsent(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [photoMeta, jobId, theme]);

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
          setPaymentState('paid');
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
    if (!photoDeletedRef.current) {
      track('photo_deleted', { jobId: jobId ?? undefined, adventure: theme, reason: 'user_deleted' });
      photoDeletedRef.current = true;
    }
    setPhoto(null);
    setPhotoFile(null);
    setPhotoMeta(null);
    setConsent(false);
  }

  const spriteStyle = activeRect && generatedAsset ? { width: cellWidth, height: cellHeight, backgroundImage: `url(${generatedAsset.atlasDataUrl})`, backgroundRepeat: 'no-repeat', backgroundPosition: `-${activeRect.x}px -${activeRect.y}px`, backgroundSize: `${sheetWidth}px ${sheetHeight}px` } : undefined;
  const generationLabel = generationState === 'uploading' ? 'UPLOADING TEMPORARY PHOTO…' : generationState === 'awaiting_payment' ? 'AWAITING VERIFIED PAYMENT…' : generationState === 'generating' ? 'GENERATING PERSONAL GAME…' : generationState === 'succeeded' ? 'PERSONAL GAME READY' : generationState === 'error' ? 'NEEDS ATTENTION' : 'FREE STAGE';

  return (
    <main className="shell">
      <header className="top"><div className="brand">NAHALABS / NAHAKIDS</div><div className="badge">FREE STAGE • PAY LATER</div></header>
      <section className="hero"><div className="eyebrow">Try the game first</div><h1>{created ? `${name}'s personalised adventure is ready.` : 'Let your child play first. Pay only after they win.'}</h1><p>{created ? 'The personalised version is ready to play and share.' : 'Choose an adventure and let your child complete a full Stage 1 for free. No card. No payment before play.'}</p></section>

      <section className="workspace">
        <div className="card">
          <div className="section-kicker">01 / FREE TRIAL</div>
          <h2>Start Stage 1</h2>
          <p className="muted">Your child gets the whole first stage — collect every object, reach the finish and complete the adventure.</p>
          <label className="muted" htmlFor="name">Child&apos;s first name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lerato" style={{ width: '100%', padding: 13, marginTop: 6, border: '1px solid #dfe5dc', borderRadius: 12 }} />
          <div className="section-kicker adventure-kicker">02 / ADVENTURE</div>
          <h2>Choose an adventure</h2>
          <div className="themes">{themes.map(t => <button type="button" key={t.id} className={`theme ${theme === t.id ? 'active' : ''}`} disabled={playing} onClick={() => { setTheme(t.id); resetRound(); }}><b>{t.icon} {t.name}</b><span className="muted">{t.line}</span></button>)}</div>
          <button className="cta" disabled={!name.trim() || playing || (created && generationState === 'succeeded')} onClick={startFreeStage}>{created ? 'PERSONALISED GAME READY' : playing ? 'STAGE 1 IN PROGRESS…' : 'PLAY STAGE 1 FREE'}</button>
          <div className="muted" style={{ marginTop: 10 }}>No credit card required for the free stage.</div>
        </div>

        <div className="card game">
          <div><div className="section-kicker">03 / PLAY</div><h2>{created ? 'Personalised game' : 'Stage 1 — Free'}</h2><p className="muted">{created ? 'This is the paid personalised version.' : 'Play the complete first stage before any payment request appears.'}</p></div>
          <div className={`game-screen ${playing ? 'playing' : ''}`}>
            <div className="sun"/><div className="hill"/><div className="game-label">{selected.icon} {name || 'YOUR CHILD'} — {selected.name}</div>
            {playing && !gameWon && <div className="collectible" style={{ left: `${currentCollectiblePosition}%` }}>{gameSpec.collectible}</div>}
            {playing && <div className="finish-gate" style={{ left: `${gameSpec.goalPosition}%` }} aria-label={gameSpec.finish}>{gameSpec.finish}</div>}
            {generatedAsset && activeRect ? <div className="player generated-player" style={{ ...spriteStyle, left: `${position}%` }} aria-label="Generated child game character" /> : <div className="player" style={{ left: `${position}%` }} aria-label="Free trial game character" />}
            {playing && <div className="score">{racerMode ? `CHECKPOINTS ${starsCollected}/${gameSpec.goalCount}` : `${gameSpec.collectible} ${starsCollected}/${gameSpec.goalCount}`}</div>}
            {playing && racerMode && <div className="timer" aria-label={`Time remaining ${timeLeft} seconds`}><strong>{timeLeft}s</strong><span style={{ width: `${timerPercent}%` }} /></div>}
            {!playing && !gameWon && !gameLost && !freeTrialStarted && <div className="screen-message">Choose a name, pick an adventure and press PLAY STAGE 1 FREE.</div>}
            {!playing && gameWon && <div className="win-message"><strong>🎉 YOU DID IT!</strong><span>{name} completed the full free Stage 1: {gameSpec.objective}</span><button onClick={() => { if (created) play(); }}>PLAY AGAIN</button></div>}
            {!playing && gameLost && <div className="win-message"><strong>⏱️ TIME&apos;S UP!</strong><span>{name} missed the finish. Try the stage again.</span><button onClick={play}>TRY AGAIN</button></div>}
            {created && !playing && !gameWon && <button className="play-button" onClick={play}>▶ PLAY {name.toUpperCase()}</button>}
          </div>
          {playing && !gameWon && !gameLost && <div className="controls"><div className="game-title">{starsCollected >= gameSpec.goalCount ? gameSpec.actionHint : gameSpec.objective}</div><div className="control-row"><button onClick={() => move(-1)} aria-label="Move left">←</button><button onClick={() => move(1)} aria-label="Move right">→</button><button onClick={jump}>JUMP</button><button onClick={actionFeedback}>{gameSpec.actionLabel}</button><button className="stop" onClick={resetRound}>STOP</button></div><div className="muted">Use ← → or A / D to move. Space / W jumps. C triggers {gameSpec.actionLabel.toLowerCase()} feedback.</div></div>}
          {created && <div className="pipeline-card"><div className="pipeline-head"><strong>Personal game</strong><span>{generationLabel}</span></div><div className="pipeline-grid"><span>Adventure<strong>{selected.name}</strong></span><span>Animations<strong>Idle · Walk · Jump · Celebrate</strong></span><span>Safety<strong>No biometric ID</strong></span><span>Source<strong>Temporary • deleted after generation</strong></span></div></div>}
        </div>
      </section>

      {freeUnlockOpen && (
        <div role="dialog" aria-modal="true" aria-label="Unlock personalised NahaKids game" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(12, 18, 12, 0.64)' }}>
          <section className="card" style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 30px 90px rgba(0,0,0,.3)' }}>
            <div className="section-kicker">STAGE 1 COMPLETE</div>
            <h2>🎉 {name} did it!</h2>
            <p>{name} has completed the entire free first stage. Now create the personalised version with their own game character.</p>
            <div style={{ padding: 18, border: '1px solid #dfe5dc', borderRadius: 16, margin: '18px 0' }}>
              <strong>Unlock the personalised game — R499 once-off</strong>
              <div className="muted" style={{ marginTop: 8 }}>No subscription. No credit card required for the free trial. Pay securely with PayFast using an available South African payment method such as Instant EFT when enabled on the merchant account.</div>
            </div>
            <div className="drop">
              {photo ? <div className="photo-wrap"><img src={photo} alt="Temporary child preview" /><button className="delete-photo" onClick={deletePhoto}>Delete photo</button></div> : <div><strong>Now add {name}&apos;s photo</strong><br/><span className="muted">This is only needed for the paid personalised version.</span><br/><br/><label className="upload">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto}/></label><div className="photo-note">JPG, PNG or WebP • max 8 MB • temporary upload</div></div>}
            </div>
            <label className="consent" style={{ marginTop: 14 }}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I confirm I am authorised to provide this child&apos;s photo and consent to creating a stylised game character.</span></label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <button className="cta" disabled={!photoFile || !photoMeta || !consent || generationState === 'uploading' || generationState === 'awaiting_payment' || generationState === 'generating'} onClick={beginPersonalisation}>{generationState === 'uploading' ? 'PREPARING PHOTO…' : generationState === 'awaiting_payment' || paymentState === 'starting' ? 'OPENING SECURE PAYMENT…' : generationState === 'generating' ? 'CREATING GAME…' : 'UNLOCK PERSONALISED GAME — R499'}</button>
              <button type="button" onClick={() => { resetRound(); }}>PLAY FREE STAGE AGAIN</button>
            </div>
            {paymentError && <div className="muted" role="alert" style={{ marginTop: 12 }}>Payment: {paymentError}</div>}
            {generationError && <div className="muted" role="alert" style={{ marginTop: 8 }}>Generation: {generationError}</div>}
            {paymentState === 'pending' && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#f3f7f1' }}><strong>SECURE CHECKOUT IN PROGRESS</strong><div className="muted">Waiting for PayFast server confirmation before paid generation starts.</div></div>}
            {paymentState === 'paid' && generationState === 'generating' && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#f3f7f1' }}><strong>✅ PAYMENT VERIFIED</strong><div className="muted">Your payment is confirmed. We are now creating {name}&apos;s personalised game.</div></div>}
          </section>
        </div>
      )}

      <footer className="footer">NahaLabs • NahaKids • Full Stage 1 free • Pay once for the personalised game • No facial recognition • Original source photo is temporary and deleted after generation.</footer>
    </main>
  );
}
