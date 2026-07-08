// "Update ready" toast (docs/DEPLOYMENT.md §sw): a new service worker is waiting —
// the player picks the refresh moment (never forced, never mid-run surprise).

import { useEffect, useState } from 'react';
import { applyUpdate, SW_UPDATE_EVENT } from '../../net/swRegister';
import { t, useLocale } from '../../i18n';

export function UpdateToast(): JSX.Element | null {
  useLocale();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const on = (): void => setReady(true);
    window.addEventListener(SW_UPDATE_EVENT, on);
    return () => window.removeEventListener(SW_UPDATE_EVENT, on);
  }, []);
  if (!ready) return null;
  return (
    <div className="swtoast" role="status">
      <span className="swtoast-t">{t('sw.ready')}</span>
      <button className="primary swtoast-btn" onClick={applyUpdate}>{t('sw.refresh')}</button>
      <button className="swtoast-later" onClick={() => setReady(false)} aria-label="Dismiss">✕</button>
    </div>
  );
}
