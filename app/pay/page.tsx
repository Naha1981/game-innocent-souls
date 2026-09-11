'use client';

import { useState } from 'react';

type PackageId = 'starter' | 'hero' | 'family';

const packages: Array<{ id: PackageId; name: string; price: string; description: string }> = [
  { id: 'starter', name: 'Starter', price: 'R499', description: '1 child • personalised character • 1 mini-game' },
  { id: 'hero', name: 'Hero', price: 'R999', description: 'Character • 5–8 animations • environment • mini-game' },
  { id: 'family', name: 'Family', price: 'R1,999', description: 'Up to 4 children • family game experience' },
];

export default function PayPage() {
  const [loading, setLoading] = useState<PackageId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(packageId: PackageId) {
    setLoading(packageId);
    setError(null);
    try {
      const response = await fetch('/api/payments/payfast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package: packageId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.code || 'Could not start payment.');

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = result.action;
      form.style.display = 'none';
      for (const [name, value] of Object.entries(result.fields as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment.');
      setLoading(null);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 700 }}>
        <p style={{ letterSpacing: '.12em', fontWeight: 800, fontSize: 12 }}>NAHALABS / NAHAKIDS</p>
        <h1 style={{ fontSize: 'clamp(36px, 7vw, 64px)', lineHeight: 1, margin: '16px 0' }}>Give your child their own game.</h1>
        <p style={{ fontSize: 18, lineHeight: 1.6 }}>Choose a package and continue securely to Payfast. Payment confirmation is accepted only from the verified Payfast ITN—not from the browser return page.</p>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 36 }}>
        {packages.map((item) => (
          <article key={item.id} style={{ border: '1px solid #dfe5dc', borderRadius: 20, padding: 24, background: '#fff' }}>
            <p style={{ margin: 0, fontWeight: 800 }}>{item.name}</p>
            <strong style={{ display: 'block', fontSize: 34, margin: '12px 0' }}>{item.price}</strong>
            <p style={{ minHeight: 54, lineHeight: 1.5 }}>{item.description}</p>
            <button onClick={() => pay(item.id)} disabled={loading !== null} style={{ width: '100%', padding: 14, border: 0, borderRadius: 12, fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}>
              {loading === item.id ? 'CONNECTING TO PAYFAST…' : `PAY ${item.price}`}
            </button>
          </article>
        ))}
      </section>

      {error && <p role="alert" style={{ marginTop: 20 }}>Payment setup: {error}</p>}
      <p style={{ marginTop: 28, fontSize: 13, opacity: .7 }}>Secure checkout powered by Payfast by Network. No card details are handled by NahaKids.</p>
    </main>
  );
}
