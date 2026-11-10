// Replay sharing: clipboard first, with a readable/selectable fallback when the browser refuses.
import { useEffect, useRef, useState } from 'react';
import { encodeReplayCode, replayShareUrl } from '../../net/replayShare';
import { t, useLocale } from '../../i18n';
import type { MsgKey } from '../../i18n';

export function ShareReplayButton({ blob, labelKey = 'daily.theater.share' }: { blob: string; labelKey?: MsgKey }): JSX.Element {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState('');
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setBusy(false); setCopied(false); setManual(''); setFailed(false);
    return () => { request.current++; clearTimeout(timer.current); };
  }, [blob]);

  const share = async (): Promise<void> => {
    const id = ++request.current;
    clearTimeout(timer.current);
    setBusy(true); setCopied(false); setManual(''); setFailed(false);
    try {
      const code = await encodeReplayCode(blob);
      if (id !== request.current) return;
      const value = replayShareUrl(code) ?? code;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(value);
        if (id !== request.current) return;
        setCopied(true);
        timer.current = setTimeout(() => setCopied(false), 2500);
      } catch {
        if (id === request.current) setManual(value);
      }
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setBusy(false);
    }
  };

  return (
    <span className="replay-share">
      <button type="button" className="theater-btn" disabled={busy} onClick={() => { void share(); }}>
        {busy ? t('daily.theater.copying') : t(labelKey)}
      </button>
      <span className="replay-share-status" role="status">
        {manual ? t('daily.theater.manualCopy') : failed ? t('daily.theater.copyFailed') : copied ? t('daily.theater.copied') : ''}
      </span>
      {manual && <textarea rows={3} readOnly spellCheck={false} value={manual} aria-label={t('daily.theater.copyValue')}
        onFocus={e => e.currentTarget.select()} onClick={e => e.currentTarget.select()} />}
    </span>
  );
}
