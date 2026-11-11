import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

async function setup(controller: object | null, waiting: object | null) {
  vi.stubEnv('PROD', true);
  const win = Object.assign(new EventTarget(), { location: { reload: vi.fn() } });
  const reg = Object.assign(new EventTarget(), { waiting, installing: null as ReturnType<typeof worker> | null });
  const serviceWorker = Object.assign(new EventTarget(), { controller, register: vi.fn().mockResolvedValue(reg) });
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { serviceWorker });
  const api = await import('./swRegister');
  const announce = vi.fn();
  win.addEventListener(api.SW_UPDATE_EVENT, announce);
  api.registerServiceWorker();
  win.dispatchEvent(new Event('load'));
  await Promise.resolve();
  return { api, win, reg, serviceWorker, announce };
}

function worker() {
  return Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() });
}

describe('service worker update prompt', () => {
  it('retains an already waiting update for a prompt that mounts after its event', async () => {
    const pending = worker();
    const { api, announce } = await setup({}, pending);
    expect(announce).toHaveBeenCalledOnce();
    expect(api.hasWaitingUpdate()).toBe(true);
    expect(pending.postMessage).not.toHaveBeenCalled();
    api.applyUpdate();
    expect(pending.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('announces only after an incoming update finishes installation', async () => {
    const { api, reg, announce } = await setup({}, null);
    expect(api.hasWaitingUpdate()).toBe(false);
    const pending = worker();
    reg.installing = pending;
    reg.dispatchEvent(new Event('updatefound'));
    pending.dispatchEvent(new Event('statechange'));
    expect(announce).not.toHaveBeenCalled();
    pending.state = 'installed';
    pending.dispatchEvent(new Event('statechange'));
    expect(api.hasWaitingUpdate()).toBe(true);
    expect(announce).toHaveBeenCalledOnce();
    expect(pending.postMessage).not.toHaveBeenCalled();
  });

  it('does not prompt or reload on the first installation', async () => {
    const { api, reg, serviceWorker, win, announce } = await setup(null, null);
    const pending = worker();
    reg.installing = pending;
    reg.dispatchEvent(new Event('updatefound'));
    pending.state = 'installed';
    pending.dispatchEvent(new Event('statechange'));
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(api.hasWaitingUpdate()).toBe(false);
    expect(announce).not.toHaveBeenCalled();
    expect(win.location.reload).not.toHaveBeenCalled();
  });
});
