# Payments setup: points, Stripe, crypto and cosmetics

Players sign in, buy **Inkdom Points** by card/wallet (Stripe) or crypto (NOWPayments), and spend them on cosmetic items. The full spec is in [`INKDOM_Payments_Plan.md`](../INKDOM_Payments_Plan.md). This page covers the setup steps.

Each feature switches on when its settings are present. Check `GET /api/health`:

```json
{ "auth": "configured", "wallet": "configured", "payments": { "stripe": "configured", "crypto": "configured" } }
```

## 1. Database (once)

Run both migrations in order in the Supabase **SQL Editor** (project `stick-empire-beta`):

1. `supabase/migrations/20261124000000_playtest_tables.sql` (playtest logs; skip if already applied)
2. `supabase/migrations/20261124010000_points_payments.sql` (profiles, payments, ledger, owned items, wallet functions)

Then **Project Settings → API keys**: copy the **secret** key (`sb_secret_…`) into `SUPABASE_SECRET_KEY`. Never put it in a `NEXT_PUBLIC_` variable.

## 2. Sign-in (Supabase Auth)

**Authentication → URL Configuration**
- **Site URL:** your production URL (e.g. `https://inkdom.vercel.app`)
- **Redirect URLs:** `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`

**Email magic link:** on by default. Supabase's built-in email sender only sends a few emails per hour. Before real players use it, add your own SMTP server (Authentication → Emails → SMTP, e.g. Resend, Postmark or SendGrid).

**Google:**
1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
2. Authorized redirect URI: `https://yuoumdofbcivewdcuovv.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → **Google**: paste the Client ID and Secret and enable it.

## 3. Stripe (cards, Apple Pay, Google Pay, Link, local methods)

1. Create a Stripe account. Use **test mode** first.
2. **Developers → API keys**: copy the secret key into `STRIPE_SECRET_KEY`.
3. **Settings → Payment methods**: turn on the methods you want. The code doesn't restrict methods, so Checkout shows every eligible method for the buyer's country. Apple Pay works on the Stripe-hosted page without extra domain setup.
4. **Webhooks:**
   - **Local testing:** install the Stripe CLI, then run:
     ```bash
     stripe login
     stripe listen --forward-to localhost:3000/api/webhooks/stripe
     ```
     Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
   - **Production:** Developers → Webhooks → **Add endpoint** `https://<your-domain>/api/webhooks/stripe` with these events:
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`. Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 9995` (declined), `4000 0025 0000 3155` (3-D Secure). Any future date and any CVC work.

## 4. NOWPayments (crypto)

1. Create an account at nowpayments.io. Start with the **sandbox** (account.sandbox.nowpayments.io) and set `NOWPAYMENTS_SANDBOX=true`.
2. Add a **payout wallet** (where you receive the crypto).
3. **Settings → Payments → API keys**: create a key and copy it into `NOWPAYMENTS_API_KEY`.
4. **Settings → Payments → IPN**: generate the **IPN secret** and copy it into `NOWPAYMENTS_IPN_SECRET`. The callback URL is sent with each invoice: `SITE_URL/api/webhooks/nowpayments`.
5. IPN callbacks need a **public** URL. To test locally, run a tunnel (e.g. `ngrok http 3000`) and set `SITE_URL` to the tunnel URL.
6. Points are credited when the payment reaches `finished`. Set `NOWPAYMENTS_CREDIT_ON_CONFIRMED=true` to credit at `confirmed` instead (faster, but the funds haven't been sent to you yet).
7. **Underpayments** (`partially_paid`) stay pending. Resolve them in the NOWPayments dashboard (refund, or ask the buyer to top up).

## 5. Environment variables

| Name | Secret? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | Browser sign-in (same values as `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`) |
| `SUPABASE_SECRET_KEY` | **yes** | Wallet writes |
| `SITE_URL` | no | e.g. `https://inkdom.vercel.app` (no trailing slash) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **yes** | |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` | **yes** | |
| `NOWPAYMENTS_SANDBOX` | no | `true` while testing |
| `NOWPAYMENTS_CREDIT_ON_CONFIRMED` | no | default `false` |

On Vercel add them under Project → Settings → Environment Variables, then redeploy.

## 6. Changing prices and items

Everything is in `src/game/config/shop.ts`:
- `POINT_PACKS`: price in cents, base points and bonus points.
- `COSMETICS`: id, slot, name, rarity, price and colours.

Don't rename or delete an item id players already own; set a new id instead. Pending payments keep the points and price they were created with.

## 7. Operations

- **Refunds:** refund in the Stripe or NOWPayments dashboard. The webhook removes the points automatically. If they were already spent, the balance goes negative and spending is blocked until it is positive again. Items already bought stay owned.
- **Manual adjustment** (support case), in the SQL editor:
  ```sql
  update profiles set balance = balance + 100 where user_id = '<uuid>' returning balance;
  insert into point_ledger (user_id, delta, reason, balance_after)
  select user_id, 100, 'adjust', balance from profiles where user_id = '<uuid>';
  ```
- **Audit:** `select * from wallet_audit where not consistent;` should return no rows.
- **Revenue overview:**
  ```sql
  select provider, status, count(*), sum(amount_cents)/100.0 as usd from payments group by 1, 2 order by 1, 2;
  ```

## 8. Before taking real money

- [ ] Manual tests M-1…M-8 (plan §11) pass in test/sandbox mode
- [ ] Terms of Sale (virtual currency, no cash value, refund policy), Privacy Policy (you now store email addresses), age requirement
- [ ] Check whether you need to register to accept crypto as a business in your country, and how sales tax/VAT applies (Stripe Tax can calculate it)
- [ ] Custom SMTP for magic links
- [ ] Switch Stripe to live keys with a live webhook endpoint, and set `NOWPAYMENTS_SANDBOX=false` with live keys
