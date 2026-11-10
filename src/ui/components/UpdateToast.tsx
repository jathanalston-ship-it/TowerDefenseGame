// "Update ready" toast (docs/DEPLOYMENT.md §sw): a new service worker is waiting —
// the player picks the refresh moment (never forced, never mid-run surprise).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { applyUpdate, hasWaitingUpdate, SW_UPDATE_EVENT } from '../../net/swRegister';
import { t, useLocale } from '../../i18n';

export function UpdateToast({ held = false }: { held?: boolean }): JSX.Element | null {
  useLocale();
  const [ready, setReady] = useState(hasWaitingUpdate);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dismissedControl = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const on = (): void => setReady(true);
    window.addEventListener(SW_UPDATE_EVENT, on);
    if (hasWaitingUpdate()) on();
    return () => window.removeEventListener(SW_UPDATE_EVENT, on);
  }, []);
  useLayoutEffect(() => {
    const removed = dismissedControl.current;
    dismissedControl.current = null;
    if (removed && !removed.isConnected && document.activeElement === document.body && previousFocus.current?.isConnected) {
      previousFocus.current.focus({ preventScroll: true });
    }
  }, [ready]);
  if (!ready || held) return null;
  return (
    <div className="swtoast" role="status" onFocusCapture={e => {
      if (e.relatedTarget instanceof HTMLElement && !e.currentTarget.contains(e.relatedTarget)) previousFocus.current = e.relatedTarget;
    }}>
      <span className="swtoast-t">{t('sw.ready')}</span>
      <button className="primary swtoast-btn" onClick={applyUpdate}>{t('sw.refresh')}</button>
      <button type="button" className="swtoast-later" onClick={e => {
        if (document.activeElement === e.currentTarget) dismissedControl.current = e.currentTarget;
        setReady(false);
      }} aria-label={t('sw.dismiss')}>✕</button>
    </div>
  );
}
