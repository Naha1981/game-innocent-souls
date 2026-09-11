'use client';

import { ChangeEvent, useMemo, useState } from 'react';

type Theme = { id: string; name: string; line: string };
const themes: Theme[] = [
  { id: 'football', name: '⚽ Street Football', line: 'Score your first goal.' },
  { id: 'hero', name: '🦸 Superhero', line: 'Save the neighbourhood.' },
  { id: 'racer', name: '🏎️ Speed Racer', line: 'Beat the clock.' },
  { id: 'space', name: '🚀 Space Explorer', line: 'Reach the stars.' },
];

export default function Home() {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('football');
  const [photo, setPhoto] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [created, setCreated] = useState(false);

  const selected = useMemo(() => themes.find(t => t.id === theme)!, [theme]);

  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
    setCreated(false);
  }

  function createGame() {
    if (!photo || !consent || !name.trim()) return;
    setCreated(true);
  }

  return (
    <main className="shell">
      <header className="top"><div className="brand">NAHALABS / KIDS GAME FACTORY</div><div className="badge">DEMO • SOWETO</div></header>
      <section className="hero">
        <div className="eyebrow">From photo → character → game</div>
        <h1>Turn a child’s imagination into a game.</h1>
        <p>For creches, schools and families. Upload a photo with guardian permission, choose an adventure, and create a personalised mini-game experience.</p>
      </section>

      <section className="workspace">
        <div className="card">
          <h2>1. Create the hero</h2>
          <p className="muted">This demo keeps the original photo in the browser. Production will use temporary processing and automatic deletion.</p>
          <label className="muted" htmlFor="name">Child&apos;s first name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lerato" style={{width:'100%',padding:13,marginTop:6,border:'1px solid #dfe5dc',borderRadius:12}} />
          <div className="drop">
            {photo ? <img src={photo} alt="Temporary child preview" /> : <div><strong>Choose a photo</strong><br/><span className="muted">A guardian or authorised teacher should provide consent.</span><br/><br/><label className="upload">Upload photo<input type="file" accept="image/*" onChange={handlePhoto}/></label></div>}
          </div>
          {photo && <label className="upload" style={{marginTop:12}}>Replace photo<input type="file" accept="image/*" onChange={handlePhoto}/></label>}
          <h2 style={{marginTop:24}}>2. Choose an adventure</h2>
          <div className="themes">{themes.map(t => <button key={t.id} className={`theme ${theme===t.id?'active':''}`} onClick={() => setTheme(t.id)}><b>{t.name}</b><span className="muted">{t.line}</span></button>)}</div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I confirm I am authorised to provide this child&apos;s photo for this demo experience.</span></label>
          <button className="cta" disabled={!photo || !name.trim() || !consent} onClick={createGame}>CREATE {name ? `${name.toUpperCase()}'S` : 'THE'} GAME</button>
        </div>

        <div className="card game">
          <div><h2>3. Play</h2><p className="muted">The production pipeline will replace this preview with generated character sprites and a reusable web-game template.</p></div>
          <div className="game-screen">
            <div className="sun"/><div className="hill"/><div className="player"/>
            <div style={{position:'absolute',left:20,top:18,fontWeight:900}}>{created ? `${name} — ${selected.name}` : 'YOUR CHILD — ADVENTURE'}</div>
          </div>
          <div><div className="game-title">{created ? `🎮 ${selected.name} is ready!` : 'Your game appears here'}</div><div className="steps"><span className="step">PHOTO</span><span className="step">CHARACTER</span><span className="step">ANIMATION</span><span className="step">PLAY</span></div></div>
        </div>
      </section>
      <footer className="footer">NahaLabs • Prototype for tomorrow&apos;s creche demo • No facial recognition • Production version will include consent, retention controls and deletion.</footer>
    </main>
  );
}
