'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ACTION_LABELS, ACTIONS, keyName, SCHEME_LABELS, type Action, type SchemeId } from '@/game/config/controls';
import { resetBindings, setBinding } from '@/game/controlsStore';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/game/settings';
import { useAccount } from '@/lib/account/AccountContext';
import { useBindings, useMounted } from './hooks';
import { Tabs } from './Tabs';
import { Chip, HubPage, Loading, Panel } from './ui';

type Tab = 'game' | 'controls' | 'audio' | 'accessibility' | 'account' | 'privacy';

export default function SettingsScreen() {
  const mounted = useMounted();
  return (
    <HubPage featureId="settings" lead="Saved on this device. Controls and game options are live; a few extra options are previews.">
      {/* Settings live in localStorage: render the form only in the browser to avoid hydration mismatches. */}
      {mounted ? <SettingsForm /> : <Loading />}
    </HubPage>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; soon?: boolean }) {
  const id = `set-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="hub-setting">
      <label className="hub-setting-text" htmlFor={id}>
        <strong>{props.label} {props.soon && <Chip tone="warn">Coming soon</Chip>}</strong>
        {props.hint && <span>{props.hint}</span>}
      </label>
      <input id={id} type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
    </div>
  );
}

function Slider(props: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const id = `set-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="hub-setting">
      <label className="hub-setting-text" htmlFor={id}><strong>{props.label}</strong><span>{Math.round(props.value * 100)}%</span></label>
      <input id={id} type="range" min={0} max={1} step={0.05} value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}

function SettingsForm() {
  const { account } = useAccount();
  const [tab, setTab] = useState<Tab>('game');
  const [s, setS] = useState<Settings>(() => loadSettings());
  const [saved, setSaved] = useState(false);
  // Preview-only options (not persisted yet).
  const [preview, setPreview] = useState({ reducedFlashes: false, subtitles: true, latency: true, uiScale: 1 });

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...s, [k]: v };
    setS(next);
    saveSettings(next);
    setSaved(true);
  };

  return (
    <>
      <div className="hub-row spread" style={{ marginBottom: 6 }}>
        <span className="muted small" role="status" aria-live="polite">{saved ? '✓ Saved on this device' : ''}</span>
        <button
          className="btn small"
          onClick={() => {
            setS({ ...DEFAULT_SETTINGS });
            saveSettings({ ...DEFAULT_SETTINGS });
            setSaved(true);
          }}
        >
          Restore defaults
        </button>
      </div>
      <Tabs<Tab>
        label="Settings sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'game', label: 'Game' },
          { id: 'controls', label: 'Controls' },
          { id: 'audio', label: 'Audio' },
          { id: 'accessibility', label: 'Accessibility' },
          { id: 'account', label: 'Account' },
          { id: 'privacy', label: 'Privacy' },
        ]}
      >
        {tab === 'game' && (
          <Panel>
            <Toggle label="Show hints" hint="Control hints during matches" checked={s.showHints} onChange={(v) => update('showHints', v)} />
            <Toggle label="Screen shake" hint="Camera shake on heavy hits" checked={s.screenShake} onChange={(v) => update('screenShake', v)} />
            <Toggle label="Show FPS" hint="Frame-rate counter in the corner" checked={s.showFps} onChange={(v) => update('showFps', v)} />
            <Toggle label="Latency indicator" hint="Ping display in online matches" checked={preview.latency} onChange={(v) => setPreview((p) => ({ ...p, latency: v }))} soon />
          </Panel>
        )}
        {tab === 'controls' && <ControlsPanel />}
        {tab === 'audio' && (
          <Panel>
            <Toggle label="Mute all" hint="Also toggled with M in a match" checked={s.muted} onChange={(v) => update('muted', v)} />
            <Slider label="Master volume" value={s.masterVolume} disabled={s.muted} onChange={(v) => update('masterVolume', v)} />
            <Slider label="Effects volume" value={s.sfxVolume} disabled={s.muted} onChange={(v) => update('sfxVolume', v)} />
          </Panel>
        )}
        {tab === 'accessibility' && (
          <Panel>
            <div className="hub-setting">
              <div className="hub-setting-text"><strong>Team colours</strong><span>High contrast adds stronger outlines and patterns</span></div>
              <div className="segmented" role="group" aria-label="Colour scheme">
                {(['standard', 'highContrast'] as const).map((c) => (
                  <button key={c} className={`btn small${s.colorScheme === c ? ' active' : ''}`} aria-pressed={s.colorScheme === c} onClick={() => update('colorScheme', c)}>
                    {c === 'standard' ? 'Standard' : 'High contrast'}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Screen shake" checked={s.screenShake} onChange={(v) => update('screenShake', v)} />
            <Toggle label="Reduced flashes" hint="Softer hit flashes and explosions" checked={preview.reducedFlashes} onChange={(v) => setPreview((p) => ({ ...p, reducedFlashes: v }))} soon />
            <Toggle label="Subtitles" hint="Captions for voice lines and alerts" checked={preview.subtitles} onChange={(v) => setPreview((p) => ({ ...p, subtitles: v }))} soon />
            <div className="hub-setting">
              <label className="hub-setting-text" htmlFor="set-ui-scale">
                <strong>UI scale <Chip tone="warn">Coming soon</Chip></strong>
                <span>{Math.round(preview.uiScale * 100)}%</span>
              </label>
              <input id="set-ui-scale" type="range" min={0.8} max={1.5} step={0.05} value={preview.uiScale} onChange={(e) => setPreview((p) => ({ ...p, uiScale: Number(e.target.value) }))} />
            </div>
          </Panel>
        )}
        {tab === 'account' && (
          <Panel>
            {account.signedIn ? (
              <>
                <p>Signed in as <strong>{(account as { username?: string }).username ?? account.email}</strong>.</p>
                <p className="muted">Balance: ◆ {(account.balance ?? 0).toLocaleString('en-US')}</p>
                <div className="hub-row"><Link href="/account" className="btn small">Manage account</Link><Link href="/shop" className="btn small">Shop & history</Link></div>
              </>
            ) : (
              <>
                <p>{account.authEnabled ? 'You are playing as a guest.' : 'Accounts are not enabled on this server yet.'}</p>
                <Link href="/account" className="btn primary small">Sign in or create account</Link>
              </>
            )}
          </Panel>
        )}
        {tab === 'privacy' && (
          <Panel>
            <Toggle label="Share anonymous match stats" hint="Helps balance the game. No personal data; random per-session id only." checked={s.shareStats} onChange={(v) => update('shareStats', v)} />
            <p className="muted small hub-mt">Settings and key bindings are stored only in this browser. Clearing site data resets them.</p>
          </Panel>
        )}
      </Tabs>
    </>
  );
}

/** Live key remapping (Settings → Controls), backed by src/game/controlsStore. */
function ControlsPanel() {
  const [scheme, setScheme] = useState<SchemeId>('solo');
  const bindings = useBindings(scheme);
  const [capturing, setCapturing] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setCapturing(null);
        setMessage(null);
        return;
      }
      const r = setBinding(scheme, capturing, e.code);
      if (r.ok) {
        setMessage({ tone: 'success', text: `${ACTION_LABELS[capturing].name} → ${keyName(e.code)}` });
        setCapturing(null);
      } else {
        setMessage({ tone: 'error', text: r.error });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, scheme]);

  return (
    <Panel
      title="Key bindings"
      icon="⌨"
      actions={
        <button
          className="btn small"
          onClick={() => {
            resetBindings(scheme);
            setMessage({ tone: 'success', text: 'Scheme reset to defaults' });
          }}
        >
          Reset scheme
        </button>
      }
    >
      <div className="hub-field">
        <label htmlFor="scheme">Control scheme</label>
        <select id="scheme" className="hub-select" value={scheme} onChange={(e) => { setScheme(e.target.value as SchemeId); setCapturing(null); setMessage(null); }}>
          {(Object.keys(SCHEME_LABELS) as SchemeId[]).map((id) => <option key={id} value={id}>{SCHEME_LABELS[id]}</option>)}
        </select>
      </div>
      <div aria-live="polite" role="status">
        {capturing && <div className="notice info">Press a key for <strong>{ACTION_LABELS[capturing].name}</strong>… (Esc cancels)</div>}
        {message && <div className={`notice ${message.tone}`}>{message.text}</div>}
      </div>
      <div>
        {ACTIONS.map((a) => (
          <div key={a} className={`hub-bind-row${capturing === a ? ' capturing' : ''}`}>
            <div style={{ minWidth: 0 }}>
              <strong>{ACTION_LABELS[a].name}</strong>
              {ACTION_LABELS[a].hint && <div className="muted small">{ACTION_LABELS[a].hint}</div>}
            </div>
            <div className="hub-keys">{bindings[a].map((c) => <kbd key={c}>{keyName(c)}</kbd>)}</div>
            <button
              className="btn small"
              aria-pressed={capturing === a}
              onClick={() => { setMessage(null); setCapturing(capturing === a ? null : a); }}
            >
              {capturing === a ? 'Cancel' : 'Change'}
            </button>
          </div>
        ))}
      </div>
      <p className="muted small hub-mt">A key already used by another action is swapped onto it. Pause, mute, debug and browser keys are reserved.</p>
    </Panel>
  );
}
