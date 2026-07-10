// LIVE OPERATIONS console (docs/LIVEOPS.md) — the hub's broadcast desk. What's live NOW
// (accent event cards with their exact reward boosts + an hour-resolution "ends in"
// countdown) and the UP NEXT forecast rail (the next windows from the schedule engine,
// soonest first). Pure display over core/liveops; a minute heartbeat keeps the countdowns
// honest without re-scanning the calendar (the forecast memoizes per UTC hour).

import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_ORDER, eventBoosts, liveWindows, liveopsNow, untilText, upcomingWindows } from '../../core/liveops';
import type { LiveEventCategory } from '../../core/liveops';
import { t, useLocale } from '../../i18n';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** The headline band label the console leads with — the biggest-weight live event's category. */
const CATEGORY_BAND: Record<LiveEventCategory, string> = {
  peak: 'PEAK EVENT', spotlight: 'THIS WEEK', hunt: 'RAID HUNT', surge: 'LIVE SURGE',
};

export function LiveEventsStrip(): JSX.Element | null {
  useLocale();
  // Minute heartbeat — countdown text is hour-resolution, so 60s ticks are plenty.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), MINUTE_MS);
    return () => window.clearInterval(id);
  }, []);
  const now = liveopsNow();
  // The forecast walks hour steps across the whole horizon — recompute once per UTC hour,
  // not per heartbeat (the countdown text below reads the memoized window edges live).
  const hourKey = Math.floor(now.getTime() / HOUR_MS);
  const { live, next } = useMemo(
    // Sort live events by category weight (peak → spotlight → hunt → surge) so the console
    // reads top-down by importance; the headline band names the heaviest live category.
    () => ({
      live: [...liveWindows(now)].sort((a, b) => CATEGORY_ORDER[a.def.category] - CATEGORY_ORDER[b.def.category]),
      next: upcomingWindows(now).slice(0, 3),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hourKey],
  );
  if (live.length === 0 && next.length === 0) return null;
  const band = live.length > 0 ? CATEGORY_BAND[live[0].def.category] : null;

  return (
    <div className="liveops panel" aria-label="Live operations">
      <div className="liveops-head">
        <span className="liveops-k">
          <i className="liveops-dot" aria-hidden /> {t('liveops.title')}
        </span>
        {band && <span className="liveops-band">{band}</span>}
        <span className="liveops-utc">{t('liveops.utc')}</span>
      </div>

      <div className="liveops-cards">
        {live.map(({ def: e, endsAt }) => (
          <div className="liveops-card" key={e.id} style={{ ['--lo' as string]: e.accent }} title={e.desc}>
            <span className="liveops-icon" aria-hidden>{e.icon}</span>
            <span className="liveops-body">
              <span className="liveops-name">{e.name}</span>
              <span className="liveops-boosts">
                {eventBoosts(e).slice(0, 2).map((b) => (
                  <em className="liveops-boost" key={b.label}>×{b.mult} {b.label}</em>
                ))}
              </span>
            </span>
            <span className="liveops-ends">{t('liveops.endsIn', { left: untilText(now, endsAt) })}</span>
          </div>
        ))}
      </div>

      {next.length > 0 && (
        <div className="liveops-rail">
          <span className="liveops-rail-k">{t('liveops.upNext')}</span>
          {next.map((w) => (
            <span className="liveops-soon" key={w.def.id} style={{ ['--lo' as string]: w.def.accent }} title={w.def.desc}>
              <i aria-hidden>{w.def.icon}</i> {w.def.name}
              <em>{t('liveops.startsIn', { left: untilText(now, w.startsAt) })}</em>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
