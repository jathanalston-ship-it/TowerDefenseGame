// HUB LANDING PAGES (docs/NOTIFICATIONS.md §hubs) — one component renders EVERY hub's
// landing: identity header (glyph + promise + completion), the screen grid FIRST
// (self-describing cards from the unlock registry, teasers included — each card OWNS its
// screen's smart-notification REASON, "3 Bio-Containers to open", and its live Ready-Chain
// line), then the recommendation panel (state/recommendations.ts — only what no card already
// says, so one fact has one owner; never empty), and the recently-unlocked shelf. Fully
// registry-driven: a new screen added to navModel lands here with its badge, reason, ring,
// and teaser for free — there is no per-hub layout to author.

import type { CSSProperties } from 'react';
import type { SaveData } from '../save/saveStore';
import { t } from '../i18n';
import { featureRevealed, featureView, type FeatureView } from '../state/unlocks';
import { recommendationsFor, type Recommendation } from '../state/recommendations';
import { ACTIONS } from './iconLanguage';
import { readyChain } from '../state/readyChain';
import { loopOfNav } from '../core/rewardLoops';
import type { NavGroup, NavKey } from './navModel';

/** The recommendation strip — shared by hub landings, the mobile tab indexes, and the
 *  Command Center. Rows are concrete actions with the WHY beneath ("no dead ends"). */
export function RecommendStrip({ recs, go, compact }: { recs: Recommendation[]; go: (k: NavKey) => void; compact?: boolean }): JSX.Element | null {
  if (recs.length === 0) return null;
  return (
    <div className={`hubl-recs${compact ? ' is-compact' : ''}`}>
      {recs.map((r) => (
        <button key={r.id} type="button" className="hubl-rec" data-reckind={r.kind} onClick={() => go(r.nav)}>
          <span className="hubl-rec-k">{ACTIONS[r.kind].glyph} {r.kind.toUpperCase()}</span>
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
 *  this strip so "nothing left here" always answers "…so do THIS next". CHAIN-AWARE
 *  (docs/HUB-FLOW.md §surfaces): while the Ready Chain has stops elsewhere, the handoff is
 *  the next stop with the remaining count — claims ride node → node instead of re-deriving
 *  the loop after every screen. An empty chain falls back to the rotated recommendations
 *  (whose play backstop guarantees the final handoff is a deploy). */
export function NextUp({ save, exclude, go }: { save: SaveData; exclude: NavKey; go: (k: NavKey) => void }): JSX.Element | null {
  const chain = readyChain(save).filter((n) => n.nav !== exclude);
  if (chain.length > 0) {
    const next = chain[0];
    const rec: Recommendation = {
      id: `chain:${next.nav}`,
      nav: next.nav,
      kind: next.kind,
      label: `Next stop: ${featureView(save, next.nav).def.name} — ${next.label}`,
      why: chain.length > 1 ? `${chain.length - 1} more on the chain after this` : 'Last stop — then back to the field',
      score: next.score,
      loop: next.loop,
    };
    return (
      <div className="hubl-nextup is-chain">
        <span className="hubl-nextup-h">◈ Ready chain — {chain.length} stop{chain.length === 1 ? '' : 's'} left</span>
        <RecommendStrip recs={[rec]} go={go} compact />
      </div>
    );
  }
  // Loop rotation (docs/REWARD-ARCHITECTURE.md §chaining): hand the session to a DIFFERENT
  // loop than the surface it's standing on — claim → open → upgrade → play, never a circle.
  const recs = recommendationsFor(save, { limit: 3, rotateFrom: loopOfNav(exclude) }).filter((r) => r.nav !== exclude).slice(0, 2);
  if (recs.length === 0) return null;
  return (
    <div className="hubl-nextup">
      <span className="hubl-nextup-h">{t('hub.landing.recommended')}</span>
      <RecommendStrip recs={recs} go={go} compact />
    </div>
  );
}

/** The hub's only OPEN screen, if it has exactly one — its door opens it directly (a one-card
 *  landing is a pointless hop; the Store's headerless rule, generalized). HOME never counts:
 *  it has its own door. */
export function soleOpenScreen(save: SaveData, group: NavGroup): NavKey | null {
  const open = group.items.filter((i) => i.key !== 'home' && featureRevealed(save, i.key));
  return open.length === 1 ? open[0].key : null;
}

/** A hub door's badge = how many member screens hold a DECISION (docs/NOTIFICATIONS.md
 *  §decisions) — never the sum of their item counts, which read "9+" forever. */
export function doorBadge(keys: readonly string[], badges: Partial<Record<string, number>>, teasers: ReadonlyMap<string, unknown>): number {
  return keys.filter((k) => !teasers.has(k) && (badges[k] ?? 0) > 0).length;
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
  const fresh = recentlyUnlocked(save, keys);
  // LIVE readiness per member screen (docs/HUB-FLOW.md §surfaces): a seen-but-unclaimed
  // stop keeps pulsing here and keeps its live line on the card, even after its unseen
  // badge/reason cleared — the landing never hides earned value.
  const chainOf = new Map(readyChain(save).map((n) => [n.nav as string, n.label] as const));
  // ONE FACT, ONE OWNER: a member card already shows its reason line and its live chain line,
  // so the strip below only recommends what no card says (the play backstop, an almost-unlocked
  // pull) — the old "needs attention" rows + reason-derived recs repeated the cards verbatim.
  const carded = (r: Recommendation): boolean => keys.includes(r.nav) && (r.id.startsWith('notif:') || chainOf.has(r.nav));
  const recs = recommendationsFor(save, { navs: keys, limit: 3, skip: carded });
  const waiting = keys.some((k) => (reasons[k]?.length ?? 0) > 0 || chainOf.has(k));

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

      <section className="hubl-sec" aria-label={group.title}>
        <div className="hubl-grid">
          {rows.map((k) => {
            const view = featureView(save, k);
            const teaser = teaserOf.get(k);
            const badge = teaser ? 0 : badges[k] ?? 0;
            const ready = teaser ? undefined : chainOf.get(k);
            const why = (reasons[k] ?? []).join(' · ') || ready || '';
            const ring = teaser ? teaser.progress : progress[k];
            return (
              <button
                key={k}
                type="button"
                data-nav={k}
                className={`hubl-card${teaser ? ' is-locked' : ''}${badge > 0 ? ' has-news' : ''}${ready ? ' is-ready' : ''}`}
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
                    WHY (or the LIVE chain line) beats the blurb whenever something waits inside. */}
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

      <section className="hubl-sec" aria-label={t('hub.landing.recommended')}>
        <div className="hubl-sec-h">✦ {t('hub.landing.recommended')}</div>
        {/* "All quiet" must agree with the cards above — a hub with a reason or a
            seen-but-unclaimed stop still glowing never claims to be quiet
            (docs/HUB-FLOW.md §surfaces: the landing never hides earned value). */}
        {!waiting && recs.every((r) => r.kind === 'play') && <p className="hubl-quiet">{t('hub.landing.quiet')}</p>}
        <RecommendStrip recs={recs} go={go} />
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
