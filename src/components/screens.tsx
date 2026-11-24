'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTROL_LABELS } from '@/game/config/controls';
import { BUILD_VERSION, TUNING } from '@/game/config/tuning';
import type { MatchResults } from '@/game/sim/match';
import type { Controller, MatchConfig, WeaponId } from '@/game/sim/types';
import { DEFAULT_SETTINGS, type Settings } from '@/game/settings';
import type { FeedbackPayload } from '@/lib/api';
import MapPreview from './MapPreview';

/** Keyboard navigation for menus: arrows move focus, Esc goes back, first button autofocuses. */
function MenuCard({ children, onBack, narrow, overlay }: { children: ReactNode; onBack?: () => void; narrow?: boolean; overlay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onBack) { e.preventDefault(); onBack(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range')) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea'));
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (idx < 0) return;
      e.preventDefault();
      const next = items[(idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      next.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <div className={`screen${overlay ? ' overlay' : ''}`}>
      <div ref={ref} className={`card${narrow ? ' narrow' : ''}`}>{children}</div>
    </div>
  );
}

// ---------------- Home ----------------
export function HomeScreen(props: { onPlay: () => void; onHowTo: () => void; onSettings: () => void; onFeedback: () => void; touchOnly: boolean }) {
  return (
    <MenuCard narrow>
      <h1 className="title"><span className="atk">INK</span><span className="def">DOM</span></h1>
      <p className="subtitle">Beta</p>
      {props.touchOnly && <div className="notice">This beta needs a desktop keyboard (two players share one keyboard).</div>}
      <div className="menu">
        <button className="btn primary" onClick={props.onPlay} data-autofocus>PLAY LOCAL</button>
        <button className="btn" onClick={props.onHowTo}>HOW TO PLAY</button>
        <button className="btn" onClick={props.onSettings}>SETTINGS</button>
      </div>
      <div className="footer-line">
        <button className="link" onClick={props.onFeedback}>Give feedback</button>
        <span>v{BUILD_VERSION}</span>
      </div>
    </MenuCard>
  );
}

// ---------------- How to play ----------------
function KeyTable({ player }: { player: 0 | 1 }) {
  const L = player === 0 ? CONTROL_LABELS.p1 : CONTROL_LABELS.p2;
  const rows: [string, string][] = [
    ['Move', L.move], ['Jump (tap) / climb stairs & ladder (hold)', L.jumpClimb], ['Go down stairs / ladder', L.down],
    ['Punch', L.punch], ['Kick', L.kick], ['Weapon strike', L.weapon], ['Block (hold)', L.block], ['Squad command', L.command],
  ];
  return (
    <table className="keys">
      <tbody>
        {rows.map(([a, k]) => (
          <tr key={a}><td>{a}</td><td><kbd>{k}</kbd></td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function HowToContent() {
  return (
    <>
      <h3>Objective</h3>
      <p>
        <strong style={{ color: 'var(--attacker)' }}>▲ Attackers</strong> start in the street. Fight up through four floors and stand in the
        rooftop flag zone. Hold it with <strong>no defender inside</strong> for {TUNING.match.captureSeconds} seconds to win.
        <br />
        <strong style={{ color: 'var(--defender)' }}>■ Defenders</strong> start on the top floors. Stop the capture until the{' '}
        {Math.floor(TUNING.match.timerSeconds / 60)}:00 timer runs out. A defender in the zone pauses the capture. An empty zone slowly loses progress.
      </p>
      <div className="two-col">
        <div><h3>Player 1 (left side of keyboard)</h3><KeyTable player={0} /></div>
        <div><h3>Player 2 (right side of keyboard)</h3><KeyTable player={1} /></div>
      </div>
      <h3>Squad commands (cycle with your command key)</h3>
      <ul className="tips">
        <li><strong>FOLLOW</strong>: your 3 bots stay with you and fight enemies near you.</li>
        <li><strong>HOLD</strong>: bots guard the spot where you gave the order.</li>
        <li><strong>ATTACK</strong>: attacker bots push to the flag; defender bots hunt the nearest attacker.</li>
      </ul>
      <h3>Tips</h3>
      <ul className="tips">
        <li>The outside <strong>ladder</strong> to the floor-2 window is a shortcut for attackers.</li>
        <li>Walk off the edge of a <strong>stairwell opening</strong> (yellow marks) to drop one floor fast.</li>
        <li>Blocking stops most damage from the front, but the <strong>iron bar breaks a block</strong>.</li>
        <li>Too many hits in a row knock a fighter down. Only two bots can attack one target at once.</li>
        <li>KO&apos;d fighters respawn: bosses after {TUNING.fighters.bossRespawnSeconds}s, bots after {TUNING.fighters.botRespawnSeconds}s.</li>
        <li><kbd>Esc</kbd> pauses, <kbd>M</kbd> mutes.</li>
      </ul>
    </>
  );
}

export function HowToScreen({ onBack }: { onBack: () => void }) {
  return (
    <MenuCard onBack={onBack}>
      <h2>How to play</h2>
      <HowToContent />
      <div className="row"><button className="btn primary" onClick={onBack} data-autofocus>BACK</button></div>
    </MenuCard>
  );
}

// ---------------- Settings ----------------
export function SettingsScreen({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <MenuCard onBack={onBack} narrow>
      <h2>Settings</h2>
      <div className="setting">
        <label htmlFor="mv">Master volume</label>
        <input id="mv" type="range" min={0} max={1} step={0.05} value={settings.masterVolume} onChange={(e) => set('masterVolume', +e.target.value)} />
      </div>
      <div className="setting">
        <label htmlFor="sv">Effects volume</label>
        <input id="sv" type="range" min={0} max={1} step={0.05} value={settings.sfxVolume} onChange={(e) => set('sfxVolume', +e.target.value)} />
      </div>
      <Toggle id="mute" label="Mute (M)" checked={settings.muted} onChange={(v) => set('muted', v)} />
      <Toggle id="hints" label="Show control hints in game" checked={settings.showHints} onChange={(v) => set('showHints', v)} />
      <Toggle id="shake" label="Screen shake" checked={settings.screenShake} onChange={(v) => set('screenShake', v)} />
      <Toggle id="hc" label="High-contrast team colours" checked={settings.colorScheme === 'highContrast'} onChange={(v) => set('colorScheme', v ? 'highContrast' : 'standard')} />
      <Toggle id="fps" label="Show FPS" checked={settings.showFps} onChange={(v) => set('showFps', v)} />
      <Toggle id="share" label="Share anonymous match stats (helps the playtest)" checked={settings.shareStats} onChange={(v) => set('shareStats', v)} />
      <p className="muted small">Settings are saved in this browser only. Match stats are anonymous: no name, account or personal data.</p>
      <div className="row spread">
        <button className="btn" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>RESET</button>
        <button className="btn primary" onClick={onBack} data-autofocus>BACK</button>
      </div>
    </MenuCard>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

// ---------------- Match setup ----------------
export function SetupScreen({ config, onChange, onStart, onBack }: { config: MatchConfig; onChange: (c: MatchConfig) => void; onStart: () => void; onBack: () => void }) {
  const teamOf = (p: 0 | 1) => (p === 0 ? config.p1Team : config.p1Team === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER');
  const setWeapon = (p: 0 | 1, w: WeaponId) => {
    const weapons = [...config.weapons] as [WeaponId, WeaponId];
    weapons[p] = w;
    onChange({ ...config, weapons });
  };
  const setController = (c: Controller) => onChange({ ...config, controllers: ['HUMAN', c] });
  const box = (p: 0 | 1) => {
    const team = teamOf(p);
    const cls = team === 'ATTACKER' ? 'attacker' : 'defender';
    return (
      <div className={`player-box ${cls}`}>
        <h4>
          <span>{p === 0 ? 'Player 1 (WASD)' : 'Player 2 (Arrows)'}</span>
          <span className={`tag ${cls}`}>{team === 'ATTACKER' ? '▲ ATTACKER' : '■ DEFENDER'}</span>
        </h4>
        {p === 0 && (
          <div className="field">
            <label>Side</label>
            <div className="segmented">
              <button className={`btn${config.p1Team === 'ATTACKER' ? ' active' : ''}`} onClick={() => onChange({ ...config, p1Team: 'ATTACKER' })}>Attacker</button>
              <button className={`btn${config.p1Team === 'DEFENDER' ? ' active' : ''}`} onClick={() => onChange({ ...config, p1Team: 'DEFENDER' })}>Defender</button>
            </div>
          </div>
        )}
        {p === 1 && (
          <div className="field">
            <label>Controlled by</label>
            <div className="segmented">
              <button className={`btn${config.controllers[1] === 'HUMAN' ? ' active' : ''}`} onClick={() => setController('HUMAN')}>Human</button>
              <button className={`btn${config.controllers[1] === 'CPU' ? ' active' : ''}`} onClick={() => setController('CPU')}>CPU (practice)</button>
            </div>
          </div>
        )}
        <div className="field">
          <label>Weapon</label>
          <div className="segmented">
            <button className={`btn${config.weapons[p] === 'SHORT_SWORD' ? ' active' : ''}`} onClick={() => setWeapon(p, 'SHORT_SWORD')}>Short sword</button>
            <button className={`btn${config.weapons[p] === 'IRON_BAR' ? ' active' : ''}`} onClick={() => setWeapon(p, 'IRON_BAR')}>Iron bar</button>
          </div>
        </div>
      </div>
    );
  };
  return (
    <MenuCard onBack={onBack}>
      <h2>Match setup</h2>
      <div className="setup-grid">{box(0)}{box(1)}</div>
      <div className="preview"><MapPreview /></div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Capture: {TUNING.match.captureSeconds}s uncontested · Timer: {Math.floor(TUNING.match.timerSeconds / 60)}:00 · Each boss leads 3 bots ·
        Sword is quicker with more reach; the bar hits harder and breaks blocks.
      </p>
      <div className="row spread">
        <button className="btn" onClick={onBack}>BACK</button>
        <button className="btn primary" onClick={onStart} data-autofocus>START MATCH</button>
      </div>
    </MenuCard>
  );
}

// ---------------- Pause ----------------
export function PauseMenu({ onResume, onRestart, onQuit }: { onResume: () => void; onRestart: () => void; onQuit: () => void }) {
  const [showControls, setShowControls] = useState(false);
  if (showControls) {
    return (
      <MenuCard overlay onBack={() => setShowControls(false)}>
        <h2>Controls</h2>
        <HowToContent />
        <div className="row"><button className="btn primary" onClick={() => setShowControls(false)} data-autofocus>BACK</button></div>
      </MenuCard>
    );
  }
  return (
    <MenuCard overlay narrow onBack={onResume}>
      <h2 className="pause-title">PAUSED</h2>
      <div className="menu">
        <button className="btn primary" onClick={onResume} data-autofocus>RESUME</button>
        <button className="btn" onClick={onRestart}>RESTART MATCH</button>
        <button className="btn" onClick={() => setShowControls(true)}>CONTROLS</button>
        <button className="btn" onClick={onQuit}>QUIT TO HOME</button>
      </div>
    </MenuCard>
  );
}

// ---------------- Results ----------------
export function ResultsScreen(props: {
  results: MatchResults; score: [number, number]; uploadStatus: string;
  onRematch: () => void; onSwap: () => void; onHome: () => void; onFeedback: () => void; onDownload: () => void;
}) {
  const r = props.results;
  const cls = r.winner === 'ATTACKER' ? 'attacker' : 'defender';
  const mins = Math.floor(r.durationSeconds / 60);
  const secs = Math.floor(r.durationSeconds % 60);
  const label = (p: (typeof r.players)[number]) => (p.controller === 'CPU' ? 'CPU' : `P${p.player + 1}`);
  return (
    <MenuCard onBack={props.onHome}>
      <p className={`winner ${cls}`}>{r.winner === 'ATTACKER' ? '▲ ATTACKERS WIN' : '■ DEFENDERS WIN'}</p>
      <p className="reason">{r.reason === 'CAPTURE' ? 'FLAG CAPTURED' : 'BUILDING HELD'}</p>
      <table className="stats">
        <tbody>
          <tr><th>Duration</th><td>{mins}:{String(secs).padStart(2, '0')}</td></tr>
          <tr><th>Peak capture</th><td>{Math.round(r.peakCapture * 100)}%</td></tr>
          <tr><th>Team KOs</th><td>Attackers {r.kos.ATTACKER} · Defenders {r.kos.DEFENDER}</td></tr>
          {r.players.map((p) => (
            <tr key={p.player}><th>{label(p)} ({p.team === 'ATTACKER' ? 'ATK' : 'DEF'})</th><td>{p.kos} KOs / {p.deaths} deaths</td></tr>
          ))}
        </tbody>
      </table>
      <p className="score">Session score · P1 {props.score[0]} – {props.score[1]} P2</p>
      <div className="row">
        <button className="btn primary" onClick={props.onRematch} data-autofocus>REMATCH</button>
        <button className="btn" onClick={props.onSwap}>SWAP SIDES</button>
        <button className="btn" onClick={props.onHome}>HOME</button>
      </div>
      <div className="row">
        <button className="link" onClick={props.onFeedback}>Give feedback</button>
        <button className="link" onClick={props.onDownload}>Download match log</button>
      </div>
      <p className="status-line">{props.uploadStatus}</p>
    </MenuCard>
  );
}

// ---------------- Feedback (plan §9.4) ----------------
type FbAnswers = Omit<FeedbackPayload, 'sessionId' | 'buildVersion'>;
const EMPTY_FB: FbAnswers = {
  preferredSide: null, funRating: null, objectiveAnswer: '', controlsRating: null, awkwardActions: '', usedCommands: '',
  botsRating: null, unfair: '', confusing: '', bugs: '', playOnline: null, other: '',
};

export function FeedbackScreen({ onSubmit, onBack }: { onSubmit: (a: FbAnswers) => Promise<{ ok: boolean; error?: string }>; onBack: () => void }) {
  const [a, setA] = useState<FbAnswers>(EMPTY_FB);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const set = <K extends keyof FbAnswers>(k: K, v: FbAnswers[K]) => setA((prev) => ({ ...prev, [k]: v }));
  const rating = (k: 'funRating' | 'controlsRating' | 'botsRating') => (
    <div className="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={`btn${a[k] === n ? ' active' : ''}`} onClick={() => set(k, n)} aria-pressed={a[k] === n}>{n}</button>
      ))}
    </div>
  );
  const text = (k: keyof FbAnswers, label: string) => (
    <div className="form-q">
      <label htmlFor={`fb-${k}`}>{label}</label>
      <textarea id={`fb-${k}`} maxLength={2000} value={a[k] as string} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );
  const submit = async () => {
    setStatus('sending');
    const res = await onSubmit(a);
    if (res.ok) setStatus('sent');
    else { setStatus('error'); setErr(res.error ?? 'Unknown error'); }
  };
  if (status === 'sent') {
    return (
      <MenuCard onBack={onBack} narrow>
        <h2>Thank you!</h2>
        <p>Your feedback was sent. It helps decide what to build next.</p>
        <div className="row"><button className="btn primary" onClick={onBack} data-autofocus>BACK</button></div>
      </MenuCard>
    );
  }
  return (
    <MenuCard onBack={onBack}>
      <h2>Playtest feedback</h2>
      <p className="muted small">Anonymous: please don&apos;t include names or contact details.</p>
      <div className="form-q">
        <label>1. Which side did you enjoy more?</label>
        <div className="choice">
          {(['ATTACKER', 'DEFENDER', 'SAME'] as const).map((s) => (
            <button key={s} type="button" className={`btn${a.preferredSide === s ? ' active' : ''}`} onClick={() => set('preferredSide', s)}>
              {s === 'SAME' ? 'Same' : s === 'ATTACKER' ? 'Attacker' : 'Defender'}
            </button>
          ))}
        </div>
      </div>
      <div className="form-q"><label>2. How fun was it overall? (1–5)</label>{rating('funRating')}</div>
      {text('objectiveAnswer', '3. In your own words, how does the attacker win?')}
      <div className="form-q"><label>4. Did the controls feel responsive? (1–5)</label>{rating('controlsRating')}</div>
      {text('awkwardActions', '4b. Which actions felt awkward?')}
      {text('usedCommands', '5. Did you use squad commands? Which ones?')}
      <div className="form-q"><label>5b. Did the bots do what you expected? (1–5)</label>{rating('botsRating')}</div>
      {text('unfair', '6. Did any part feel unfair?')}
      {text('confusing', '7. Was anything confusing?')}
      {text('bugs', '8. Did you notice bugs?')}
      <div className="form-q">
        <label>9. Would you play this online against a friend?</label>
        <div className="choice">
          {(['YES', 'MAYBE', 'NO'] as const).map((s) => (
            <button key={s} type="button" className={`btn${a.playOnline === s ? ' active' : ''}`} onClick={() => set('playOnline', s)}>
              {s[0] + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      {text('other', '10. Anything else?')}
      <div className="row spread">
        <button className="btn" onClick={onBack}>BACK</button>
        <button className="btn primary" onClick={submit} disabled={status === 'sending'}>{status === 'sending' ? 'SENDING…' : 'SEND FEEDBACK'}</button>
      </div>
      {status === 'error' && <p className="status-line" style={{ color: 'var(--danger)' }}>Could not send: {err}</p>}
    </MenuCard>
  );
}
