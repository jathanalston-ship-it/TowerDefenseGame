# STRIPE-SETUP.md — exactly what to configure in Stripe

The complete operator checklist for ASSIMILATION's store. No code changes are
involved — the integration reads everything from environment variables
(docs/DEPLOYMENT.md §3). **Never** paste a key into the repo.

The integration uses **Stripe Checkout (hosted)** with inline `price_data` —
you do NOT need to create Products/Prices in the dashboard; the server derives
every amount from the in-repo catalog (`src/core/premium.ts`), so the catalog
and the charges can never disagree. (You can migrate to dashboard Prices later
for tax/reporting features; that's an optional follow-up, not a requirement.)

## 1. Account

- [ ] Create/activate a Stripe account: https://dashboard.stripe.com
- [ ] Complete business verification (required before LIVE payments)
- [ ] Set the public business name (players see it on the Checkout page and
      their card statements) — Settings → Public details

## 2. API keys

Stripe has two separate modes; each has its own keys and webhooks.

- [ ] **Test mode** (toggle top-right): Developers → API keys → copy the
      **Secret key** (`sk_test_…`) → set as `STRIPE_SECRET_KEY` on the Pages
      **preview** environment
- [ ] **Live mode**: copy the live **Secret key** (`sk_live_…`) → set as
      `STRIPE_SECRET_KEY` on the Pages **production** environment ONLY
- [ ] Never use the publishable key anywhere (this integration doesn't need it)
- [ ] Confirm `ENVIRONMENT=production` is set on production — the backend
      refuses to run production traffic on a `sk_test_` key

## 3. Webhook endpoint (one per mode)

- [ ] Developers → Webhooks → **Add endpoint**
- [ ] Endpoint URL: `https://<your-domain>/api/stripe/webhook`
      (for preview testing: your `*.pages.dev` preview URL)
- [ ] Events to send — exactly these four:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `charge.refunded`
  - `charge.refund.updated`
- [ ] After creating, reveal the **Signing secret** (`whsec_…`) → set as
      `STRIPE_WEBHOOK_SECRET` in the matching Pages environment
- [ ] Repeat in live mode (live endpoints get a DIFFERENT `whsec_…`)

## 4. Checkout settings (dashboard)

- [ ] Settings → Checkout: enable the payment methods you want (card is
      enough to launch; wallets like Apple/Google Pay are one-click adds)
- [ ] Branding: upload the logo/colors players should see on the hosted page

## 5. Refund policy operations

Refunds are issued from the Stripe dashboard (Payments → ⋯ → Refund). The
webhook (`charge.refunded`) marks the purchase `refunded` in D1 automatically;
any later claim stops granting. Already-applied in-game grants are NOT clawed
back automatically (virtual goods may be spent) — that's a support decision,
with `GET /api/store/history` and the D1 `purchases` table as the record.

## 6. Test the flow (test mode, before go-live)

- [ ] Deploy a preview with `VITE_CHECKOUT_PROVIDER=stripe` + test-mode keys
- [ ] Buy any Ichor bundle with test card `4242 4242 4242 4242` (any future
      expiry / any CVC) → returned to the game → items delivered once
- [ ] Refresh the return URL → nothing delivers twice
- [ ] Cancel a checkout (browser back / Cancel) → "nothing was charged" note,
      no grant
- [ ] Declined card `4000 0000 0000 0002` → no grant, session simply expires
- [ ] Close the tab after paying but BEFORE returning → reopen the game →
      the purchase is claimed and delivered on boot
- [ ] Buy a permanent pack twice → second checkout refused (`offer-cap-reached`)
- [ ] Dashboard → the payment → Refund it → webhook flips the purchase to
      `refunded` (check `GET /api/store/history`)
- [ ] Developers → Webhooks → confirm all deliveries are `200`; use "Resend"
      on a delivery → still exactly one fulfillment (event dedupe)

## 7. Go-live

- [ ] Business verification complete; live mode enabled
- [ ] Live `STRIPE_SECRET_KEY` + live `STRIPE_WEBHOOK_SECRET` on production
- [ ] `VITE_CHECKOUT_PROVIDER=stripe` on production
- [ ] One real small purchase (e.g. the $1.99 starter) end-to-end, then refund
      it from the dashboard
- [ ] Statement descriptor reads correctly on the test charge
