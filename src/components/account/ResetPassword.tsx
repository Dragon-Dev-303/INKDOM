'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useAccount } from '@/lib/account/AccountContext';
import { updatePassword } from '@/lib/account/api';
import { passwordStrength } from '@/lib/usernames';
import css from './account.module.css';

/** Landing page of the password-reset email: the callback already signed the user in. */
export default function ResetPassword() {
  const { account, loading } = useAccount();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8 || passwordStrength(pw).score < 2) return setMsg({ kind: 'error', text: 'Choose a stronger password (8+ characters, mixed).' });
    if (pw !== pw2) return setMsg({ kind: 'error', text: 'Passwords do not match.' });
    const r = await updatePassword(pw);
    setMsg(r.ok ? { kind: 'success', text: 'Your password has been changed.' } : { kind: 'error', text: r.error });
  };
  return (
    <div className={css.wrap}>
      <div className={css.card}>
        <h1 className={css.title}>Choose a new password</h1>
        {loading ? <p className="muted">Loading…</p> : !account.signedIn ? (
          <div className="notice error">This reset link is invalid or has expired. <Link href="/account">Request a new one</Link>.</div>
        ) : (
          <form className={css.form} onSubmit={submit} noValidate>
            <input className="input" type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <input className="input" type="password" autoComplete="new-password" placeholder="Confirm new password" aria-label="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            <button className="btn primary" type="submit">Save password</button>
            {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
            {msg?.kind === 'success' && <Link className="btn" href="/">Go to the game</Link>}
          </form>
        )}
      </div>
    </div>
  );
}
