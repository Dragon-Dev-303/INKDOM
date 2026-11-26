'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useAccount } from '@/lib/account/AccountContext';
import {
  checkUsername, sendPasswordReset, signInWithEmail, signInWithGoogle, signInWithPassword, signUp, updatePassword,
} from '@/lib/account/api';
import { normalizeUsername, passwordStrength, usernameProblem } from '@/lib/usernames';
import css from './account.module.css';

type View = 'signin' | 'signup' | 'forgot' | 'magic';
type Msg = { kind: 'info' | 'success' | 'error'; text: string } | null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <div className={`notice ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</div>;
}

function StrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password);
  return (
    <>
      <div className={css.meter} aria-hidden>
        {[0, 1, 2, 3].map((i) => <span key={i} className={password && i < Math.max(1, s.score) ? css[`on${s.score}`] : ''} />)}
      </div>
      <div className={`${css.hint} ${s.score >= 3 ? css.ok : css.bad}`}>{password ? `Password strength: ${s.label}` : 'At least 8 characters; mix cases, numbers and symbols for a strong password.'}</div>
    </>
  );
}

/** Sign in · Create account · Forgot password · signed-in account summary (INKDOM_v2_Plan.md §5). */
export default function AccountScreen() {
  const { account, loading, refresh, signOut } = useAccount();
  const [view, setView] = useState<View>('signin');
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const auth = q.get('auth');
    /* eslint-disable react-hooks/set-state-in-effect -- reads the URL once after mount */
    if (auth === 'signed-in') setMsg({ kind: 'success', text: 'You are signed in. Welcome to Inkdom!' });
    else if (auth === 'error') setMsg({ kind: 'error', text: 'That link is invalid or has expired. Please try again.' });
    if (q.get('view') === 'signup') setView('signup');
    /* eslint-enable react-hooks/set-state-in-effect */
    if (auth) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  if (loading) return <div className={css.wrap}><div className={css.card}><p className="muted">Loading account…</p></div></div>;

  if (!account.authEnabled) {
    return (
      <div className={css.wrap}><div className={css.card}>
        <h1 className={css.title}>Account</h1>
        <div className="notice">Accounts are not configured on this server yet. Local play is free and needs no account.</div>
        <Link className="btn primary" href="/play">Play local</Link>
      </div></div>
    );
  }

  if (account.signedIn) return <SignedIn msg={msg} onSignOut={async () => { await signOut(); setMsg({ kind: 'info', text: 'Signed out.' }); }} />;

  const go = (v: View) => { setView(v); setMsg(null); };
  return (
    <div className={css.wrap}>
      <div className={css.card}>
        <h1 className={css.title}>{view === 'signup' ? 'Create your account' : view === 'forgot' ? 'Reset password' : view === 'magic' ? 'Email sign-in link' : 'Sign in'}</h1>
        <p className={css.sub}>An account lets you play online, keep your points and cosmetics, and appear on leaderboards. Local play stays free.</p>
        {(view === 'signin' || view === 'signup') && (
          <div className={`segmented ${css.tabs}`} role="tablist">
            <button role="tab" aria-selected={view === 'signin'} className={`btn${view === 'signin' ? ' active' : ''}`} onClick={() => go('signin')}>Sign in</button>
            <button role="tab" aria-selected={view === 'signup'} className={`btn${view === 'signup' ? ' active' : ''}`} onClick={() => go('signup')}>Create account</button>
          </div>
        )}
        <Notice msg={msg} />
        {view === 'signin' && <SignInForm setMsg={setMsg} onDone={refresh} go={go} />}
        {view === 'signup' && <SignUpForm setMsg={setMsg} onDone={refresh} go={go} />}
        {view === 'forgot' && <ForgotForm setMsg={setMsg} go={go} />}
        {view === 'magic' && <MagicForm setMsg={setMsg} go={go} />}
      </div>
    </div>
  );
}

function GoogleButton({ setMsg }: { setMsg: (m: Msg) => void }) {
  return (
    <>
      <button type="button" className={`btn ${css.google}`} onClick={async () => { const r = await signInWithGoogle(); if (!r.ok) setMsg({ kind: 'error', text: r.error ?? 'Google sign-in failed' }); }}>
        Continue with Google
      </button>
      <div className={css.or}><span>or with email</span></div>
    </>
  );
}

function SignInForm({ setMsg, onDone, go }: { setMsg: (m: Msg) => void; onDone: () => Promise<void>; go: (v: View) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setMsg({ kind: 'error', text: 'Please enter a valid email address.' });
    if (!password) return setMsg({ kind: 'error', text: 'Please enter your password.' });
    setBusy(true);
    const r = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (!r.ok) return setMsg({ kind: 'error', text: r.error });
    setMsg({ kind: 'success', text: 'Signed in.' });
    await onDone();
  };
  return (
    <form className={css.form} onSubmit={submit} noValidate>
      <GoogleButton setMsg={setMsg} />
      <div className={css.row}><label htmlFor="si-email">Email</label><input id="si-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className={css.row}><label htmlFor="si-pw">Password</label><input id="si-pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <div className={css.links}>
        <button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button>
        <button type="button" className="link" onClick={() => go('magic')}>Email me a sign-in link</button>
      </div>
    </form>
  );
}

function SignUpForm({ setMsg, onDone, go }: { setMsg: (m: Msg) => void; onDone: () => Promise<void>; go: (v: View) => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameState, setNameState] = useState<{ checking: boolean; available: boolean | null; problem: string | null }>({ checking: false, available: null, problem: null });

  // Debounced live availability check.
  useEffect(() => {
    const u = normalizeUsername(username);
    const local = usernameProblem(u);
    /* eslint-disable react-hooks/set-state-in-effect -- derived validation state for the field */
    if (!u) { setNameState({ checking: false, available: null, problem: null }); return; }
    if (local) { setNameState({ checking: false, available: false, problem: local }); return; }
    setNameState({ checking: true, available: null, problem: null });
    /* eslint-enable react-hooks/set-state-in-effect */
    const id = window.setTimeout(async () => {
      const r = await checkUsername(u);
      setNameState({ checking: false, available: r.available, problem: r.problem });
    }, 350);
    return () => window.clearTimeout(id);
  }, [username]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = normalizeUsername(username);
    const problem = usernameProblem(u) ?? (nameState.available === false ? nameState.problem ?? 'Username unavailable' : null);
    if (problem) return setMsg({ kind: 'error', text: `Username: ${problem}.` });
    if (!EMAIL_RE.test(email)) return setMsg({ kind: 'error', text: 'Please enter a valid email address.' });
    if (password.length < 8) return setMsg({ kind: 'error', text: 'Password must be at least 8 characters.' });
    if (passwordStrength(password).score < 2) return setMsg({ kind: 'error', text: 'Please choose a stronger password (mix letters, numbers or symbols).' });
    if (password !== confirm) return setMsg({ kind: 'error', text: 'Passwords do not match.' });
    if (!age) return setMsg({ kind: 'error', text: 'You must be 13 or older to create an account.' });
    if (!terms) return setMsg({ kind: 'error', text: 'Please accept the Terms of Service and Privacy Policy.' });
    setBusy(true);
    const r = await signUp({ email: email.trim(), password, username: u });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: 'error', text: r.error });
    if (r.needsConfirmation) {
      setMsg({ kind: 'success', text: `Almost done! We sent a confirmation link to ${email.trim()}. Click it to activate your account, then sign in.` });
      go('signin');
      return;
    }
    setMsg({ kind: 'success', text: `Welcome, ${u}! Your account is ready.` });
    await onDone();
  };

  const nameHint = nameState.checking ? 'Checking…' : nameState.problem ?? (nameState.available ? 'Available ✓' : '3–20 characters: letters, numbers, _');
  return (
    <form className={css.form} onSubmit={submit} noValidate>
      <GoogleButton setMsg={setMsg} />
      <div className={css.row}>
        <label htmlFor="su-name">Username (shown to other players)</label>
        <input id="su-name" className="input" autoComplete="username" maxLength={20} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} aria-describedby="su-name-hint" />
        <div id="su-name-hint" className={`${css.hint} ${nameState.available ? css.ok : nameState.problem ? css.bad : ''}`}>{nameHint}</div>
      </div>
      <div className={css.row}><label htmlFor="su-email">Email</label><input id="su-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className={css.row}>
        <label htmlFor="su-pw">Password</label>
        <input id="su-pw" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <StrengthMeter password={password} />
      </div>
      <div className={css.row}>
        <label htmlFor="su-pw2">Confirm password</label>
        <input id="su-pw2" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <div className={`${css.hint} ${confirm && confirm !== password ? css.bad : css.ok}`}>{confirm ? (confirm === password ? 'Passwords match ✓' : 'Passwords do not match') : ''}</div>
      </div>
      <label className={css.check}><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> I am 13 years or older.</label>
      <label className={css.check}><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I accept the <Link href="/help#terms">Terms of Service</Link> and <Link href="/help#privacy">Privacy Policy</Link>.</label>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
  );
}

function ForgotForm({ setMsg, go }: { setMsg: (m: Msg) => void; go: (v: View) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setMsg({ kind: 'error', text: 'Please enter a valid email address.' });
    setBusy(true);
    const r = await sendPasswordReset(email.trim());
    setBusy(false);
    // Same message either way so the form never reveals whether an email is registered.
    setMsg(r.ok || !r.error.includes('wait') ? { kind: 'success', text: `If an account exists for ${email.trim()}, a reset link is on its way.` } : { kind: 'error', text: r.error });
  };
  return (
    <form className={css.form} onSubmit={submit} noValidate>
      <div className={css.row}><label htmlFor="fp-email">Email</label><input id="fp-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      <div className={css.links}><button type="button" className="link" onClick={() => go('signin')}>← Back to sign in</button></div>
    </form>
  );
}

function MagicForm({ setMsg, go }: { setMsg: (m: Msg) => void; go: (v: View) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setMsg({ kind: 'error', text: 'Please enter a valid email address.' });
    setBusy(true);
    const r = await signInWithEmail(email.trim());
    setBusy(false);
    setMsg(r.ok ? { kind: 'success', text: `Check ${email.trim()} for a sign-in link.` } : { kind: 'error', text: r.error ?? 'Could not send the link' });
  };
  return (
    <form className={css.form} onSubmit={submit} noValidate>
      <div className={css.row}><label htmlFor="ml-email">Email</label><input id="ml-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
      <div className={css.links}><button type="button" className="link" onClick={() => go('signin')}>← Back to sign in</button></div>
    </form>
  );
}

function SignedIn({ msg, onSignOut }: { msg: Msg; onSignOut: () => Promise<void> }) {
  const { account } = useAccount();
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8 || passwordStrength(pw).score < 2) return setPwMsg({ kind: 'error', text: 'Choose a stronger password (8+ characters, mixed).' });
    const r = await updatePassword(pw);
    setPwMsg(r.ok ? { kind: 'success', text: 'Password updated.' } : { kind: 'error', text: r.error });
    if (r.ok) setPw('');
  };
  return (
    <div className={css.wrap}>
      <div className={css.card}>
        <h1 className={css.title}>{account.username ?? 'Your account'}</h1>
        <p className={css.sub}>Signed in as {account.email}</p>
        <Notice msg={msg} />
        <dl className={css.profile}>
          <dt>Username</dt><dd>{account.username ?? '—'}</dd>
          <dt>Email</dt><dd>{account.email}</dd>
          <dt>Points</dt><dd>◆ {(account.balance ?? 0).toLocaleString('en-US')}</dd>
          <dt>Cosmetics owned</dt><dd>{account.owned?.length ?? 0}</dd>
        </dl>
        <div className={css.actions}>
          <Link className="btn primary" href="/online">Play online</Link>
          <Link className="btn" href="/shop">Shop</Link>
          <Link className="btn" href="/profile">Profile</Link>
          <Link className="btn" href="/settings">Settings</Link>
        </div>
        <h3>Change password</h3>
        <form className={css.form} onSubmit={change} noValidate>
          <input className="input" type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
          {pw && <StrengthMeter password={pw} />}
          <button className="btn" type="submit">Update password</button>
          <Notice msg={pwMsg} />
        </form>
        <div className={css.links} style={{ marginTop: 18 }}>
          <button className="link" onClick={() => void onSignOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
