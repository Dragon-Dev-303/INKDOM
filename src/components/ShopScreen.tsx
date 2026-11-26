'use client';

import { useState } from 'react';
import {
  COSMETIC_SLOTS, COSMETICS, POINT_PACKS, RARITY_COLORS, SLOT_LABELS, findItem, formatUsd, packBonusPct, packPoints,
  type CosmeticItem, type Loadout,
} from '@/game/config/shop';
import { buyItem, equipItem, signOut, startCheckout, type AccountState } from '@/lib/account/api';
import CosmeticPreview from './CosmeticPreview';
import { MenuCard } from './screens';

export interface CheckoutNotice { kind: 'info' | 'success' | 'error'; text: string }

type Tab = 'points' | 'cosmetics' | 'history';

const fmt = (n: number) => n.toLocaleString('en-US');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Points shop (INKDOM_Payments_Plan.md §8): buy packs (card/wallet or crypto), buy and equip cosmetics, history. */
export function ShopScreen(props: {
  account: AccountState;
  notice: CheckoutNotice | null;
  onAccountChange: (a: AccountState) => void;
  onRefresh: () => Promise<void>;
  onBack: () => void;
}) {
  const { account } = props;
  const [tab, setTab] = useState<Tab>('points');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<CheckoutNotice | null>(null);
  const shown = message ?? props.notice;

  if (!account.signedIn) {
    return (
      <MenuCard onBack={props.onBack} narrow>
        <h2>Shop</h2>
        <SignInPanel account={account} />
        <div className="row"><button className="btn" onClick={props.onBack}>BACK</button></div>
      </MenuCard>
    );
  }

  const balance = account.balance ?? 0;
  const owned = new Set(account.owned ?? []);
  const loadout: Loadout = account.loadout ?? {};

  const pay = async (provider: 'stripe' | 'crypto', packId: string) => {
    setBusy(`${provider}:${packId}`);
    setMessage({ kind: 'info', text: provider === 'stripe' ? 'Opening secure checkout…' : 'Creating crypto invoice…' });
    const r = await startCheckout(provider, packId);
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.error });
      setBusy(null);
    }
  };

  const buy = async (item: CosmeticItem) => {
    setBusy(item.id);
    const r = await buyItem(item.id);
    if (r.ok) {
      props.onAccountChange({ ...account, balance: r.balance, owned: [...owned, item.id] });
      setMessage({ kind: 'success', text: `${item.name} unlocked! Equip it below.` });
      void props.onRefresh();
    } else {
      setMessage({ kind: 'error', text: r.status === 402 ? `Not enough points: ${item.name} costs ${fmt(item.price)}. Get points in the first tab.` : r.error });
    }
    setBusy(null);
  };

  const equip = async (item: CosmeticItem | null, slot: CosmeticItem['slot']) => {
    setBusy(`equip:${slot}`);
    const r = await equipItem(slot, item?.id ?? null);
    if (r.ok) {
      props.onAccountChange({ ...account, loadout: r.loadout });
      setMessage(null);
    } else setMessage({ kind: 'error', text: r.error });
    setBusy(null);
  };

  return (
    <MenuCard onBack={props.onBack}>
      <div className="shop-head">
        <h2>Shop</h2>
        <div className="wallet">
          <span className="points-badge">◆ {fmt(balance)}</span>
          <span className="muted small">{account.email}</span>
          <button className="link small" onClick={async () => { await signOut(); await props.onRefresh(); }}>Sign out</button>
        </div>
      </div>

      <div className="segmented tabs" role="tablist">
        {(['points', 'cosmetics', 'history'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn${tab === t ? ' active' : ''}`} onClick={() => { setTab(t); setMessage(null); }} data-autofocus={t === 'points' ? true : undefined}>
            {t === 'points' ? 'Get points' : t === 'cosmetics' ? 'Cosmetics' : 'History'}
          </button>
        ))}
      </div>

      {shown && <div className={`notice ${shown.kind}`} role="status">{shown.text}</div>}
      {balance < 0 && <div className="notice error">Your balance is negative after a refund or chargeback. Spending is paused until it is positive again.</div>}

      {tab === 'points' && (
        <>
          <div className="pack-grid">
            {POINT_PACKS.map((p) => (
              <div className="pack" key={p.id}>
                {p.bonusPoints > 0 && <span className="bonus">+{packBonusPct(p)}% bonus</span>}
                <div className="pack-points">◆ {fmt(packPoints(p))}</div>
                <div className="pack-price">{formatUsd(p.priceCents)}</div>
                <button className="btn primary" disabled={!account.providers.stripe || busy !== null} onClick={() => pay('stripe', p.id)}>
                  {busy === `stripe:${p.id}` ? 'Opening…' : 'Card / Wallet'}
                </button>
                <button className="btn" disabled={!account.providers.crypto || busy !== null} onClick={() => pay('crypto', p.id)}>
                  {busy === `crypto:${p.id}` ? 'Opening…' : 'Crypto'}
                </button>
              </div>
            ))}
          </div>
          <p className="muted small center">
            Card / Wallet: Visa, Mastercard, Amex, Apple Pay, Google Pay, Link and local methods (secure Stripe checkout).
            Crypto: BTC, ETH, USDT, USDC, SOL, LTC and 300+ more (NOWPayments).
            {!account.providers.stripe && ' Card payments are not configured on this server yet.'}
            {!account.providers.crypto && ' Crypto payments are not configured on this server yet.'}
          </p>
          <p className="muted small center">
            Points are for cosmetic items only and give no gameplay advantage. Points have no cash value and are non-refundable except where required by law.
            Crypto payments are credited after network confirmation (usually 5–60 minutes).
          </p>
        </>
      )}

      {tab === 'cosmetics' && (
        <div className="cosmetics">
          <div className="loadout-preview">
            <CosmeticPreview loadout={loadout} size={110} />
            <div className="muted small">Your boss in battle</div>
          </div>
          <div className="slots">
            {COSMETIC_SLOTS.map((slot) => (
              <section key={slot}>
                <h3>{SLOT_LABELS[slot]}</h3>
                <div className="item-grid">
                  <div className={`item${!loadout[slot] ? ' equipped' : ''}`}>
                    <div className="item-name">Default</div>
                    <button className="btn small" disabled={!loadout[slot] || busy !== null} onClick={() => equip(null, slot)}>
                      {!loadout[slot] ? 'Equipped' : 'Use default'}
                    </button>
                  </div>
                  {COSMETICS.filter((c) => c.slot === slot).map((item) => {
                    const has = owned.has(item.id);
                    const on = loadout[slot] === item.id;
                    return (
                      <div key={item.id} className={`item${on ? ' equipped' : ''}`} style={{ borderColor: RARITY_COLORS[item.rarity] }}>
                        <CosmeticPreview loadout={{ [slot]: item.id }} size={64} />
                        <div className="item-name">{item.name}</div>
                        <div className="rarity" style={{ color: RARITY_COLORS[item.rarity] }}>{item.rarity}</div>
                        <div className="muted tiny">{item.description}</div>
                        {has ? (
                          <button className="btn small" disabled={on || busy !== null} onClick={() => equip(item, slot)}>{on ? 'Equipped' : 'Equip'}</button>
                        ) : (
                          <button className="btn small primary" disabled={busy !== null || balance < item.price} onClick={() => buy(item)} title={balance < item.price ? 'Not enough points' : undefined}>
                            {busy === item.id ? '…' : `◆ ${fmt(item.price)}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {tab === 'history' && <History account={account} />}

      <div className="row spread">
        <button className="btn" onClick={props.onBack}>BACK</button>
        <button className="btn" onClick={() => void props.onRefresh()}>Refresh</button>
      </div>
    </MenuCard>
  );
}

function History({ account }: { account: AccountState }) {
  const payments = account.payments ?? [];
  const ledger = account.ledger ?? [];
  const statusLabel = (s: string, ps: string | null) =>
    s === 'pending' && ps?.startsWith('np:') ? `pending (${ps.slice(3).replace('_', ' ')})` : s;
  return (
    <div className="history">
      <h3>Payments</h3>
      {payments.length === 0 ? <p className="muted small">No payments yet.</p> : (
        <table className="keys">
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{when(p.created_at)}</td>
                <td>{p.provider === 'stripe' ? 'Card / Wallet' : 'Crypto'}</td>
                <td>◆ {fmt(p.points)}</td>
                <td>{formatUsd(p.amount_cents)}</td>
                <td className={`status ${p.status}`}>{statusLabel(p.status, p.provider_status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Points activity</h3>
      {ledger.length === 0 ? <p className="muted small">No activity yet.</p> : (
        <table className="keys">
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td>{when(l.created_at)}</td>
                <td>{l.reason === 'spend' ? `Bought ${findItem(l.item_id)?.name ?? l.item_id}` : l.reason === 'purchase' ? 'Points purchase' : l.reason === 'refund' ? 'Refund' : 'Adjustment'}</td>
                <td className={l.delta > 0 ? 'plus' : 'minus'}>{l.delta > 0 ? '+' : ''}{fmt(l.delta)}</td>
                <td className="muted">balance {fmt(l.balance_after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Signed-out state: send the player to the account page (sign in or create an account). */
export function SignInPanel({ account }: { account: AccountState }) {
  if (!account.authEnabled) {
    return <div className="notice">Accounts are not configured on this server yet, so the shop is unavailable. The game itself is free to play.</div>;
  }
  return (
    <div className="signin">
      <p className="muted">Sign in to buy points and cosmetics. Playing stays free, no account needed.</p>
      <a className="btn primary" href="/account" data-autofocus>Sign in</a>
      <a className="btn" href="/account?view=signup">Create an account</a>
    </div>
  );
}
