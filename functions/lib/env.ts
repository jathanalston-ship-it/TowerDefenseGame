// Pages Functions environment: bindings + secrets. All secrets are configured in
// the Cloudflare Pages project (Settings → Environment variables) or .dev.vars
// locally — NEVER in code or in any VITE_-prefixed variable. See .env.example.

export interface Env {
  DB: D1Database;
  /** Stripe secret key (sk_test_… preview / sk_live_… production). Absent ⇒ store endpoints 503. */
  STRIPE_SECRET_KEY?: string;
  /** Webhook signing secret (whsec_…) for /api/stripe/webhook. Absent ⇒ webhook 503. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Turnstile secret. Absent ⇒ Turnstile checks are SKIPPED (local dev only). */
  TURNSTILE_SECRET_KEY?: string;
  /** HMAC secret for daily-run day tickets (leaderboard day binding). */
  DAY_TICKET_SECRET?: string;
  /** Password-reset email delivery webhook (any provider accepting POST {to, token}).
   *  Absent ⇒ /api/account/reset request-step returns 503 'email-not-configured'. */
  RESET_EMAIL_WEBHOOK?: string;
  /** Moderation key for /api/auction/flags (header x-mod-key). Absent ⇒ endpoint 503. */
  MOD_KEY?: string;
  /** Developer analytics key for /api/dev/* (header x-dev-key) — the desktop dev app's
   *  credential (docs/ANALYTICS.md §devapp). Absent ⇒ the whole dev API 503s (closed). */
  DEV_KEY?: string;
  /** Comma list of ISO country codes where SKUs with random-content containers cannot be bought
   *  with real money (lib/lootbox.ts). Unset => "BE,NL"; "" => none. */
  PAID_LOOTBOX_BLOCKED_COUNTRIES?: string;
  /** 'production' | 'preview' — production refuses sk_test_ keys. */
  ENVIRONMENT?: string;
}

export type Ctx = EventContext<Env, string, unknown>;

/** Production sanity: a live deployment must not run on test-mode Stripe keys. */
export function stripeKeyProblem(env: Env): string | null {
  if (!env.STRIPE_SECRET_KEY) return 'STRIPE_SECRET_KEY is not configured';
  if (env.ENVIRONMENT === 'production' && env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    return 'production is configured with a TEST-mode Stripe key';
  }
  return null;
}
