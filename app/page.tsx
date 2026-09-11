'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
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

type GameProps = {
  jobId: string | null;
  adventure: CharacterGenerationRequest['adventure'];
  name: string;
  photo: string | null;
};

export default function Home() {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<CharacterGenerationRequest['adventure']>('football');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoMeta, setPhotoMeta] = useState<{ mimeType: string; sizeBytes: number; expiresAt: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [gameLost, setGameLost] = useState(false);
  const [starsCollected, setStarsCollected] = useState(0);
  const [position, setPosition] = useState(PLAYER_START_POSITION);
  const [timeLeft, setTimeLeft] = useState(30);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedAsset, setGeneratedAsset] = useState<GeneratedAsset | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [animationState, setAnimationState] = useState<'idle' | 'walk' | 'jump' | 'celebrate'>('idle');
  const [frameIndex, setFrameIndex] = useState(0);

  const selected = useMemo(() => themes.find(t => t.id === theme)!, [theme]);
  const gameSpec = useMemo(() => getThemeGameplay(theme), [theme]);
  const racerMode = theme === 'racer';
  const activeRects = generatedAsset?.manifest.frame_layout?.rows?.[animationState] ?? [];
  const activeRect = activeRects[frameIndex % Math.max(1, activeRects.length)];

  function track(event: GameTelemetryEvent['event'], extra: Record<string, unknown> = {}) {
    void fetch('/api/telemetry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, ...extra }), keepalive: true }).catch(() => {});
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
  }

  function handleImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
    setPhotoFile(file);
    setPhotoMeta({ mimeType: file.type, sizeBytes: file.size, expiresAt: new Date(Date.now() + PHOTO_TTL_MS).toISOString() });
    setGeneratedAsset(null);
    setPaymentState('idle');
    setGenerationState('idle');
    setGenerationError(null);
    setPaymentError(null);
    resetRound();
    track('photo_selected', { adventure: theme });
  }

  function playFreeStage() {
    if (!photo || !photoFile || !consent || !name.trim()) return;
    resetRound();
    setPlaying(true);
    track('game_started', { adventure: theme });
  }

  function finishWin() {
    setGameWon(true);
    setPlaying(false);
    setAnimationState('celebrate');
    track('game_won', { adventure: theme });
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
    } else if (starsCollected >= gameSpec.goalCount && hasWon(starsCollected, next)) finishWin();
  }

  function jump() {
    if (!playing || gameWon || gameLost) return;
    setAnimationState('jump');
    window.setTimeout(() => setAnimationState(current => current === 'jump' ? 'idle' : current), 650);
  }

  function action() {
    if (!playing || gameWon || gameLost) return;
    setAnimationState('celebrate');
    window.setTimeout(() => setAnimationState(current => current === 'celebrate' ? 'idle' : current), 900);
  }

  async function unlockPersonalisedGame() {
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
    setGenerationState('uploading');
    setPaymentState('starting');
    setGenerationError(null);
    setPaymentError(null);
    try {
      const upload = new FormData();
      upload.append('file', photoFile, photoFile.name || 'child-image');
      const sourceResponse = await fetch('/api/generation/source', { method: 'POST', body: upload, cache: 'no-store' });
      const source = await sourceResponse.json();
      if (!sourceResponse.ok || !source.sourceObjectRef) throw new Error(source.message || source.code || 'Image upload failed.');
      setGenerationState('awaiting_payment');
      const paymentResponse = await fetch('/api/payments/payfast', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package: 'hero', jobId: request.jobId, sourceObjectRef: source.sourceObjectRef, generationRequest: request }),
      });
      const payment = await paymentResponse.json();
      if (!paymentResponse.ok || !payment.ok) throw new Error(payment.code || 'Could not start secure checkout.');
      setPaymentId(payment.paymentId);
      setPaymentState('pending');
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = payment.action;
      form.style.display = 'none';
      for (const [key, value] of Object.entries(payment.fields as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = key; input.value = value; form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Secure checkout could not be started.';
      setPaymentState('error');
      setGenerationState('error');
      setPaymentError(message);
      setGenerationError(message);
    }
  }

  async function generatePaidGame(verifiedPaymentId: string) {
    setGenerationState('generating');
    try {
      const response = await fetch('/api/generation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentId: verifiedPaymentId }), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || result.code || 'Paid generation failed.');
      const atlas = result.result?.result?.atlas;
      const manifest = result.result?.result?.manifest as RuntimeManifest | undefined;
      if (!atlas?.data || atlas.encoding !== 'base64' || !manifest?.frame_layout?.rows) throw new Error('Generator returned no playable atlas.');
      if (result.game?.childName) setName(result.game.childName);
      if (result.game?.adventure) setTheme(result.game.adventure);
      setJobId(result.jobId ?? null);
      setGeneratedAsset({ atlasDataUrl: `data:${atlas.mimeType || 'image/png'};base64,${atlas.data}`, manifest });
      setPaymentState('paid');
      setGenerationState('succeeded');
      resetRound();
      track('generation_succeeded', { jobId: result.jobId ?? undefined, adventure: result.game?.adventure ?? theme });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paid generation failed.';
      setGenerationState('error');
      setGenerationError(message);
      track('generation_failed', { jobId: jobId ?? undefined, adventure: theme, reason: message });
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') move(-1);
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') move(1);
      if (e.key === ' ' || e.key.toLowerCase() === 'w') jump();
      if (e.key.toLowerCase() === 'c') action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!playing || !racerMode || gameWon || gameLost) return;
    const timer = window.setInterval(() => setTimeLeft(current => {
      if (current <= 1) {
        window.clearInterval(timer);
        setGameLost(true); setPlaying(false); setAnimationState('idle');
        track('game_lost', { adventure: theme, reason: 'timer_expired' });
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
    const returnedPaymentId = new URLSearchParams(window.location.search).get('m_payment_id');
    if (!returnedPaymentId) return;
    setPaymentId(returnedPaymentId); setPaymentState('pending'); setGenerationState('awaiting_payment');
    let attempts = 0; let generating = false;
    const poll = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/payments/payfast/status?m_payment_id=${encodeURIComponent(returnedPaymentId)}`, { cache: 'no-store' });
        const result = await response.json();
        if (response.ok && result.status === 'paid' && !generating) {
          generating = true; window.clearInterval(poll); await generatePaidGame(returnedPaymentId);
        }
      } catch {}
      if (attempts >= 20) window.clearInterval(poll);
    }, 3000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!photoMeta) return;
    const timer = window.setTimeout(() => {
      setPhoto(null); setPhotoFile(null); setPhotoMeta(null); resetRound();
    }, Math.max(0, new Date(photoMeta.expiresAt).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [photoMeta]);

  const freePlayerStyle = photo ? { width: 104, height: 104, borderRadius: '50%', backgroundImage: `url(${photo})`, backgroundSize: 'cover', backgroundPosition: 'center', border: '6px solid rgba(255,255,255,.95)', boxShadow: '0 8px 28px rgba(0,0,0,.18)' } : undefined;
  const spriteStyle = activeRect && generatedAsset ? { width: generatedAsset.manifest.frame_layout?.cellWidth ?? 256, height: generatedAsset.manifest.frame_layout?.cellHeight ?? 256, backgroundImage: `url(${generatedAsset.atlasDataUrl})`, backgroundRepeat: 'no-repeat', backgroundPosition: `-${activeRect.x}px -${activeRect.y}px`, backgroundSize: `${generatedAsset.manifest.frame_layout?.sheetWidth ?? 1024}px ${generatedAsset.manifest.frame_layout?.sheetHeight ?? 1024}px` } : undefined;

  return <main className="shell">
    <header className="top"><div className="brand">NAHALABS / NAHAKIDS</div><div className="badge">PLAY FREE • UNLOCK LATER</div></header>
    <section className="hero"><div className="eyebrow">Your face or your drawing becomes the hero</div><h1>Put yourself inside the game.</h1><p>Upload a photo or drawing, play the entire first stage free, and only see the payment offer after you win.</p></section>
    <section className="workspace">
      <div className="card">
        <div className="section-kicker">01 / YOUR HERO</div><h2>Upload a photo or drawing</h2><p className="muted">For the free stage, the image stays in your browser. We only upload it for AI character generation after the parent chooses to unlock.</p>
        <label className="muted" htmlFor="name">Child&apos;s first name</label><input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lerato" style={{ width: '100%', padding: 13, marginTop: 6, border: '1px solid #dfe5dc', borderRadius: 12 }} />
        <div className="drop">{photo ? <div className="photo-wrap"><img src={photo} alt="Child photo or drawing" /><button className="delete-photo" onClick={() => { setPhoto(null); setPhotoFile(null); setPhotoMeta(null); resetRound(); }}>Choose another</button></div> : <div><strong>Upload the hero image</strong><br/><span className="muted">Photo or drawing • JPG, PNG or WebP • max 8 MB</span><br/><br/><label className="upload">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage}/></label></div>}</div>
        <div className="section-kicker adventure-kicker">02 / ADVENTURE</div><h2>Choose a Stage 1 adventure</h2>
        <div className="themes">{themes.map(t => <button type="button" key={t.id} className={`theme ${theme === t.id ? 'active' : ''}`} onClick={() => { setTheme(t.id); resetRound(); }}><b>{t.icon} {t.name}</b><span className="muted">{t.line}</span></button>)}</div>
        <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I am authorised to use this child&apos;s image for this experience.</span></label>
        <button className="cta" disabled={!photo || !photoFile || !name.trim() || !consent || playing} onClick={playFreeStage}>{playing ? 'STAGE 1 IN PROGRESS…' : 'PLAY STAGE 1 FREE'}</button>
      </div>

      <div className="card game">
        <div className="section-kicker">03 / THE HOOK</div><h2>{name ? `${name}&apos;s ${selected.name}` : 'See yourself in the game'}</h2><p className="muted">Complete the entire first stage. Collect every item and reach the finish.</p>
        <div className={`game-screen ${playing ? 'playing' : ''}`}>
          <div className="sun"/><div className="hill"/><div className="game-label">{photo ? `${selected.icon} ${name || 'YOUR HERO'} — ${selected.name}` : 'UPLOAD YOUR HERO TO START'}</div>
          {playing && !gameWon && <div className="collectible" style={{ left: `${collectiblePosition(starsCollected)}%` }}>{gameSpec.collectible}</div>}
          {playing && <div className="finish-gate" style={{ left: `${gameSpec.goalPosition}%` }} aria-label={gameSpec.finish}>{gameSpec.finish}</div>}
          {generatedAsset && activeRect ? <div className="player generated-player" style={{ ...spriteStyle, left: `${position}%` }} aria-label={`${name} personalised game character`} /> : photo ? <div className="player" style={{ ...freePlayerStyle, left: `${position}%` }} aria-label={`${name} free-stage hero`} /> : <div className="player" style={{ left: `${position}%` }} />}
          {playing && <div className="score">{racerMode ? `CHECKPOINTS ${starsCollected}/${gameSpec.goalCount}` : `${gameSpec.collectible} ${starsCollected}/${gameSpec.goalCount}`}</div>}
          {playing && racerMode && <div className="timer"><strong>{timeLeft}s</strong><span style={{ width: `${Math.max(0, Math.min(100, (timeLeft / (gameSpec.timeLimitSeconds ?? 30)) * 100))}%` }}/></div>}
          {!photo && <div className="screen-message">Upload a photo or drawing. Then watch yourself become the hero.</div>}
          {photo && !playing && !gameWon && !gameLost && <button className="play-button" onClick={playFreeStage}>▶ PLAY FREE</button>}
          {gameLost && <div className="win-message"><strong>⏱️ TRY AGAIN</strong><span>Stage 1 is still free.</span><button onClick={playFreeStage}>PLAY AGAIN</button></div>}
          {gameWon && <div className="win-message"><strong>🎉 {name.toUpperCase()} DID IT!</strong><span>You completed the whole free Stage 1.</span></div>}
        </div>
        {playing && !gameWon && !gameLost && <div className="controls"><div className="game-title">{starsCollected >= gameSpec.goalCount ? gameSpec.actionHint : gameSpec.objective}</div><div className="control-row"><button onClick={() => move(-1)}>←</button><button onClick={() => move(1)}>→</button><button onClick={jump}>JUMP</button><button onClick={action}>{gameSpec.actionLabel}</button><button className="stop" onClick={resetRound}>STOP</button></div><div className="muted">Use ← → or A / D. Space / W jumps.</div></div>}
        <div className="pipeline-card"><div className="pipeline-head"><strong>NAHAKIDS JOURNEY</strong><span>{gameWon ? 'NOW UNLOCK' : 'FREE STAGE'}</span></div><div className="pipeline-grid"><span>1<strong>Upload photo/drawing</strong></span><span>2<strong>Play Stage 1 free</strong></span><span>3<strong>Child wins</strong></span><span>4<strong>Parent unlocks R499</strong></span></div></div>
      </div>
    </section>

    {gameWon && !generatedAsset && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Unlock personalised game"><div className="card" style={{ maxWidth: 560, margin: '8vh auto' }}><div className="section-kicker">🎉 THE HOOK</div><h2>{name} just finished the free game.</h2><p className="muted">Now give them the version where the photo/drawing becomes a real personalised game character with proper idle, walk, jump and celebration animations.</p><div className="pipeline-grid"><span>PRICE<strong>R499 once-off</strong></span><span>NO SUBSCRIPTION<strong>Pay once</strong></span><span>NO CREDIT CARD REQUIRED<strong>Use an available PayFast local payment method</strong></span><span>PRIVACY<strong>Image is uploaded only after unlock</strong></span></div><button className="cta" onClick={unlockPersonalisedGame} disabled={paymentState === 'starting' || paymentState === 'pending'}>{paymentState === 'starting' ? 'STARTING CHECKOUT…' : paymentState === 'pending' ? 'WAITING FOR PAYMENT…' : `UNLOCK ${name.toUpperCase()} — R499`}</button><button className="delete-photo" onClick={() => setGameWon(false)} style={{ marginTop: 10 }}>Close — keep playing free</button>{paymentError && <div className="muted" role="alert" style={{ marginTop: 12 }}>{paymentError}</div>}</div></div>}

    {generationState === 'generating' && <div className="modal-backdrop"><div className="card" style={{ maxWidth: 500, margin: '15vh auto' }}><div className="section-kicker">PERSONALISING</div><h2>Creating {name}&apos;s real game character…</h2><p className="muted">Payment is verified. The personalised character is now being generated.</p></div></div>}
    {generationState === 'succeeded' && generatedAsset && <div className="modal-backdrop"><div className="card" style={{ maxWidth: 560, margin: '8vh auto' }}><div className="section-kicker">✅ UNLOCKED</div><h2>{name}&apos;s personalised game is ready.</h2><p className="muted">The free stage is now upgraded to the full personalised experience.</p><button className="cta" onClick={() => { resetRound(); setPlaying(true); }}>PLAY FULL GAME</button></div></div>}

    <footer className="footer">NahaLabs • NahaKids • Play the first stage free with your photo or drawing. Pay only after the child wins.</footer>
  </main>;
}
