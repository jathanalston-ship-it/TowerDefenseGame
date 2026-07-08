// One-tap replay share (docs/REPLAY-SHARE.md): encode a stored ReplayRecord JSON blob
// into a share code and put it on the clipboard — as a ?replay= link when it fits a
// URL, otherwise as the raw code. Used by the Daily screen and the daily Results.

import { useState } from 'react';
import { encodeReplayCode, replayShareUrl } from '../../net/replayShare';
import { t, useLocale } from '../../i18n';
import type { MsgKey } from '../../i18n';

export function ShareReplayButton({ blob, labelKey = 'daily.theater.share' }: { blob: string; labelKey?: MsgKey }): JSX.Element {
  useLocale();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="theater-btn"
      onClick={() => {
        void encodeReplayCode(blob).then((c) => {
          void navigator.clipboard?.writeText(replayShareUrl(c) ?? c).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
          });
        });
      }}
    >
      {copied ? t('daily.theater.copied') : t(labelKey)}
    </button>
  );
}
