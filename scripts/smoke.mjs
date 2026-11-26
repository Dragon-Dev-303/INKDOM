// Smoke test against a running server: node scripts/smoke.mjs [baseUrl]
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const req = async (method, path, body, raw, headers = {}) => {
  const res = await fetch(base + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 160) };
};
const checks = [
  ['GET /', () => req('GET', '/'), (r) => r.status === 200 && r.text.includes('<!DOCTYPE html')],
  ['GET /api/health', () => req('GET', '/api/health'), (r) => r.status === 200 && r.text.includes('"ok":true')],
  ['match-log rejects bad payload', () => req('POST', '/api/match-log', { sessionId: 'x' }), (r) => r.status === 400],
  ['feedback rejects empty answers', () => req('POST', '/api/feedback', { sessionId: 'smoke-test-01', buildVersion: 't' }), (r) => r.status === 400],
  ['feedback rejects out-of-range rating', () => req('POST', '/api/feedback', { sessionId: 'smoke-test-01', buildVersion: 't', funRating: 9 }), (r) => r.status === 400],
  ['feedback rejects invalid JSON', () => req('POST', '/api/feedback', null, 'not json'), (r) => r.status === 400],
  ['account signed out', () => req('GET', '/api/account'), (r) => r.status === 200 && r.text.includes('"signedIn":false')],
  ['stripe checkout needs sign-in', () => req('POST', '/api/checkout/stripe', { packId: 'pack_200' }), (r) => r.status === 401],
  ['crypto checkout needs sign-in', () => req('POST', '/api/checkout/crypto', { packId: 'pack_200' }), (r) => r.status === 401],
  ['checkout rejects non-JSON', () => req('POST', '/api/checkout/stripe', null, 'packId=pack_200', { 'Content-Type': 'application/x-www-form-urlencoded' }), (r) => r.status === 415],
  ['shop buy needs sign-in', () => req('POST', '/api/shop/buy', { itemId: 'hat_tophat' }), (r) => r.status === 401],
  ['shop equip needs sign-in', () => req('POST', '/api/shop/equip', { slot: 'hat', itemId: null }), (r) => r.status === 401],
  ['stripe webhook rejects bad signature', () => req('POST', '/api/webhooks/stripe', { id: 'evt' }, null, { 'Stripe-Signature': 't=1,v1=bad' }), (r) => r.status === 400 || r.status === 503],
  ['crypto webhook rejects bad signature', () => req('POST', '/api/webhooks/nowpayments', { order_id: 'x' }, null, { 'x-nowpayments-sig': 'bad' }), (r) => r.status === 401 || r.status === 503],
  ['auth callback without code redirects home', () => req('GET', '/auth/callback'), (r) => r.status >= 300 && r.status < 400],
];
let failed = 0;
for (const [name, run, ok] of checks) {
  try {
    const r = await run();
    const pass = ok(r);
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  -> ${r.status} ${r.text.replace(/\s+/g, ' ').slice(0, 90)}`);
  } catch (e) { failed++; console.log(`FAIL  ${name}  -> ${e.message}`); }
}
process.exit(failed ? 1 : 0);
