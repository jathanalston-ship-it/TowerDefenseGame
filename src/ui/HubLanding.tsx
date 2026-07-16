// HUB LANDING PAGES (docs/NOTIFICATIONS.md §hubs) — one component renders EVERY hub's
// landing: identity header (glyph + promise + completion), a "needs attention" strip built
// from smart-notification REASONS ("3 Bio-Containers to open", never a bare dot), the
// recommendation panel (state/recommendations.ts — the loop's next step, never empty), the
// screen grid (self-describing cards from the unlock registry, teasers included), and the
// recently-unlocked shelf. Fully registry-driven: a new screen added to navModel lands here
// with its badge, reason, ring, and teaser for free — there is no per-hub layout to author.

import type { CSSProperties } from 'react';
import type { SaveData } from '../save/saveStore';
import { t } from '../i18n';
import { featureRevealed, featureView, type FeatureView } from '../state/unlocks';
import { recommendationsFor, type Recommendation } from '../state/recommendations';
import type { NavGroup, NavKey } from './navModel';

/** The recommendation strip — shared by hub landings, the mobile tab indexes, and the
 *  Command Center. Rows are concrete actions with the WHY beneath ("no dead ends"). */
export function RecommendStrip({ recs, go, compact }: { recs: Recommendation[]; go: (k: NavKey) => void; compact?: boolean }): JSX.Element | null {
  if (recs.length === 0) return null;
  return (
    <div className={`hubl-recs${compact ? ' is-compact' : ''}`}>
      {recs.map((r) => (
        <button key={r.id} type="button" className="hubl-rec" data-reckind={r.kind} onClick={() => go(r.nav)}>
          <span className="hubl-rec-k">{r.kind.toUpperCase()}</span>
          <span className="hubl-rec-body">
            <span className="hubl-rec-l">{r.label}</span>
            {!compact && <span className="hubl-rec-w">{r.why}</span>}
          </span>
          <span className="hubl-rec-go" aria-hidden>→</span>
        </button>
      ))}
    </div>
  );
}

/** NO DEAD ENDS (docs/NOTIFICATIONS.md §recommendations): claim-surface empty states mount
 *  this strip so "nothing left here" always answers "…so do THIS next". Excludes the screen
 *  it sits on; the engine's play backstop guarantees at least one row. */
export function NextUp({ save, exclude, go }: { save: SaveData; exclude: NavKey; go: (k: NavKey) => void }): JSX.Element | null {
  const recs = recommendationsFor(save, { limit: 3 }).filter((r) => r.nav !== exclude).slice(0, 2);
  if (recs.length === 0) return null;
  return (
    <div className="hubl-nextup">
      <span className="hubl-nextup-h">{t('hub.landing.recommended')}</span>
      <RecommendStrip recs={recs} go={go} compact />
    </div>
  );
}

/** Screens revealed within the last few runs — the "recently unlocked" shelf. */
export function recentlyUnlocked(save: SaveData, keys: readonly NavKey[], window = 5): NavKey[] {
  const floor = Math.max(0, save.totalRuns - window);
  return keys
    .filter((k) => {
      const at = save.director.revealed[k];
      return at !== undefined && at >= floor && at > 0; // veteran auto-latch at 0 is not "news"
    })
    .sort((a, b) => (save.director.revealed[b] ?? 0) - (save.director.revealed[a] ?? 0))
    .slice(0, 3);
}

export function HubLanding({
  group,
  save,
  badges,
  reasons,
  progress,
  teaserOf,
  go,
}: {
  group: NavGroup;
  save: SaveData;
  badges: Partial<Record<string, number>>;
  reasons: Record<string, string[]>;
  progress: Partial<Record<string, number>>;
  teaserOf: ReadonlyMap<string, FeatureView>;
  go: (k: NavKey) => void;
}): JSX.Element {
  const keys = group.items.map((i) => i.key);
  const rows = keys.filter((k) => featureRevealed(save, k) || teaserOf.has(k));
  // Hub completion = mean of the member rings that exist (some screens have no natural metric).
  const ringVals = keys.map((k) => progress[k]).filter((v): v is number => v !== undefined);
  const completion = ringVals.length > 0 ? ringVals.reduce((a, b) => a + b, 0) / ringVals.length : null;
  const attention = keys.flatMap((k) => (reasons[k] ?? []).map((line) => ({ k, line })));
  const recs = recommendationsFor(save, { navs: keys, limit: 3 });
  const fresh = recentlyUnlocked(save, keys);

  return (
    <div className="hubl" style={{ ['--hub-accent' as string]: group.accent } as CSSProperties}>
      <header className="hubl-head">
        <span className="hubl-glyph" aria-hidden>{group.hub.glyph}</span>
        <div className="hubl-id">
          <h1 className="hubl-title">{group.title}</h1>
          <p className="hubl-blurb">{group.hub.blurb}</p>
        </div>
        {completion !== null && (
          <div className="hubl-done" title={`${Math.round(completion * 100)}% ${t('hub.landing.complete')}`}>
            <b>{Math.round(completion * 100)}%</b> {t('hub.landing.complete')}
          </div>
        )}
      </header>

      {attention.length > 0 && (
        <section className="hubl-sec" aria-label={t('hub.landing.attention')}>
          <div className="hubl-sec-h">◉ {t('hub.landing.attention')}</div>
          <div className="hubl-att">
            {attention.map(({ k, line }) => (
              <button key={`${k}:${line}`} type="button" className="hubl-att-row" onClick={() => go(k)}>
                <span className="hubl-att-l">{line}</span>
                <span className="hubl-att-in" aria-hidden>{featureView(save, k).def.name} →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="hubl-sec" aria-label={t('hub.landing.recommended')}>
        <div className="hubl-sec-h">✦ {t('hub.landing.recommended')}</div>
        {attention.length === 0 && recs.every((r) => r.kind === 'play') && (
          <p className="hubl-quiet">{t('hub.landing.quiet')}</p>
        )}
        <RecommendStrip recs={recs} go={go} />
      </section>

      <section className="hubl-sec" aria-label={group.title}>
        <div className="hubl-grid">
          {rows.map((k) => {
            const view = featureView(save, k);
            const teaser = teaserOf.get(k);
            const badge = teaser ? 0 : badges[k] ?? 0;
            const why = (reasons[k] ?? []).join(' · ');
            const ring = teaser ? teaser.progress : progress[k];
            return (
              <button
                key={k}
                type="button"
                data-nav={k}
                className={`hubl-card${teaser ? ' is-locked' : ''}${badge > 0 ? ' has-news' : ''}`}
                onClick={() => go(k)}
                aria-label={teaser ? `${view.def.name} — locked. ${teaser.label}` : why ? `${view.def.name} — ${why}` : view.def.name}
              >
                <span className="hubl-card-glyph" aria-hidden>{view.def.glyph}</span>
                <span className="hubl-card-name">
                  {view.def.name}
                  {badge > 0 && <span className="nav-badge is-inline" aria-hidden>{badge > 9 ? '9+' : badge > 1 ? badge : ''}</span>}
                  {teaser && <span className="hubl-card-lock" aria-hidden>🔒</span>}
                </span>
                {/* The card's second line is the smart notification when there IS one — the
                    WHY beats the blurb whenever something actually waits inside. */}
                <span className={`hubl-card-sub${why ? ' is-why' : ''}`}>
                  {teaser ? `Sealed — ${teaser.label}` : why || view.def.blurb}
                </span>
                {ring != null && ring >= 0.005 && (
                  <span className="hubl-card-ring" aria-hidden>
                    <i style={{ width: `${Math.round(Math.min(1, ring) * 100)}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {fresh.length > 0 && (
        <section className="hubl-sec" aria-label={t('hub.landing.recent')}>
          <div className="hubl-sec-h">❋ {t('hub.landing.recent')}</div>
          <div className="hubl-fresh">
            {fresh.map((k) => (
              <button key={k} type="button" className="hubl-fresh-chip" onClick={() => go(k)}>
                <span aria-hidden>{featureView(save, k).def.glyph}</span> {featureView(save, k).def.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
