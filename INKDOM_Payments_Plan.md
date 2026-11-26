# INKDOM: Points, Payments and Cosmetics Shop (spec v1.0)

Status: implemented in this repository (see §12 for what still needs owner action).
Date: 2026-11-24 · Build: 0.10.0-beta

## 1. Goal and decisions

Players buy **Inkdom Points** with real money, by card or wallet through Stripe or with crypto through NOWPayments. They spend points on **cosmetic items** for their boss. Playing stays free and needs no login. A login is only needed to buy, own or equip items.

| ID | Decision | Choice | Reason |
|---|---|---|---|
| P1 | Accounts | Supabase Auth, email magic link + Google OAuth | Uses the existing Supabase project; no passwords to store |
| P2 | Fiat payments | Stripe Checkout (hosted), dynamic payment methods | One integration covers cards, Apple Pay, Google Pay, Link, PayPal/Klarna/iDEAL/etc. where eligible. Methods are switched on in the Stripe Dashboard, not in code. PCI scope stays minimal (SAQ A) |
| P3 | Crypto payments | NOWPayments hosted invoice + IPN webhook | Worldwide, 300+ coins (BTC, ETH, USDT, USDC, SOL, LTC…); the player picks the coin on the invoice page |
| P4 | What points buy | Cosmetics only: hat, weapon skin, attack trail | No gameplay advantage, so the local 1v1 stays fair (brief: combat must feel fair) |
| P5 | Packs | 4 USD packs with a bonus (§3) | Owner choice |
| P6 | Source of truth | Server only | Prices, points and item costs come from server code. The client only sends a `packId`/`itemId`. Balances change only inside SQL functions run with the service-role key |
| P7 | Crediting | Webhooks only (never the success redirect) | The redirect can be faked or never reached; webhooks are signed |
| P8 | Idempotency | Row lock + status machine + unique ledger index | Webhooks retry and arrive out of order; points must be credited exactly once |
| P9 | Simulation | Cosmetics are render-only | `sim/` stays deterministic; no tuning numbers change |

Out of scope (v1): subscriptions, gifting points, trading items, promo codes, a refund UI (refunds are made in the Stripe/NOWPayments dashboards and reach the game by webhook), and server-side matches (cosmetics are applied locally).

## 2. Architecture

```
Browser (Next.js client: GameApp, Shop, Account screens)
  │  supabase-js browser client: sign-in only (magic link / Google)
  │  fetch /api/*  (session cookie)
  ▼
Node.js backend: Next.js Route Handlers (src/app/api/**)
  ├─ /api/account            GET   balance, loadout, owned items, history
  ├─ /api/checkout/stripe    POST  create a pending payment → Stripe Checkout URL
  ├─ /api/checkout/crypto    POST  create a pending payment → NOWPayments invoice URL
  ├─ /api/shop/buy           POST  spend points on an item (SQL fn purchase_item)
  ├─ /api/shop/equip         POST  set loadout (must own the item)
  ├─ /api/webhooks/stripe    POST  signed events → credit / fail / refund
  ├─ /api/webhooks/nowpayments POST signed IPN → credit / fail / refund
  └─ /auth/callback          GET   exchange the OAuth / magic-link code for a session cookie
src/proxy.ts                       refreshes the Supabase session cookie on page requests
  │  service-role (secret) key, server only
  ▼
Supabase Postgres: profiles, payments, point_ledger, owned_items + SECURITY DEFINER functions
```

Module layout:

| File | Responsibility |
|---|---|
| `src/game/config/shop.ts` | Packs, cosmetic catalog, loadout types, `sanitizeLoadout`, helpers. Pure data, shared by client and server |
| `src/lib/supabase/browser.ts` | Browser Supabase client (publishable key) for sign-in/out |
| `src/lib/server/auth.ts` | `getSessionUser()` reads the user from the cookie (server client) |
| `src/lib/server/supabaseAdmin.ts` | Service-role client (`SUPABASE_SECRET_KEY`) |
| `src/lib/server/payments/core.ts` | Provider-independent handlers: `handleStripeEvent`, `handleNowPaymentsIpn`, `PaymentStore` interface |
| `src/lib/server/payments/store.ts` | `PaymentStore` backed by Supabase (calls the SQL functions) |
| `src/lib/server/payments/stripe.ts` | Stripe client, Checkout Session creation, signature verification |
| `src/lib/server/payments/nowpayments.ts` | Invoice creation, IPN signature (HMAC-SHA512 over key-sorted JSON) |
| `src/lib/account.ts` | Client API wrapper (`fetchAccount`, `startCheckout`, `buyItem`, `equipItem`) |
| `src/components/ShopScreen.tsx`, `AccountScreen.tsx`, `CosmeticPreview.tsx` | UI |
| `src/game/render/cosmetics.ts` | Draws hats, weapon skins and trails on the boss |
| `supabase/migrations/20261124010000_points_payments.sql` | Schema, RLS, functions, trigger |

## 3. Point packs (USD)

| Pack ID | Price | Base points | Bonus | Total points |
|---|---|---|---|---|
| `pack_200` | $1.99 | 200 | 0% | **200** |
| `pack_550` | $4.99 | 500 | +10% (50) | **550** |
| `pack_1200` | $9.99 | 1,000 | +20% (200) | **1,200** |
| `pack_2600` | $19.99 | 2,000 | +30% (600) | **2,600** |

Rules: amounts are stored in integer cents and points in integers. The crypto price is the same USD amount; NOWPayments converts it to the coin. Changing a pack means editing `POINT_PACKS` only. A payment row stores the points and cents it was created with, so a later price change never alters a pending payment.

## 4. Cosmetic catalog

Three slots. Each slot has a free default ("None"/"Standard"). Only the boss controlled by the signed-in player shows the loadout. The Setup screen picks P1 or P2; team colours and ▲/■ markers are never changed (accessibility rule from the base plan).

| Item ID | Slot | Name | Rarity | Price |
|---|---|---|---|---|
| `hat_headband` | hat | Ink Headband | common | 150 |
| `hat_tophat` | hat | Gentleman's Top Hat | rare | 300 |
| `hat_horns` | hat | Oni Horns | rare | 450 |
| `hat_halo` | hat | Halo | epic | 700 |
| `hat_crown` | hat | Golden Crown | legendary | 1,200 |
| `wpn_obsidian` | weapon | Obsidian | common | 250 |
| `wpn_neon` | weapon | Neon Edge | rare | 450 |
| `wpn_gold` | weapon | Gilded | epic | 600 |
| `wpn_sakura` | weapon | Sakura | legendary | 900 |
| `trail_ink` | trail | Ink Splatter | common | 200 |
| `trail_ember` | trail | Embers | rare | 400 |
| `trail_frost` | trail | Frost | rare | 400 |
| `trail_rainbow` | trail | Prism | legendary | 1,000 |

Total to own everything: 7,000 points. Render rules: hats are drawn relative to the head joint and facing; weapon skins recolour the blade/bar/hilt (with a glow for neon); trails emit up to 2 particles per frame from the weapon tip **only during active attack frames** (from the existing `attackPhase`), using the existing capped 200-particle pool.

## 5. Data model (Postgres)

```sql
profiles(user_id uuid PK → auth.users, balance int default 0, loadout jsonb default '{}', created_at, updated_at)
payments(id uuid PK, user_id → auth.users, provider 'stripe'|'nowpayments', provider_ref text,
         provider_payment_intent text, pack_id text, points int>0, amount_cents int>0, currency text,
         status 'pending'|'paid'|'failed'|'expired'|'refunded', provider_status text,
         created_at, paid_at, updated_at, UNIQUE(provider, provider_ref))
point_ledger(id bigint identity PK, user_id, delta int≠0, reason 'purchase'|'spend'|'refund'|'adjust',
             payment_id → payments null, item_id text null, balance_after int, created_at,
             UNIQUE(payment_id, reason) WHERE payment_id IS NOT NULL)
owned_items(user_id, item_id, price_paid int, acquired_at, PK(user_id, item_id))
```

- **RLS** is on for all four tables. `authenticated` may `SELECT` only its own rows (`(select auth.uid()) = user_id`). There are no INSERT/UPDATE/DELETE policies, so only the service role writes.
- **Trigger** `on_auth_user_created` creates a `profiles` row for every new auth user. The functions also upsert, which covers users created before the migration.
- **Functions** (`SECURITY DEFINER`, `search_path = ''`, EXECUTE granted to `service_role` only):
  - `credit_payment(payment_id, provider_status, payment_intent)` → `(credited bool, balance int)`. Locks the payment row (`FOR UPDATE`). Already `paid` or `refunded` → no-op (`credited=false`). Otherwise sets it to paid, adds the points and writes a `purchase` ledger row. Allowed from `pending`, `failed` and `expired`, because a late crypto payment is still money received.
  - `refund_payment(payment_id, provider_status)` → `(refunded bool, balance int)`. Acts only on `paid`. Subtracts the points (the balance may go negative, which blocks further spending) and writes a `refund` ledger row.
  - `mark_payment(payment_id, status, provider_status)` changes `pending` → `failed`/`expired` only.
  - `purchase_item(user_id, item_id, price)` → `(ok bool, error text, balance int)`. Locks the profile. Errors: `already_owned`, `insufficient_points`. On success it inserts into `owned_items`, subtracts the price and writes a `spend` ledger row.
- **Invariant:** `profiles.balance = sum(point_ledger.delta)` per user. It is checked by the `wallet_audit` view (owner-only).

## 6. Payment flows

### 6.1 Stripe (card, Apple Pay, Google Pay, Link, local methods)
1. Client: `POST /api/checkout/stripe {packId}`.
2. Server: authenticate (401 if no session) → validate `packId` (400) → rate limit (10/10 min/user) → insert `payments` (pending) → `stripe.checkout.sessions.create`:
   - `mode: 'payment'` with a single `price_data` line built from the server pack.
   - `client_reference_id = payment.id`; `metadata` and `payment_intent_data.metadata` = `{payment_id, user_id, pack_id}`.
   - `customer_email` set; `success_url = SITE_URL/?checkout=success&payment=<id>`; `cancel_url = …cancelled…`.
   - Idempotency key = `payment.id`.
   → store `provider_ref = session.id` → return `{url}`.
3. Client: `window.location.assign(url)`. The player pays on Stripe.
4. Stripe → `POST /api/webhooks/stripe` (raw body, `Stripe-Signature` verified with `STRIPE_WEBHOOK_SECRET`; bad signature → 400):

| Event | Action |
|---|---|
| `checkout.session.completed` with `payment_status='paid'` | verify `amount_total == amount_cents` and the currency → `credit_payment` |
| `checkout.session.completed` with `payment_status='unpaid'` | async method (e.g. bank debit): leave pending, store provider status |
| `checkout.session.async_payment_succeeded` | verify amount → `credit_payment` |
| `checkout.session.async_payment_failed` | `mark_payment(failed)` |
| `checkout.session.expired` | `mark_payment(expired)` |
| `charge.refunded` (fully refunded) / `charge.dispute.created` | find the payment by `provider_payment_intent` → `refund_payment` |
| anything else | 200, ignored |

   Amount mismatch → not credited; `provider_status='amount_mismatch'`; logged. Unknown payment id → 200 + log (so Stripe stops retrying). DB error → 500 (Stripe retries for up to 3 days).
5. The client returns to `/?checkout=success&payment=<id>`, opens the Shop and polls `GET /api/account` every 3 s for up to 3 min. It shows "Payment received: +N points" when that payment is `paid`, or "Still processing, points appear automatically" on timeout.

### 6.2 NOWPayments (crypto)
1. Client: `POST /api/checkout/crypto {packId}`. Same auth, validation and rate limit as Stripe.
2. Server: insert pending `payments` → `POST {api}/v1/invoice` with header `x-api-key`. The body is `{price_amount: 4.99, price_currency: 'usd', order_id: payment.id, order_description, ipn_callback_url: SITE_URL/api/webhooks/nowpayments, success_url, cancel_url}`. Store `provider_ref = invoice.id` → return `{url: invoice_url}`. The API is `https://api.nowpayments.io` or `https://api-sandbox.nowpayments.io` when `NOWPAYMENTS_SANDBOX=true`.
3. The player picks a coin and pays on the NOWPayments page.
4. NOWPayments → `POST /api/webhooks/nowpayments`. Verify the header `x-nowpayments-sig` = hex HMAC-SHA512 of `JSON.stringify(body with keys sorted recursively)` with `NOWPAYMENTS_IPN_SECRET`, compared in constant time (bad → 401). Then look up the payment by `order_id`:

| `payment_status` | Action |
|---|---|
| `finished` (and `confirmed` if `NOWPAYMENTS_CREDIT_ON_CONFIRMED=true`) | verify `price_amount == amount_cents/100` and `price_currency == usd` → `credit_payment` |
| `waiting`, `confirming`, `confirmed`, `sending` | store provider status, stay pending |
| `partially_paid` | store provider status, stay pending (owner resolves it in the NOWPayments dashboard) |
| `failed` / `expired` | `mark_payment` (no effect if another attempt for the same invoice already paid) |
| `refunded` | `refund_payment` |

5. The client polls as in 6.1. Crypto confirmations can take 5–60 min, so the history tab shows "Pending (confirming)".

### 6.3 Spending
`POST /api/shop/buy {itemId}` → auth → item must exist in the catalog (400) → the price comes from the server catalog → `purchase_item` → 200 `{balance, owned}`, 409 `already_owned`, or 402 `insufficient_points`. `POST /api/shop/equip {slot, itemId|null}` → the item must be in that slot and owned (or null) → update `profiles.loadout` → 200 `{loadout}`.

## 7. Security checklist

| # | Threat | Control |
|---|---|---|
| S1 | Client sends a fake price/points | Client sends only IDs; server catalog decides |
| S2 | Forged webhook | Stripe signature / NOWPayments HMAC, constant-time compare, raw body |
| S3 | Double credit from retries or out-of-order events | `FOR UPDATE` lock, status machine, unique `(payment_id, reason)` ledger index |
| S4 | Reading another player's wallet | RLS select-own; API uses the session user id, never a client id |
| S5 | Secret leakage | `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `NOWPAYMENTS_*` have no `NEXT_PUBLIC_` prefix; `.env.local` git-ignored; secrets are read only in `src/lib/server/**` route code |
| S6 | Refund or chargeback abuse | Refund webhook removes points; a negative balance blocks spending; items already bought stay (documented) |
| S7 | Amount tampering at provider | Amount and currency re-checked in the webhook before credit |
| S8 | Spam checkout creation | Per-user rate limit; pending rows expire with the provider session |
| S9 | Open redirect | Success/cancel URLs built from `SITE_URL`, never from input |
| S10 | CSRF on buy/equip | JSON body + `SameSite=Lax` cookie + `Content-Type: application/json` required |

## 8. UI

- **Home:** new **SHOP** button. A top-right account chip shows `Sign in`, or `◆ 1,250 · email · Sign out`.
- **Account screen:** email field → "Send magic link"; "Continue with Google"; status messages. Shown when an action needs login.
- **Shop screen** (three tabs):
  1. **Get points:** 4 pack cards (price, points, bonus badge). Each has **Pay with card / wallet** (Stripe) and **Pay with crypto** (NOWPayments). A button is disabled with a hint when its provider isn't configured. Footer: "Points have no cash value and are non-refundable except where required by law."
  2. **Cosmetics:** grid by slot with an SVG preview, rarity colour, price, and Buy / Equip / Equipped states, plus a live preview of the full loadout.
  3. **History:** latest 20 payments (provider, pack, amount, status) and 20 ledger rows.
- **Setup screen:** "My cosmetics on: P1 / P2" (shown when signed in).
- Return from checkout: banner + polling (§6.1 step 5).

## 9. Configuration

| Variable | Where | Example |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server | existing |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser (sign-in) | same values as above |
| `SUPABASE_SECRET_KEY` | server only | `sb_secret_…` (Dashboard → Project Settings → API keys) |
| `SITE_URL` | server | `http://localhost:3000` / `https://inkdom.vercel.app` |
| `STRIPE_SECRET_KEY` | server only | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | server only | `whsec_…` |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` | server only | from the NOWPayments dashboard |
| `NOWPAYMENTS_SANDBOX` | server | `true` while testing |
| `NOWPAYMENTS_CREDIT_ON_CONFIRMED` | server | `false` (default: credit on `finished`) |

`GET /api/health` reports `auth`, `payments.stripe` and `payments.crypto` as `configured` / `not-configured`. It never reports values.

## 10. Work breakdown

| ID | Task | Est. | Acceptance |
|---|---|---|---|
| W1 | Catalog + packs (`shop.ts`) + unit tests | 0.5 d | IDs unique, prices > 0, totals match §3 |
| W2 | Migration (tables, RLS, trigger, 4 functions, audit view) | 0.5 d | Applies cleanly; advisors show no RLS warnings |
| W3 | Auth: browser client, proxy session refresh, callback route, `getSessionUser` | 0.5 d | Magic link and Google sign-in land back signed in |
| W4 | Payments core + Supabase store + tests | 1 d | All T-P tests in §11 green |
| W5 | Stripe checkout + webhook routes | 0.5 d | Test card 4242… credits points once |
| W6 | NOWPayments checkout + IPN route | 0.5 d | Sandbox invoice → `finished` IPN credits once |
| W7 | Account/buy/equip routes | 0.5 d | 401/400/402/409 cases correct |
| W8 | UI: account, shop (3 tabs), previews, home chip, return polling | 1.5 d | Manual flow M-1…M-8 |
| W9 | Renderer cosmetics (hat, weapon, trail) | 0.5 d | Render test with a loadout passes; 60 fps kept |
| W10 | Docs (DEPLOY, PAYMENTS, README, KNOWN_ISSUES), smoke checks | 0.5 d | Smoke checks pass |
| | **Total** | **≈ 6.5 d** | |

## 11. Tests

Automated (Vitest, `tests/shop.test.ts`, `tests/payments.test.ts`):

| ID | Case | Expected |
|---|---|---|
| T-P01 | Catalog/pack integrity | Unique IDs, valid slots, totals = base + bonus |
| T-P02 | `sanitizeLoadout` drops unowned/unknown/wrong-slot items | Only valid owned IDs remain |
| T-P03 | NOWPayments signature over nested, unsorted JSON | Matches the reference HMAC; tampered body or wrong secret rejected |
| T-P04 | Stripe `constructEvent` with a generated test header | Valid accepted, tampered rejected |
| T-P05 | Stripe `completed` + paid | Credited once; replaying the event credits nothing |
| T-P06 | Stripe `completed` + unpaid, then `async_payment_succeeded` | Credit only on the second event |
| T-P07 | Stripe amount mismatch | Not credited, `amount_mismatch` |
| T-P08 | Stripe `expired` / `async_payment_failed` | Status expired / failed, no points |
| T-P09 | Stripe `charge.refunded` full refund after credit | Points removed once |
| T-P10 | NOWPayments `finished` | Credited once; duplicate IPN ignored |
| T-P11 | NOWPayments `partially_paid`, `confirming` | Pending, no points |
| T-P12 | NOWPayments wrong `price_amount` | Not credited |
| T-P13 | NOWPayments `expired` then `finished` (second attempt) | Credited |
| T-P14 | Unknown `payment_id` / `order_id` | Ignored with outcome `unknown_payment` |
| T-P15 | Renderer with a full loadout | Draws without errors, extra hat/trail draw calls present |

Smoke (`scripts/smoke.mjs`): `/api/account` signed out → 200 `{signedIn:false}`; non-JSON checkout → 415; `/api/checkout/stripe` → 401; `/api/shop/buy` → 401; `/api/webhooks/stripe` with a bad signature → 400 (or 503 if not configured); `/api/webhooks/nowpayments` with a bad signature → 401 (or 503).

Manual (owner, test mode):

| ID | Steps | Pass |
|---|---|---|
| M-1 | Sign in with magic link, then with Google | Chip shows email and 0 points |
| M-2 | Buy `pack_550` with card `4242 4242 4242 4242` | Returns to Shop; +550 within seconds; history "paid" |
| M-3 | Card `4000 0000 0000 9995` (declined) | No points; payment stays pending, then expires |
| M-4 | Crypto pack in NOWPayments sandbox | Invoice opens; after the sandbox "finished" status, points credited |
| M-5 | Buy `hat_tophat`, equip it, start a match | Boss wears the top hat; balance −300 |
| M-6 | Try to buy with too few points | "Not enough points" message, no change |
| M-7 | Refund M-2 in the Stripe Dashboard | Balance −550 (may go negative) |
| M-8 | Sign out | Shop asks to sign in; the game still plays without login |

## 12. Owner actions before going live

1. Apply `supabase/migrations/20261124010000_points_payments.sql` (after the playtest migration).
2. Supabase → Authentication:
   - Set **Site URL** and add the redirect URLs `http://localhost:3000/auth/callback` and `https://<prod>/auth/callback`.
   - Enable **Google**: create an OAuth client in Google Cloud Console with redirect `https://yuoumdofbcivewdcuovv.supabase.co/auth/v1/callback`.
   - Set up custom SMTP for production magic links, because the built-in sender is rate limited.
3. Stripe:
   - Create the account and get test keys.
   - Turn on the payment methods you want in Dashboard → Settings → Payment methods.
   - Add the webhook endpoint `https://<prod>/api/webhooks/stripe` with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`.
   - For local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
4. NOWPayments: create an account (sandbox first), add a payout wallet, create an API key and an IPN secret, and set the IPN URL to `https://<prod>/api/webhooks/nowpayments`. The IPN needs a public URL; for local testing use a tunnel (e.g. ngrok).
5. Legal: Terms of Sale for virtual currency, refund policy, privacy policy (now storing email), and age requirement. Check whether your country requires a licence to accept crypto as a business. Taxes: consider Stripe Tax.
6. Switch to live keys only after M-1…M-8 pass in test mode.
