/// <reference types="vite/client" />

// Build-time client configuration (docs/DEPLOYMENT.md §Environment variables).
// Everything here is PUBLIC — it ships in the bundle to every visitor.
interface ImportMetaEnv {
  /** Payment provider: 'sandbox' (offline dev stub) or 'stripe' (real Checkout via /api). */
  readonly VITE_CHECKOUT_PROVIDER?: 'sandbox' | 'stripe';
  /** Cloudflare Turnstile site key (public). Empty/absent ⇒ Turnstile disabled (dev). */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Rewarded-ad provider: 'none' (hide the Field Research lane — launch default) or
   *  'simulated' (dev/preview themed stub). Real adapters register in src/ads/provider.ts. */
  readonly VITE_ADS_PROVIDER?: 'none' | 'simulated';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
