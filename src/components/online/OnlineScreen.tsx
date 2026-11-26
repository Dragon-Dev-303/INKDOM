'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sfx } from '@/game/audio/sfx';
import { resolveLoadout, type ResolvedCosmetics } from '@/game/config/shop';
import { OnlineGameController } from '@/game/OnlineGameController';
import { gameServerUrl, OnlineClient, type ConnectionState } from '@/game/net/OnlineClient';
import { isRoomCode, type RoomView, type ServerMsg } from '@/game/net/protocol';
import type { MatchResults } from '@/game/sim/match';
import type { Team, WeaponId } from '@/game/sim/types';
import { loadSettings } from '@/game/settings';
import { useAccount } from '@/lib/account/AccountContext';
import { getAccessToken } from '@/lib/account/api';
import css from './online.module.css';

type View = 'menu' | 'queue' | 'room' | 'match' | 'results';
const WEAPONS: { id: WeaponId; label: string }[] = [
  { id: 'FISTS', label: 'Fists' }, { id: 'SHORT_SWORD', label: 'Sword' }, { id: 'IRON_BAR', label: 'Iron bar' },
];

/** Online play (INKDOM_v2_Plan.md §4): quick match, private rooms with invite links, live match, results, rematch. */
export default function OnlineScreen() {
  const { account, loading } = useAccount();
  const [guest, setGuest] = useState(false);
  const [conn, setConn] = useState<ConnectionState>('idle');
  const [me, setMe] = useState<{ userId: string; name: string; guest: boolean } | null>(null);
  const [view, setView] = useState<View>('menu');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [start, setStart] = useState<Extract<ServerMsg, { t: 'start' }> | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [rtt, setRtt] = useState(0);
  const pendingJoin = useRef<string | null>(null);

  const client = useMemo(() => (typeof window === 'undefined' ? null : new OnlineClient(gameServerUrl(), getAccessToken)), []);
  const canConnect = account.signedIn || guest;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('room');
    if (q && isRoomCode(q.toUpperCase())) {
      pendingJoin.current = q.toUpperCase();
      setCode(q.toUpperCase()); // eslint-disable-line react-hooks/set-state-in-effect -- prefill from invite link
    }
  }, []);

  useEffect(() => {
    if (!client || !canConnect) return;
    const offState = client.onState(setConn);
    const off = client.on((m) => {
      switch (m.t) {
        case 'welcome':
          setMe({ userId: m.userId, name: m.name, guest: m.guest });
          setError(null);
          if (pendingJoin.current) { client.send({ t: 'room.join', code: pendingJoin.current }); pendingJoin.current = null; }
          break;
        case 'error': setError(m.message); if (m.code === 'room_not_found' || m.code === 'room_full') setView('menu'); break;
        case 'queue': setWaiting(m.waiting); setView('queue'); break;
        case 'room':
          setRoom(m.room);
          setView((v) => (m.room.phase === 'PLAYING' ? (v === 'match' ? v : v) : m.room.phase === 'ENDED' ? 'results' : 'room'));
          break;
        case 'room.closed': setRoom(null); setStart(null); setView('menu'); break;
        case 'start': setStart(m); setResults(null); setView('match'); break;
        case 'end': setResults(m.results); window.setTimeout(() => setView('results'), 2500); break;
        default: break;
      }
    });
    client.connect();
    const t = window.setInterval(() => setRtt(Math.round(client.rtt)), 1000);
    return () => { off(); offState(); window.clearInterval(t); client.close(); };
  }, [client, canConnect]);

  const send = client ? client.send.bind(client) : () => {};
  const mySeat = room && me ? room.seats.findIndex((s) => s?.userId === me.userId) : -1;
  const invite = room && typeof window !== 'undefined' ? `${window.location.origin}/online?room=${room.code}` : '';

  if (loading) return <div className={css.wrap}><div className={css.card}><p className="muted">Loading…</p></div></div>;

  if (!canConnect) {
    return (
      <div className={css.wrap}>
        <div className={css.card}>
          <h1 className={css.title}>Play online</h1>
          <p className={css.sub}>Fight another player over the internet: quick match or a private room with a friend. Matches run on the Inkdom game server.</p>
          <div className={css.actions} style={{ justifyContent: 'flex-start' }}>
            <Link className="btn primary" href="/account">Sign in</Link>
            <Link className="btn" href="/account?view=signup">Create an account</Link>
            <button className="btn" onClick={() => setGuest(true)} title="Works when the server allows guests (local testing)">Try as guest</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'match' && start && client) {
    return <MatchView client={client} start={start} rtt={rtt} conn={conn} myLook={account.signedIn ? resolveLoadout(account.loadout) : null}
      onLeave={() => { send({ t: 'room.leave' }); setView('menu'); setStart(null); }} />;
  }

  return (
    <div className={css.wrap}>
      <div className={css.status}>
        <span className={`${css.dot} ${conn === 'open' ? css.dotOk : conn === 'closed' ? css.dotBad : css.dotWarn}`} />
        {conn === 'open' ? `Connected as ${me?.name ?? '…'}${me?.guest ? ' (guest)' : ''} · ${rtt} ms` : conn === 'reconnecting' ? 'Reconnecting…' : conn === 'closed' ? 'Disconnected from the game server' : 'Connecting to the game server…'}
        {conn === 'closed' && <button className="btn small" onClick={() => client?.connect()}>Retry</button>}
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}

      {view === 'menu' && (
        <div className={css.card}>
          <h1 className={css.title}>Play online</h1>
          <p className={css.sub}>1 vs 1 boss battle, each boss leads 3 AI soldiers. Your keys: J punch · K kick · U heavy · I weapon · O special · L block · Space dodge (change in Settings → Controls).</p>
          <div className={css.grid}>
            <div className={css.option}>
              <h3>⚡ Quick match</h3>
              <p>Get paired with the next player looking for a game. Sides are random.</p>
              <button className="btn primary" disabled={conn !== 'open'} onClick={() => { setError(null); send({ t: 'queue.join' }); }}>Find a match</button>
            </div>
            <div className={css.option}>
              <h3>🔒 Private room</h3>
              <p>Create a room and send the invite link or code to a friend.</p>
              <button className="btn" disabled={conn !== 'open'} onClick={() => { setError(null); send({ t: 'room.create' }); }}>Create room</button>
            </div>
            <div className={css.option}>
              <h3>🔑 Join with code</h3>
              <p>Enter the 6-character code your friend shared.</p>
              <form className={css.codeRow} onSubmit={(e) => { e.preventDefault(); setError(null); if (isRoomCode(code)) send({ t: 'room.join', code }); else setError('Room codes are 6 characters (letters and numbers).'); }}>
                <input className="input" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} aria-label="Room code" placeholder="ABC234" />
                <button className="btn" type="submit" disabled={conn !== 'open'}>Join</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {view === 'queue' && (
        <div className={css.card}>
          <h1 className={css.title}>Finding an opponent…</h1>
          <p className={css.sub}>{waiting <= 1 ? 'You are first in the queue. Invite a friend to a private room for a guaranteed match.' : `${waiting} players waiting.`}</p>
          <button className="btn" onClick={() => { send({ t: 'queue.leave' }); setView('menu'); }}>Cancel</button>
        </div>
      )}

      {view === 'room' && room && (
        <div className={css.card}>
          <h1 className={css.title}>{room.quick ? 'Match found' : 'Private room'}</h1>
          {!room.quick && (
            <>
              <div className={css.code} aria-label="Room code">{room.code}</div>
              <div className={css.actions} style={{ justifyContent: 'flex-start', marginTop: 0 }}>
                <button className="btn small" onClick={() => void navigator.clipboard?.writeText(invite)}>Copy invite link</button>
                <button className="btn small" onClick={() => void navigator.clipboard?.writeText(room.code)}>Copy code</button>
              </div>
            </>
          )}
          <div className={css.seats}>
            {room.seats.map((s, i) => (
              <div key={i} className={`${css.seat} ${s ? (s.side === 'ATTACKER' ? css.attacker : css.defender) : ''}`}>
                {!s ? <div className={css.empty}>Waiting for a player…<br />Share the code {room.code}</div> : (
                  <>
                    <h4>
                      <span>{s.name}{i === mySeat ? ' (you)' : ''}</span>
                      <span className={`tag ${s.side === 'ATTACKER' ? 'attacker' : 'defender'}`}>{s.side === 'ATTACKER' ? '▲ ATTACKER' : '■ DEFENDER'}</span>
                    </h4>
                    {i === mySeat ? (
                      <>
                        <div className="segmented">
                          {(['ATTACKER', 'DEFENDER'] as Team[]).map((side) => (
                            <button key={side} className={`btn small${s.side === side ? ' active' : ''}`} onClick={() => send({ t: 'room.update', side })}>{side === 'ATTACKER' ? 'Attack' : 'Defend'}</button>
                          ))}
                        </div>
                        <div className="segmented">
                          {WEAPONS.map((w) => (
                            <button key={w.id} className={`btn small${s.weapon === w.id ? ' active' : ''}`} onClick={() => send({ t: 'room.update', weapon: w.id })}>{w.label}</button>
                          ))}
                        </div>
                        <button className={`btn${s.ready ? '' : ' primary'}`} onClick={() => send({ t: 'room.update', ready: !s.ready })}>{s.ready ? 'Not ready' : 'Ready'}</button>
                      </>
                    ) : (
                      <div className="muted small">{WEAPONS.find((w) => w.id === s.weapon)?.label} · {s.connected ? '' : 'disconnected · '}</div>
                    )}
                    <div className={s.ready ? css.ready : css.notReady}>{s.ready ? '✔ READY' : 'Not ready'}</div>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="muted small">The match starts when both players are ready. Attackers must hold the rooftop flag for 8 s; defenders win when the 5:00 timer runs out.</p>
          <button className="btn" onClick={() => { send({ t: 'room.leave' }); setRoom(null); setView('menu'); }}>Leave room</button>
        </div>
      )}

      {view === 'results' && results && room && (
        <ResultsCard results={results} room={room} mySeat={mySeat} start={start}
          onRematch={() => send({ t: 'rematch' })}
          onLeave={() => { send({ t: 'room.leave' }); setRoom(null); setView('menu'); }} />
      )}
    </div>
  );
}

function ResultsCard({ results, room, mySeat, start, onRematch, onLeave }: {
  results: MatchResults; room: RoomView; mySeat: number; start: Extract<ServerMsg, { t: 'start' }> | null; onRematch: () => void; onLeave: () => void;
}) {
  const mySide = mySeat >= 0 ? results.players.find((p) => p.player === mySeat)?.team : undefined;
  const won = mySide === results.winner;
  const me = room.seats[mySeat];
  const other = room.seats[1 - mySeat];
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <div className={`${css.card} ${css.results}`}>
      <div className={css.winner} style={{ color: results.winner === 'ATTACKER' ? 'var(--attacker)' : 'var(--defender)' }}>
        {mySide ? (won ? 'VICTORY' : 'DEFEAT') : `${results.winner} WINS`}
      </div>
      <p className="muted">{results.reason === 'CAPTURE' ? 'The flag was captured.' : 'The building was held until time ran out.'}</p>
      <div className={css.stats}>
        <div>Duration<br /><b>{fmt(results.durationSeconds)}</b></div>
        <div>Peak capture<br /><b>{Math.round(results.peakCapture * 100)}%</b></div>
        <div>▲ Attacker KOs<br /><b>{results.kos.ATTACKER}</b></div>
        <div>■ Defender KOs<br /><b>{results.kos.DEFENDER}</b></div>
      </div>
      <p className="muted small">{start ? `${start.names[0]} vs ${start.names[1]}` : ''} · Rematch swaps sides.</p>
      <div className={css.actions}>
        <button className="btn primary" disabled={!other?.connected || me?.wantsRematch} onClick={onRematch}>
          {me?.wantsRematch ? (other?.wantsRematch ? 'Starting…' : 'Waiting for opponent…') : other?.wantsRematch ? 'Accept rematch' : 'Rematch'}
        </button>
        <button className="btn" onClick={onLeave}>Leave</button>
      </div>
      {!other?.connected && <p className="muted small">Your opponent left.</p>}
    </div>
  );
}

function MatchView({ client, start, rtt, conn, myLook, onLeave }: {
  client: OnlineClient; start: Extract<ServerMsg, { t: 'start' }>; rtt: number; conn: ConnectionState;
  myLook: ResolvedCosmetics | null; onLeave: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [menu, setMenu] = useState(false);
  const [sfx] = useState(() => new Sfx());
  const toggleMenu = useCallback(() => setMenu((m) => !m), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const looks: (ResolvedCosmetics | null)[] = [null, null];
    looks[start.you] = myLook;
    const ctrl = new OnlineGameController(canvas, client, start, loadSettings(), sfx, looks, toggleMenu);
    const unlock = () => sfx.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    ctrl.start();
    return () => { ctrl.destroy(); window.removeEventListener('keydown', unlock); window.removeEventListener('pointerdown', unlock); };
    // One controller per match start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  return (
    <div className={css.overlay}>
      <canvas ref={canvasRef} aria-label="Online battle" />
      <div className={css.hud}>
        <span className={`${css.dot} ${conn === 'open' ? (rtt < 120 ? css.dotOk : css.dotWarn) : css.dotBad}`} />
        <span>{conn === 'open' ? `${rtt} ms` : 'Reconnecting…'}</span>
        <span>· You are {start.names[start.you]} ({start.config.p1Team === (start.you === 0 ? 'ATTACKER' : 'DEFENDER') ? '▲ attacker' : '■ defender'})</span>
        <button className="btn small" onClick={toggleMenu}>Menu</button>
      </div>
      {menu && (
        <div className={css.menuOverlay}>
          <div className={css.menuCard}>
            <h2 style={{ margin: 0 }}>Online match</h2>
            <p className="muted small">The match keeps running while this menu is open. Leaving hands your boss to the AI.</p>
            <button className="btn primary" onClick={toggleMenu} autoFocus>Back to the fight</button>
            <button className="btn" onClick={onLeave}>Leave match</button>
          </div>
        </div>
      )}
    </div>
  );
}
