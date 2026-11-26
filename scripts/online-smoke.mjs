// Online smoke test against a running game server (needs ALLOW_GUESTS=true on the server):
//   node scripts/online-smoke.mjs ws://127.0.0.1:3001/ws
// Two guest clients create/join a room, ready up, play 5 s and report snapshot rate and size.
const url = process.argv[2] ?? 'ws://127.0.0.1:3001/ws';
const mk = (name) => new Promise((res, rej) => {
  const ws = new WebSocket(url);
  const c = { ws, msgs: [], name, send: (m) => ws.send(JSON.stringify(m)) };
  ws.onmessage = (e) => c.msgs.push(JSON.parse(String(e.data)));
  ws.onerror = () => rej(new Error(`cannot connect to ${url}`));
  ws.onopen = () => { c.send({ t: 'hello', v: 1, token: null }); res(c); };
});
const wait = (c, pred, ms = 8000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const m = c.msgs.find(pred);
    if (m) { clearInterval(iv); res(m); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error(`timeout (${c.name})`)); }
  }, 20);
});
try {
  const a = await mk('a');
  const b = await mk('b');
  const err = a.msgs.find((m) => m.t === 'error');
  if (err) throw new Error(err.message);
  await wait(a, (m) => m.t === 'welcome');
  await wait(b, (m) => m.t === 'welcome');
  a.send({ t: 'room.create' });
  const room = await wait(a, (m) => m.t === 'room');
  b.send({ t: 'room.join', code: room.room.code });
  await wait(a, (m) => m.t === 'room' && m.room.seats.every(Boolean));
  a.send({ t: 'room.update', ready: true });
  b.send({ t: 'room.update', ready: true });
  const st = await wait(b, (m) => m.t === 'start');
  let seq = 0;
  // B holds right and punches every 15 frames (bit 1 = right, bit 5 = punch).
  const iv = setInterval(() => b.send({ t: 'input', seq: seq++, bits: 2 | (seq % 15 === 0 ? 32 : 0) }), 16);
  await new Promise((r) => setTimeout(r, 5000));
  clearInterval(iv);
  const snaps = b.msgs.filter((m) => m.t === 'snap');
  const last = snaps.at(-1);
  const kinds = [...new Set(snaps.flatMap((s) => s.ev.map((e) => e.type)))];
  console.log(`PASS room ${room.room.code} · ${st.names.join(' vs ')} · ${snaps.length} snapshots in 5 s (${(snaps.length / 5).toFixed(1)}/s) · tick ${last.tick} · ~${JSON.stringify(last).length} bytes/snapshot · events: ${kinds.join(', ')}`);
  a.ws.close();
  b.ws.close();
  process.exit(0);
} catch (e) {
  console.log(`FAIL ${e.message}`);
  process.exit(1);
}
