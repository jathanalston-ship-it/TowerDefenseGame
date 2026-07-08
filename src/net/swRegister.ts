// Service worker registration + update detection (docs/DEPLOYMENT.md §sw).
// PROD only — dev servers must never fight a cache. When a new worker reaches
// `installed` while a controller exists, a fresh version is WAITING: we announce it
// (UpdateToast listens) and the player chooses the refresh moment — never mid-run.

export const SW_UPDATE_EVENT = 'assimilate:sw-update';

let waitingWorker: ServiceWorker | null = null;
let reloading = false;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const announce = (w: ServiceWorker | null): void => {
          if (!w) return;
          waitingWorker = w;
          window.dispatchEvent(new Event(SW_UPDATE_EVENT));
        };
        if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
          });
        });
      })
      .catch(() => {
        /* registration failure = the app simply stays online-only */
      });
    // The moment the new worker takes control, one clean reload finishes the swap.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

/** UpdateToast's refresh action: promote the waiting worker (reload rides controllerchange). */
export function applyUpdate(): void {
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
}
