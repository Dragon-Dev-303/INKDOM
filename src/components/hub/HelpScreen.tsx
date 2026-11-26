'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { HubPage, Panel } from './ui';

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: 'How do I win a match?', a: 'Attackers win by reaching the roof and holding the flag until the capture bar fills, or by knocking out the defending boss. Defenders win by surviving until the timer ends or knocking out the attacker.' },
  { q: 'Can I change the keys?', a: <>Yes. Open <Link href="/settings">Settings → Controls</Link>, pick a scheme and press the new key for any action.</> },
  { q: 'What do Live, Preview and Soon mean?', a: 'Live screens work now. Preview screens are the finished design shown with sample data, so you can see what is coming. Soon means planned.' },
  { q: 'Do purchases make me stronger?', a: 'No. Points buy cosmetics and convenience. Competitive power is capped or normalised so buying never decides a fight (GDD §10).' },
  { q: 'How does territory work?', a: <>Ten buildings make a city. Hold 6 to govern a city and all 10 for full control (proposed thresholds). See the <Link href="/world">world map</Link>.</> },
  { q: 'Why can’t my building be attacked at any time?', a: 'Each building has a weekly vulnerability window. Outside it the building is safe, so nobody has to defend around the clock.' },
  { q: 'Can I play without an account?', a: <>Local play works without one. Create an account on the <Link href="/account">account page</Link> to keep points and cosmetics.</> },
];

const REASONS = ['Cheating or exploits', 'Harassment or hate speech', 'Offensive name or emblem', 'Griefing / AFK', 'Real-money trading', 'Other'];

export default function HelpScreen() {
  const [sent, setSent] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <HubPage featureId="help">
      <div className="hub-grid hub-grid-main">
        <Panel title="Frequently asked" icon="❓">
          <div className="hub-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div>{f.a}</div>
              </details>
            ))}
          </div>
        </Panel>
        <div className="hub-stack">
          <Panel title="Report a player" icon="🚩">
            {sent ? (
              <div className="notice info" role="status">
                Preview only: reports are not sent yet. Reporting and moderation arrive with online play.
                <div style={{ marginTop: 8 }}><button className="btn small" onClick={() => setSent(false)}>New report</button></div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="hub-field">
                  <label htmlFor="rep-name">Player name</label>
                  <input id="rep-name" className="hub-input" required maxLength={40} autoComplete="off" />
                </div>
                <div className="hub-field">
                  <label htmlFor="rep-reason">Reason</label>
                  <select id="rep-reason" className="hub-select" defaultValue={REASONS[0]}>
                    {REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="hub-field">
                  <label htmlFor="rep-details">What happened?</label>
                  <textarea id="rep-details" className="hub-textarea" maxLength={1000} placeholder="Match, time and what you saw" />
                </div>
                <button className="btn primary" type="submit">Submit report</button>
                <p className="muted small" style={{ marginTop: 8 }}>Preview: nothing is sent yet.</p>
              </form>
            )}
          </Panel>
          <Panel title="Contact" icon="✉">
            <p className="small">Found a bug or have an idea? Use <strong>Give feedback</strong> on the results screen after a local match. It goes straight to the team.</p>
            <div className="hub-row">
              <Link href="/play" className="btn small">Play a match</Link>
              <Link href="/settings" className="btn small">Privacy settings</Link>
            </div>
          </Panel>
        </div>
      </div>
    </HubPage>
  );
}
