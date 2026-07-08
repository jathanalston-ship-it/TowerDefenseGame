// LiveOps events strip (docs/LIVEOPS.md) — the hub's heartbeat line: what's live NOW
// and the next weekend surge. Pure display over core/liveops; renders nothing only if
// the calendar somehow goes empty (a spotlight is always live by construction).

import { activeEvents, daysToWeekend, liveopsNow } from '../../core/liveops';
import { t, useLocale } from '../../i18n';

export function LiveEventsStrip(): JSX.Element | null {
  useLocale();
  const now = liveopsNow();
  const live = activeEvents(now);
  if (live.length === 0) return null;
  const toWeekend = daysToWeekend(now);
  return (
    <div className="liveops panel" aria-label="Live events">
      <div className="liveops-head">
        <span className="liveops-k">{t('liveops.title')}</span>
        {toWeekend > 0 && <span className="liveops-next">{t('liveops.weekendIn', { days: toWeekend })}</span>}
      </div>
      <div className="liveops-row">
        {live.map((e) => (
          <span className="liveops-chip" key={e.id} style={{ ['--lo' as string]: e.accent }} title={e.desc}>
            <i aria-hidden>{e.icon}</i> {e.name}
          </span>
        ))}
      </div>
    </div>
  );
}
