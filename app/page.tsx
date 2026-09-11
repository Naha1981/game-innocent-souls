'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import type { CharacterGenerationRequest } from '../lib/game-factory/types';

type Theme = { id: CharacterGenerationRequest['adventure']; name: string; line: string; icon: string };
const themes: Theme[] = [
  { id: 'football', name: 'Street Football', line: 'Score your first goal.', icon: '⚽' },
  { id: 'hero', name: 'Superhero', line: 'Save the neighbourhood.', icon: '🦸' },
  { id: 'racer', name: 'Speed Racer', line: 'Beat the clock.', icon: '🏎️' },
  { id: 'space', name: 'Space Explorer', line: 'Reach the stars.', icon: '🚀' },
];

const PHOTO_TTL_MS = 15 * 60 * 1000;
type GenerationState = 'idle' | 'uploading' | 'generating' | 'succeeded' | 'error';

export default function Home() {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<CharacterGenerationRequest['adventure']>('football');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoMeta, setPhotoMeta] = useState<{ mimeType: string; sizeBytes: number; expiresAt: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [created, setCreated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [position, setPosition] = useState(42);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [sourceObjectRef, setSourceObjectRef] = useState<string | null>(null);

  const selected = useMemo(() => themes.find(t => t.id === theme)!, [theme]);

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
    setPlaying(false);
    setJobId(null);
    setSourceObjectRef(null);
    setGenerationState('idle');
    setGenerationError(null);
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
    setPlaying(false);
    setScore(0);
    setPosition(42);
    setGenerationError(null);
    setGenerationState('uploading');

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
      setGenerationState('succeeded');
    } catch (error) {
      setGenerationState('error');
      setGenerationError(error instanceof Error ? error.message : 'Generation could not be completed.');
    }
  }

  function play() {
    setPlaying(true);
    setScore(0);
    setPosition(42);
  }

  function move(direction: -1 | 1) {
    if (!playing) return;
    setPosition(p => Math.max(8, Math.min(82, p + direction * 7)));
    setScore(s => s + 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') move(-1);
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') move(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!photoMeta) return;
    const remaining = Math.max(0, new Date(photoMeta.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      setPhoto(null);
      setPhotoFile(null);
      setPhotoMeta(null);
      setCreated(false);
      setPlaying(false);
      setConsent(false);
      setJobId(null);
      setSourceObjectRef(null);
      setGenerationState('idle');
      setGenerationError(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [photoMeta]);

  function deletePhoto() {
    setPhoto(null);
    setPhotoFile(null);
    setPhotoMeta(null);
    setCreated(false);
    setPlaying(false);
    setConsent(false);
    setJobId(null);
    setSourceObjectRef(null);
    setGenerationState('idle');
    setGenerationError(null);
  }

  const generationLabel = generationState === 'uploading' ? 'UPLOADING TEMPORARY PHOTO…' : generationState === 'generating' ? 'GENERATING CHARACTER…' : generationState === 'succeeded' ? 'REAL GENERATION COMPLETE' : generationState === 'error' ? 'REAL GENERATION NEEDS ATTENTION' : 'READY FOR GENERATOR';

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
          <div className="themes">{themes.map(t => <button type="button" key={t.id} className={`theme ${theme === t.id ? 'active' : ''}`} onClick={() => setTheme(t.id)}><b>{t.icon} {t.name}</b><span className="muted">{t.line}</span></button>)}</div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I confirm I am authorised to provide this child&apos;s photo for this demo experience.</span></label>
          <button className="cta" disabled={!photoFile || !name.trim() || !consent || generationState === 'uploading' || generationState === 'generating'} onClick={createGame}>{generationState === 'uploading' ? 'UPLOADING…' : generationState === 'generating' ? 'GENERATING…' : 'CREATE GAME'}</button>
          {generationError && <div className="muted" role="alert" style={{ marginTop: 10 }}>Real generator: {generationError}</div>}
        </div>

        <div className="card game">
          <div><div className="section-kicker">03 / PLAYABLE PREVIEW</div><h2>Play</h2><p className="muted">The game loop is playable immediately. The character becomes a real generated asset only after the worker reports a successful sprite-gen run.</p></div>
          <div className={`game-screen ${playing ? 'playing' : ''}`}>
            <div className="sun"/><div className="hill"/>
            <div className="game-label">{created ? `${selected.icon} ${name} — ${selected.name}` : 'YOUR CHILD — ADVENTURE'}</div>
            <div className="collectible" style={{ left: `${Math.min(84, 18 + (score % 8) * 9)}%` }}>★</div>
            <div className="player" style={{ left: `${position}%` }} aria-label="Prototype player character" />
            {playing && <div className="score">STARS {score}</div>}
            {!created && <div className="screen-message">Create a hero to begin</div>}
            {created && !playing && <button className="play-button" onClick={play}>▶ PLAY {name.toUpperCase()}</button>}
          </div>
          {created ? <div className="pipeline-card">
            <div className="pipeline-head"><strong>Generation pipeline</strong><span>{generationLabel}</span></div>
            <div className="pipeline-grid"><span>Adventure<strong>{selected.name}</strong></span><span>Animations<strong>Idle · Walk · Jump · Celebrate</strong></span><span>Safety<strong>No biometric ID</strong></span><span>Source<strong>Temporary • deleted after generation</strong></span></div>
            <div className="pipeline-id">Job {jobId?.slice(0, 8)}…{sourceObjectRef ? ' • source secured' : ''}</div>
          </div> : <div><div className="game-title">Your game appears here</div><div className="steps"><span className="step">PHOTO</span><span className="step">CHARACTER</span><span className="step">ANIMATION</span><span className="step">PLAY</span></div></div>}
          {playing && <div className="controls"><div className="game-title">Help {name} collect stars!</div><div className="control-row"><button onClick={() => move(-1)} aria-label="Move left">←</button><button onClick={() => move(1)} aria-label="Move right">→</button><button className="stop" onClick={() => setPlaying(false)}>STOP</button></div><div className="muted">Use ← → or A / D on a keyboard.</div></div>}
        </div>
      </section>
      <footer className="footer">NahaLabs • Creche demo • No facial recognition • Browser preview expires after 15 minutes. Production source retention is worker-controlled and deletion is enforced after generation.</footer>
    </main>
  );
}
