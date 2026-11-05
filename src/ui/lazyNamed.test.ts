// lazyNamed resilience (docs/DEPLOYMENT.md §code-splitting): a failed chunk import is retried
// exactly ONCE before the per-screen boundary takes over, and preload() warms the same thunk the
// render uses (one fetch, shared).

import { describe, expect, it, vi } from 'vitest';
import { failedChunkUrl, failedCssHref, lazyNamed, retryOnce, retryFailedScreens } from './lazyNamed';

describe('retryOnce', () => {
  it('resolves on the first try without retrying', async () => {
    const load = vi.fn(async () => 'ok');
    await expect(retryOnce(load, 0)).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries a failed load exactly once and recovers', async () => {
    let n = 0;
    const load = vi.fn(async () => { if (n++ === 0) throw new Error('Failed to fetch dynamically imported module'); return 'ok'; });
    await expect(retryOnce(load, 0)).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('re-imports a failed chunk under a cache-busting URL (browsers cache module-fetch failures)', async () => {
    const load = vi.fn(async () => { throw new TypeError('Failed to fetch dynamically imported module: https://x.test/assets/HeroLab-AbC12.js'); });
    const again = vi.fn(async (url: string) => ({ url }));
    const m = await retryOnce(load, 0, again as never) as unknown as { url: string };
    expect(load).toHaveBeenCalledTimes(1);
    expect(m.url).toMatch(/^https:\/\/x\.test\/assets\/HeroLab-AbC12\.js\?retry=\d+$/);
  });

  it('failedChunkUrl reads the URL Chromium/Firefox put in the message (Safari has none)', () => {
    expect(failedChunkUrl(new TypeError('Failed to fetch dynamically imported module: http://h:1/assets/A-x.js'))).toBe('http://h:1/assets/A-x.js');
    expect(failedChunkUrl(new TypeError('error loading dynamically imported module: https://h/assets/B.mjs'))).toBe('https://h/assets/B.mjs');
    expect(failedChunkUrl(new TypeError('Importing a module script failed.'))).toBeNull();
  });

  it('a failed screen STYLESHEET is re-requested before the retry (Vite skips a sheet it already tried)', async () => {
    let n = 0;
    const load = vi.fn(async () => { if (n++ === 0) throw new Error('Unable to preload CSS for /assets/TowerLab-x1.css'); return 'ok'; });
    const css = vi.fn(async () => undefined);
    await expect(retryOnce(load, 0, undefined, css)).resolves.toBe('ok');
    expect(css).toHaveBeenCalledWith('/assets/TowerLab-x1.css');
    expect(load).toHaveBeenCalledTimes(2);
    // a sheet that loaded is never re-requested again
    await expect(retryOnce(async () => 'ok', 0, undefined, css)).resolves.toBe('ok');
    expect(css).toHaveBeenCalledTimes(1);
  });

  it('a sheet that still fails is re-requested on the boundary\'s Retry too, never skipped', async () => {
    const dead = vi.fn(async (href: string) => { throw new Error(`Unable to preload CSS for ${href}`); });
    const load = vi.fn(async () => { throw new Error('Unable to preload CSS for /assets/HeroLab-y2.css'); });
    await expect(retryOnce(load, 0, undefined, dead)).rejects.toThrow('HeroLab-y2.css');
    expect(load).toHaveBeenCalledTimes(1); // the retry stopped at the sheet — no unstyled render
    const ok = vi.fn(async () => undefined);
    await expect(retryOnce(async () => 'ok', 0, undefined, ok)).resolves.toBe('ok'); // Retry: sheet first, then the screen
    expect(ok).toHaveBeenCalledWith('/assets/HeroLab-y2.css');
  });

  it('failedCssHref reads Vite\'s stylesheet preload error', () => {
    expect(failedCssHref(new Error('Unable to preload CSS for /assets/Wardrobe-AbC.css'))).toBe('/assets/Wardrobe-AbC.css');
    expect(failedCssHref(new TypeError('Failed to fetch dynamically imported module: http://h/assets/A.js'))).toBeNull();
  });

  it('gives up after the single retry (the boundary shows Retry + Back)', async () => {
    const load = vi.fn(async () => { throw new Error('offline'); });
    await expect(retryOnce(load, 0)).rejects.toThrow('offline');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('lazyNamed.preload', () => {
  it('runs the import thunk once and shares it (prefetch + render never double-fetch)', async () => {
    const Comp = (): null => null;
    const load = vi.fn(async () => ({ Comp }));
    const Screen = lazyNamed(load, 'Comp');
    await Screen.preload();
    await Screen.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a failed preload is swallowed and the next attempt refetches', async () => {
    let n = 0;
    const Comp = (): null => null;
    const load = vi.fn(async () => { if (n++ < 2) throw new Error('offline'); return { Comp }; });
    const Screen = lazyNamed(load, 'Comp');
    vi.useFakeTimers();
    const first = Screen.preload(); // try + the one retry both fail
    await vi.runAllTimersAsync();
    await expect(first).resolves.toBeUndefined();
    vi.useRealTimers();
    await Screen.preload(); // fresh attempt succeeds
    expect(load).toHaveBeenCalledTimes(3);
    retryFailedScreens(); // the boundary's Retry: harmless once recovered
  });
});
