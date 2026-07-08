// Cloudflare Turnstile client — lazily injects the script and runs one INVISIBLE
// challenge per request-needing-a-token. No site key configured (dev) ⇒ resolves
// undefined and the server skips verification too. Fail-soft by design: a
// Turnstile outage degrades to the server's answer, never a hung UI.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptLoading) {
    scriptLoading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptLoading = null;
        reject(new Error('turnstile script failed'));
      };
      document.head.appendChild(el);
    });
  }
  return scriptLoading;
}

/** One invisible challenge → token (or undefined when Turnstile is not configured
 *  or unavailable — the caller sends the request anyway and the server decides). */
export async function turnstileToken(timeoutMs = 15_000): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  try {
    await loadScript();
    const ts = window.turnstile;
    if (!ts) return undefined;
    return await new Promise<string | undefined>((resolve) => {
      const host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.inset = 'auto 0 0 auto'; // interactive fallback renders bottom-right
      host.style.zIndex = '10000';
      document.body.appendChild(host);
      let widgetId: string | null = null;
      const done = (token?: string): void => {
        if (widgetId !== null) ts.remove(widgetId);
        host.remove();
        resolve(token);
      };
      const timer = window.setTimeout(() => done(undefined), timeoutMs);
      widgetId = ts.render(host, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        callback: (token: string) => {
          window.clearTimeout(timer);
          done(token);
        },
        'error-callback': () => {
          window.clearTimeout(timer);
          done(undefined);
        },
      });
    });
  } catch {
    return undefined;
  }
}
