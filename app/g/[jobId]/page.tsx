'use client';

import { useEffect, useMemo, useState } from 'react';
import { getThemeGameplay } from '../../../lib/game-factory/theme-gameplay';
import { collectiblePosition, isCollectibleHit, nextPlayerPosition } from '../../../lib/game-factory/gameplay';
import type { RuntimeManifest } from '../../../lib/game-factory/types';

type Game = { jobId: string; childName: string; adventure: 'football' | 'hero' | 'racer' | 'space'; atlas: { mimeType: string; data: string }; manifest: RuntimeManifest; paidAt?: string };

export default function SharedGame({ params }: { params: { jobId: string } }) {
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [position, setPosition] = useState(42);
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [frame, setFrame] = useState(0);
  const [state, setState] = useState<'idle' | 'walk' | 'jump' | 'celebrate'>('idle');

  const spec = useMemo(() => game ? getThemeGameplay(game.adventure) : null, [game]);
  const rects = game?.manifest.frame_layout?.rows?.[state] ?? [];
  const rect = rects[frame % Math.max(1, rects.length)];
  const cellWidth = game?.manifest.frame_layout?.cellWidth ?? 256;
  const cellHeight = game?.manifest.frame_layout?.cellHeight ?? 256;
  const sheetWidth = game?.manifest.frame_layout?.sheetWidth ?? 1024;
  const sheetHeight = game?.manifest.frame_layout?.sheetHeight ?? 1024;

  async function loadGame() {
    const response = await fetch(`/api/games/${encodeURIComponent(params.jobId)}`, { cache: 'no-store' });
    if (response.ok) {
      const result = await response.json();
      if (result.ok) { setGame(result.game); setLoading(false); setPending(false); return true; }
    }
    setLoading(false);
    return false;
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await loadGame();
      if (loaded || !alive) return;
      setPending(true);
      for (let i = 0; i < 20 && alive; i += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        if (await loadGame()) break;
      }
    })();
    return () => { alive = false; };
  }, [params.jobId]);

  useEffect(() => {
    if (!game || !rects.length) return;
    const durations = game.manifest.animation?.rows?.[state]?.durations_ms ?? [];
    const duration = durations[frame % Math.max(1, durations.length)] ?? (state === 'idle' ? 250 : 125);
    const timer = window.setTimeout(() => setFrame(value => (value + 1) % rects.length), Math.max(50, duration));
    return () => window.clearTimeout(timer);
  }, [game, state, frame, rects.length]);

  function move(direction: -1 | 1) {
    if (!game || !spec || won) return;
    const next = nextPlayerPosition(position, direction);
    setPosition(next); setState('walk');
    if (isCollectibleHit(next, score)) {
      const nextScore = score + 1;
      setScore(nextScore); setState('idle');
      if (nextScore >= spec.goalCount && next >= spec.goalPosition) { setWon(true); setState('celebrate'); }
    } else if (score >= spec.goalCount && next >= spec.goalPosition) { setWon(true); setState('celebrate'); }
  }

  if (loading) return <main className="shell"><section className="card" style={{ maxWidth: 720, margin: '80px auto' }}><div className="section-kicker">NAHAKIDS / LOADING</div><h1>Opening the game…</h1><p className="muted">Loading the personalised game record.</p></section></main>;
  if (!game) return <main className="shell"><section className="card" style={{ maxWidth: 720, margin: '80px auto' }}><div className="section-kicker">NAHAKIDS / PAYMENT</div><h1>{pending ? 'Payment is being verified…' : 'Game unavailable'}</h1><p className="muted">{pending ? 'Payfast has returned you to NahaKids. We are waiting for the server-side payment confirmation. This page will update automatically.' : 'This game does not exist, has not been paid for, or is no longer available.'}</p></section></main>;

  const spriteStyle = rect ? { width: cellWidth, height: cellHeight, backgroundImage: `url(data:${game.atlas.mimeType};base64,${game.atlas.data})`, backgroundRepeat: 'no-repeat', backgroundPosition: `-${rect.x}px -${rect.y}px`, backgroundSize: `${sheetWidth}px ${sheetHeight}px` } : undefined;
  const collectible = collectiblePosition(score);

  return <main className="shell">
    <header className="top"><div className="brand">NAHALABS / NAHAKIDS</div><div className="badge">SHARED GAME</div></header>
    <section className="hero"><div className="eyebrow">Personalised game • paid</div><h1>{game.childName}&apos;s {spec?.name ?? 'Adventure'}</h1><p>This is the permanent playable version. The original child photo is not part of this game.</p></section>
    <section className="card game" style={{ maxWidth: 980, margin: '0 auto 40px' }}>
      <div className="game-screen playing">
        <div className="sun"/><div className="hill"/>
        <div className="game-label">{game.childName} — {spec?.name}</div>
        {!won && <div className="collectible" style={{ left: `${collectible}%` }}>{spec?.collectible}</div>}
        <div className="finish-gate" style={{ left: `${spec?.goalPosition ?? 78}%` }} aria-label={spec?.finish}>{spec?.finish}</div>
        {spriteStyle && <div className="player generated-player" style={{ ...spriteStyle, left: `${position}%` }} aria-label={`${game.childName} game character`} />}
        <div className="score">{spec?.collectible} {score}/{spec?.goalCount}</div>
        {won && <div className="win-message"><strong>🎉 {game.childName.toUpperCase()} DID IT!</strong><span>{spec?.objective}</span><button onClick={() => { setPosition(42); setScore(0); setWon(false); setState('idle'); }}>PLAY AGAIN</button></div>}
      </div>
      {!won && <div className="controls"><div className="game-title">{score >= (spec?.goalCount ?? 5) ? spec?.actionHint : spec?.objective}</div><div className="control-row"><button onClick={() => move(-1)}>←</button><button onClick={() => move(1)}>→</button><button onClick={() => { setState('jump'); window.setTimeout(() => setState(current => current === 'jump' ? 'idle' : current), 650); }}>JUMP</button><button onClick={() => { setState('celebrate'); window.setTimeout(() => setState(current => current === 'celebrate' ? 'idle' : current), 900); }}>{spec?.actionLabel}</button></div><div className="muted">Move with ← → or tap the controls. Collect every {spec?.collectible}, then reach the finish.</div></div>}
      <div className="pipeline-card"><div className="pipeline-head"><strong>NAHAKIDS GAME</strong><span>PAYMENT VERIFIED</span></div><div className="pipeline-grid"><span>Character<strong>{game.childName}</strong></span><span>Adventure<strong>{spec?.name}</strong></span><span>Animations<strong>Idle · Walk · Jump · Celebrate</strong></span><span>Privacy<strong>Original photo not stored in game</strong></span></div></div>
    </section>
    <footer className="footer">Made by NahaLabs • NahaKids • Share this link with family and friends.</footer>
  </main>;
}
