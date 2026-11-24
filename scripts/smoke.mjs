// Smoke test against a running server: node scripts/smoke.mjs [baseUrl]
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const req = async (method, path, body, raw) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
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
