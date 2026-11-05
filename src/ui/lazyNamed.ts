// Code-split helper (docs/DEPLOYMENT.md §code-splitting): React.lazy wants a default export,
// but our screens are named exports. `lazyNamed(() => import('./X'), 'X')` keeps every screen's
// public API untouched. Keep this file dependency-free (React only).
//
// Resilience + warmth (2026-11):
//  • ONE automatic retry — a failed dynamic import is retried once after a short beat (a flaky
//    network, a deploy racing the precache) before the per-screen boundary offers Retry.
//    Browsers cache a failed module fetch for the page's lifetime (re-importing the same URL
//    rejects instantly, no network), so the retry re-imports the chunk under a cache-busting
//    query when the error names its URL (Chromium/Firefox do).
//  • A screen's own STYLESHEET (docs/DEPLOYMENT.md §boot-css) fails the import too ("Unable to
//    preload CSS for …"), and Vite never re-requests a sheet it already tried — so every later
//    attempt first re-requests the failed sheet (a fresh <link>), else the screen would render
//    unstyled.
//  • A failure surfaces ONCE (React.lazy caches the rejection → the screen boundary shows it);
//    the boundary's Retry calls retryFailedScreens(), which hands every failed screen a FRESH
//    loader for its next mount.
//  • `preload()` runs the SAME import thunk (the Hub's idle prefetch); once the module is in,
//    the screen renders it directly — no Suspense fallback, no "Loading…" flash.
import { createElement, lazy, type ComponentType } from 'react';

/** The beat before the single automatic retry of a failed chunk import. */
export const LAZY_RETRY_MS = 400;

/** The chunk URL a failed dynamic import names, if the browser put it in the message. */
export function failedChunkUrl(err: unknown): string | null {
  const m = /(https?:\/\/[^\s'"]+?\.m?js)(?=$|[\s'"?#])/.exec(err instanceof Error ? err.message : String(err));
  return m ? m[1] : null;
}

function reimport<T>(url: string): Promise<T> {
  return import(/* @vite-ignore */ url) as Promise<T>;
}

/** The stylesheet a failed chunk load names (Vite: "Unable to preload CSS for <href>"), if any. */
export function failedCssHref(err: unknown): string | null {
  const m = /Unable to preload CSS for (\S+?\.css)(?=$|[\s'"?#])/.exec(err instanceof Error ? err.message : String(err));
  return m ? m[1] : null;
}

/** Re-request a stylesheet whose load failed: drop the dead <link>, append a fresh one, await it. */
function restyle(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    for (const old of document.querySelectorAll(`link[rel="stylesheet"][href="${href}"]`)) old.remove();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = '';
    link.href = href;
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', () => reject(new Error(`Unable to preload CSS for ${href}`)));
    document.head.appendChild(link);
  });
}

/** Stylesheets that failed to load — re-requested before the next attempt of ANY screen. */
const failedCss = new Set<string>();

/** Run `load`; on failure wait `delayMs` and try exactly once more — through a cache-busted
 *  re-import of the failed chunk when its URL is known, else `load` again; a failed stylesheet is
 *  re-requested first (unit-tested). */
export function retryOnce<T>(
  load: () => Promise<T>,
  delayMs = LAZY_RETRY_MS,
  again: (url: string) => Promise<T> = reimport,
  css: (href: string) => Promise<void> = restyle,
): Promise<T> {
  const attempt = (): Promise<T> =>
    Promise.all([...failedCss].map((href) => css(href).then(() => { failedCss.delete(href); }))).then(load);
  return attempt().catch((err: unknown) => new Promise<T>((resolve, reject) => {
    const href = failedCssHref(err);
    if (href) failedCss.add(href);
    setTimeout(() => {
      const url = href ? null : failedChunkUrl(err);
      (url ? again(`${url}?retry=${Date.now()}`) : attempt()).then(resolve, reject);
    }, delayMs);
  }));
}

/** A lazily-loaded named-export component that can be warmed ahead of its first render. */
export type LazyScreen<P> = ComponentType<P> & { preload(): Promise<void> };

const failedResets = new Set<() => void>();

/** Give every screen whose load failed a fresh loader (the screen boundary's Retry). */
export function retryFailedScreens(): void {
  for (const reset of failedResets) reset();
  failedResets.clear();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<M extends Record<string, any>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
): M[K] extends ComponentType<infer P> ? LazyScreen<P> : never {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type C = ComponentType<any>;
  let resolved: C | null = null;
  let pending: Promise<C> | null = null;
  const makeLazy = () => lazy(() => fetchComponent().then((c) => ({ default: c })));
  let Inner = makeLazy();
  const reset = (): void => { Inner = makeLazy(); };
  function fetchComponent(): Promise<C> {
    pending ??= retryOnce(load).then(
      (m) => (resolved = m[name] as C),
      (err: unknown) => {
        pending = null; // the next attempt refetches
        failedResets.add(reset); // the boundary's Retry swaps in a fresh lazy (this one cached the error)
        throw err;
      },
    );
    return pending;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Screen = (props: any) => createElement(resolved ?? Inner, props);
  Screen.displayName = `Lazy(${name})`;
  Screen.preload = (): Promise<void> => fetchComponent().then(() => undefined, () => undefined);
  return Screen as never;
}
