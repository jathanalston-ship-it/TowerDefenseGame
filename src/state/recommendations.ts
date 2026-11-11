// RECOMMENDATION ENGINE (docs/NOTIFICATIONS.md §recommendations) — "what should I do next?"
// answered as a ranked list of concrete actions, rendered by the hub landing pages and the
// Command Center. Foundational by construction: the candidates DERIVE from registries that
// already exist — every notification source with a reason() is automatically a candidate
// (its channel classifies the action) — only things the player can DO now, never a locked
// teaser (2026-11-11) — and a play action backstops the list so it is NEVER empty (no dead ends — the
// reward loop always has a next step). A future system that registers a notification gets
// recommended for free; bespoke candidates are one registerRecSource() call.
//
// Pure over SaveData (device-local watermarks ride along via notifications.reasons).

import { notifications } from './notifications';
import './notificationSources'; // the default sources are this engine's candidate pool — register them
import { isOpenNav } from './unlocks';
import { highestCampaignStage } from '../save/derive';
import { loopOfNav } from '../core/rewardLoops';
import type { LoopId } from '../core/rewardLoops';
import type { SaveData } from '../save/saveStore';
import type { NavKey } from '../ui/navModel';

export type RecKind = 'claim' | 'open' | 'spend' | 'upgrade' | 'play' | 'unlock' | 'browse';

export interface Recommendation {
  id: string;
  nav: NavKey; // where the action lives (the jump target)
  kind: RecKind;
  label: string; // the action, e.g. "3 quest rewards claimable"
  why: string; // one-line context under the label
  score: number; // rank weight — claims beat spends beat browsing
  loop: LoopId | null; // which reward loop the action belongs to (core/rewardLoops.ts)
}

/** How each notification CHANNEL classifies as an action. Score encodes the reward-loop
 *  order (PLAY → CLAIM → OPEN → SPEND → UPGRADE): claiming earned rewards always outranks
 *  spending, which outranks browsing news. A channel not listed here still surfaces (as
 *  'browse', modest score) — new systems are recommended without touching this file.
 *  Exported as the shared action vocabulary: the Ready Chain (state/readyChain.ts) reads
 *  the claim/open classes off this same table, so the two layers can never disagree. */
export const CHANNEL_CLASS: Partial<Record<string, { kind: RecKind; score: number; why: string }>> = {
  quests: { kind: 'claim', score: 90, why: 'Earned rewards are waiting on the Quest Board' },
  season: { kind: 'claim', score: 88, why: 'Season Pass levels are earned but unclaimed' },
  expeditions: { kind: 'claim', score: 86, why: 'Returned teams hold their spoils until you debrief' },
  metabolism: { kind: 'claim', score: 85, why: 'Lifetime milestones are reached but undigested' },
  harvest: { kind: 'claim', score: 84, why: 'The Hive kept producing while you were away' },
  vault: { kind: 'open', score: 80, why: 'Banked containers do nothing until cracked' },
  towers: { kind: 'upgrade', score: 60, why: 'Affordable upgrades are idle power' },
  heroes: { kind: 'upgrade', score: 58, why: 'A champion is ready to grow' },
  genes: { kind: 'upgrade', score: 56, why: 'Permanent card upgrades are affordable now' },
  adaptation: { kind: 'upgrade', score: 54, why: 'Unspent Antigen is idle power' },
  hive: { kind: 'spend', score: 50, why: 'An organ tier is within budget' },
  equipment: { kind: 'spend', score: 46, why: 'New gear is sitting unequipped' },
  market: { kind: 'spend', score: 40, why: 'Stock rotates on a timer — good lots expire' },
  // Live-event ledgers clear when the window rotates (docs/LIVE-EVENTS.md §3) — claims here
  // are the only time-limited claims in the game, so they rank with the season pass. The
  // 'home' channel IS the event console's address (the Command Center banner expands into it).
  home: { kind: 'claim', score: 87, why: 'Live-event rewards expire with the window' },
  // The QUICK FINISHER (docs/REWARD-FREQUENCY.md §wind-down): a free short-mode entry that
  // fills a session tail once claims/opens run dry — scored below every upgrade so it only
  // surfaces when the chain is spent, exactly the "what do I do now?" moment it answers.
  bossrush: { kind: 'play', score: 34, why: 'A free gauntlet entry expires at reset — a quick finisher' },
  store: { kind: 'browse', score: 20, why: "Today's rotation hasn't been seen" },
  collection: { kind: 'browse', score: 16, why: 'New codex entries to inspect' },
  profile: { kind: 'browse', score: 14, why: 'Fresh milestones on your record' },
};

/** Candidates are authored WITHOUT the loop tag — the engine derives it from the nav
 *  (core/rewardLoops.loopOfNav), so sources can never mis-classify themselves. */
export type RecDraft = Omit<Recommendation, 'loop'>;

export interface RecSource { id: string; recs(save: SaveData): RecDraft[] }

const extraSources: RecSource[] = [];

/** Register a bespoke recommendation source (idempotent by id). Most systems never need
 *  this — a notification source with a reason() is already recommended. */
export function registerRecSource(src: RecSource): void {
  if (extraSources.some((s) => s.id === src.id)) return;
  extraSources.push(src);
}

/** Ranked recommendations. `navs` filters to one hub's screens (landing pages);
 *  `limit` caps the list (default 3). `skip` drops candidates another surface on the same page
 *  already owns (ONE FACT, ONE OWNER — the Command Center's Ready Chain, a landing's cards); it
 *  applies before the cap and the play fallback, so the list stays full and never empty.
 *  `rotateFrom` is the LOOP ROTATION seam
 *  (docs/REWARD-ARCHITECTURE.md §chaining): actions in a DIFFERENT loop than the one just
 *  touched get a nudge and same-loop actions a damp, so sessions naturally flow
 *  claim → open → upgrade → collect → play instead of circling one wing. The nudge is
 *  smaller than a rank band — a waiting CLAIM still outranks a rotated browse.
 *  The list is never empty: a PLAY action backstops. */
export function recommendationsFor(
  save: SaveData,
  opts: { navs?: readonly NavKey[]; limit?: number; rotateFrom?: LoopId | null; skip?: (r: Recommendation) => boolean } = {},
): Recommendation[] {
  const out: RecDraft[] = [];

  // 1) Every unseen notification, classified by its channel (reasons are the labels).
  const reasons = notifications.reasons(save);
  for (const [channel, lines] of Object.entries(reasons)) {
    const cls = CHANNEL_CLASS[channel] ?? { kind: 'browse' as RecKind, score: 12, why: 'Something new landed here' };
    out.push({
      id: `notif:${channel}`,
      nav: channel as NavKey,
      kind: cls.kind,
      label: lines.join(' · '),
      why: cls.why,
      score: cls.score + Math.min(6, lines.length), // stacked reasons nudge upward, never dominate
    });
  }

  // 2) (Removed 2026-11-11, owner playtest: "notifications for things I can't unlock".) Almost-
  //    unlocked TEASERS no longer surface here — a recommendation is something you can DO now. The
  //    road to the next wing lives on the Command Center's objectives / Next-Goal spine instead.

  // 3) Bespoke registered sources.
  for (const src of extraSources) out.push(...src.recs(save));

  // 4) The play backstop — the loop's re-entry. Always present, lowest urgency.
  const stage = highestCampaignStage(save);
  out.push({
    id: 'play:next',
    nav: 'campaign',
    kind: 'play',
    label: stage > 0 ? `Push Campaign Stage ${stage + 1}` : 'Launch your first mission',
    why: 'Runs feed every other system — cores, XP, loot, quest progress',
    score: 10,
  });

  // Tag every candidate with its reward loop, then apply the rotation nudge: after the
  // player touches a loop, other loops' actions rise a step (+8) and same-loop actions
  // settle a step (−6). Both are inside one rank band, so urgency ordering (claim > open
  // > spend…) is never overturned — rotation breaks TIES toward flowing across loops.
  // A candidate whose destination is still SEALED never surfaces: a source can count before
  // its wing reveals (a free Boss Rush entry, quest rewards before the Quest Board) and the
  // action would dead-end on a lock — progression gating owns the reveal (the readyChain rule).
  const tagged: Recommendation[] = out.filter((r) => isOpenNav(save, r.nav)).map((r) => {
    const loop = loopOfNav(r.nav);
    const rot = opts.rotateFrom && loop ? (loop === opts.rotateFrom ? -6 : 8) : 0;
    return { ...r, loop, score: r.score + rot };
  }).filter((r) => !opts.skip?.(r));
  const scoped = opts.navs ? tagged.filter((r) => opts.navs!.includes(r.nav)) : tagged;
  const pool = scoped.length > 0 ? scoped : tagged.filter((r) => r.kind === 'play'); // a quiet hub still guides somewhere
  return pool.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 3);
}
