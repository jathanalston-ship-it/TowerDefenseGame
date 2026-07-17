// PORTRAIT SHELL (docs/RESPONSIVE-DESIGN.md §mobile-shell) — the phone-first hub chrome.
// Replaces the icon drawer with three self-describing pieces:
//   MobileTabBar   — fixed bottom bar, five thumb tabs (Home / Battle / Evolve / Armory / More)
//   MobileTabIndex — a tab's index page: one labelled row per screen (glyph + name + blurb from
//                    the unlock registry) with live badges, teaser locks, and progress rings
//   MobilePageHead — sticky back header on every drilled-in screen
// The rows derive from navModel.mobileTabs() + the unlock registry, so new screens are
// automatically indexed with a first-timer explanation — nothing here is per-screen.

import type { CSSProperties } from 'react';
import type { SaveData } from '../save/saveStore';
import { featureRevealed, featureView, type FeatureView } from '../state/unlocks';
import { recommendationsFor } from '../state/recommendations';
import { readyChain } from '../state/readyChain';
import { audio } from '../audio/sound';
import { mobileTabs, type MobileTab, type MobileTabKey, type NavKey } from './navModel';
import { RecommendStrip } from './HubLanding';

/** Per-tab accents echo the desktop rail's group accents (same intent groups). */
const TAB_ACCENT: Record<MobileTabKey, string> = {
  home: 'var(--vital)',
  battle: 'var(--vital)',
  rewards: 'var(--gold)',
  evolve: 'var(--kinetic)',
  more: 'var(--muted)',
};

export function MobileTabBar({
  active,
  badges,
  teaserKeys,
  readyKeys,
  onTab,
}: {
  active: MobileTabKey;
  badges: Partial<Record<string, number>>;
  teaserKeys: ReadonlySet<string>;
  /** Screens hosting a LIVE Ready-Chain stop (docs/HUB-FLOW.md §surfaces) — the tab breathes. */
  readyKeys?: ReadonlySet<string>;
  onTab: (k: MobileTabKey) => void;
}): JSX.Element {
  return (
    <nav className="mtab-bar" aria-label="Main sections">
      {mobileTabs().map((tab) => {
        // A tab's badge = the sum of its screens' unseen counts (teasers never count).
        const n = tab.navs.reduce((s, k) => s + (teaserKeys.has(k) ? 0 : badges[k] ?? 0), 0);
        const ready = tab.navs.some((k) => !teaserKeys.has(k) && (readyKeys?.has(k) ?? false));
        return (
          <button
            key={tab.key}
            data-mtab={tab.key}
            className={`mtab${active === tab.key ? ' on' : ''}${ready ? ' is-ready' : ''}`}
            style={{ ['--nav-accent' as string]: TAB_ACCENT[tab.key] } as CSSProperties}
            onClick={() => onTab(tab.key)}
            aria-current={active === tab.key ? 'page' : undefined}
            aria-label={n > 0 ? `${tab.label} — ${n} new` : tab.label}
          >
            <span className="mtab-glyph" aria-hidden>
              {tab.glyph}
              {n > 0 && <span className="nav-badge" aria-hidden>{n > 9 ? '9+' : n > 1 ? n : ''}</span>}
            </span>
            <span className="mtab-l">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function MobileTabIndex({
  tab,
  save,
  badges,
  reasons,
  progress,
  teaserOf,
  go,
}: {
  tab: MobileTab;
  save: SaveData;
  badges: Partial<Record<string, number>>;
  reasons: Record<string, string[]>;
  progress: Partial<Record<string, number>>;
  teaserOf: ReadonlyMap<string, FeatureView>;
  go: (k: NavKey) => void;
}): JSX.Element {
  // Same gating as the desktop rail: revealed screens + the next-reveal teasers, nothing deeper.
  const rows = tab.navs.filter((k) => featureRevealed(save, k) || teaserOf.has(k));
  // LIVE readiness (docs/HUB-FLOW.md §surfaces): a seen-but-unclaimed stop keeps its line
  // and pulse here, exactly like the desktop landing — earned value never goes dark.
  const chainOf = new Map(readyChain(save).map((node) => [node.nav as string, node.label] as const));
  // The tab index doubles as the hub's landing on phones: recommendations scoped to this
  // tab's screens lead (compact rows — the WHY rides the screen rows themselves below).
  const recs = recommendationsFor(save, { navs: tab.navs, limit: 2 })
    .filter((r) => r.kind !== 'play' || tab.navs.includes('campaign'));
  return (
    <div className="mnav-index" data-mindex={tab.key}>
      <div className="mnav-index-h">
        <span className="mnav-index-glyph" aria-hidden>{tab.glyph}</span>
        {tab.label}
      </div>
      <RecommendStrip recs={recs} go={go} compact />
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
            data-nav={k}
            className={`mnav-row${teaser ? ' is-locked' : ''}${ready ? ' is-ready' : ''}`}
            onClick={() => go(k)}
            aria-label={teaser ? `${view.def.name} — locked. ${teaser.label}` : why ? `${view.def.name} — ${why}` : view.def.name}
          >
            <span className="mnav-glyph" aria-hidden>{view.def.glyph}</span>
            <span className="mnav-body">
              <span className="mnav-name">
                {view.def.name}
                {badge > 0 && <span className="nav-badge is-inline" aria-hidden>{badge > 9 ? '9+' : badge > 1 ? badge : ''}</span>}
              </span>
              {/* The subline is a ladder: a locked row teaches its REQUIREMENT, a row with
                  news states the smart-notification WHY, a quiet row keeps its blurb. */}
              <span className={`mnav-blurb${!teaser && why ? ' is-why' : ''}`}>
                {teaser ? `Sealed — ${teaser.label}` : why || view.def.blurb}
              </span>
            </span>
            <span className="mnav-end" aria-hidden>
              {teaser ? <span className="mnav-lock">🔒</span> : ring != null && ring >= 0.005 ? <span className="mnav-pct">{Math.round(ring * 100)}%</span> : null}
              <span className="mnav-chev">›</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MobilePageHead({
  title,
  backLabel,
  onBack,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
}): JSX.Element {
  return (
    <div className="mpage-head">
      <button
        className="mpage-back"
        onClick={() => { audio.cue('ui'); onBack(); }}
        aria-label={`Back to ${backLabel}`}
      >
        <span aria-hidden>‹</span> {backLabel}
      </button>
      <span className="mpage-title">{title}</span>
    </div>
  );
}
