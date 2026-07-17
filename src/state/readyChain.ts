// READY CHAIN (docs/HUB-FLOW.md §model) — the hub's live harvest queue: every claim/open
// action that exists RIGHT NOW, in urgency order, INDEPENDENT of the seen-watermarks that
// gate badges/reasons. A player who opened the Quest Board and left without claiming keeps
// their quest stop on the chain — the hub never forgets earned-but-unclaimed value.
//
// Derivation, not state: chain nodes come from notifications.live() (the sources' pure
// count(save) truth) classified by the SAME CHANNEL_CLASS vocabulary the recommendation
// engine uses — a future claim surface joins the chain by registering a notification
// source, exactly like it joins badges and recommendations today. Spends/browsing are
// deliberately excluded: the chain is "collect what you've earned", never "go shopping"
// (the Recommended-Now strip keeps covering those). Presentation-pure — nothing saved,
// nothing simulated.

import { notifications } from './notifications';
import './notificationSources'; // the default sources are the chain's candidate pool
import { CHANNEL_CLASS } from './recommendations';
import { loopOfNav } from '../core/rewardLoops';
import type { LoopId } from '../core/rewardLoops';
import type { SaveData } from '../save/saveStore';
import type { NavKey } from '../ui/navModel';

export interface ChainNode {
  nav: NavKey; // the stop's screen (channels use the NavKey vocabulary)
  kind: 'claim' | 'open';
  label: string; // the live reason lines, e.g. "3 quest rewards claimable"
  why: string; // the class's one-line context
  score: number; // urgency (same bands as recommendations)
  loop: LoopId | null;
}

/** The live chain, ripest first. Empty ⇒ the hub is genuinely quiet (silence is meaningful —
 *  nothing should pulse). */
export function readyChain(save: SaveData): ChainNode[] {
  const live = notifications.live(save);
  const out: ChainNode[] = [];
  for (const [channel, e] of Object.entries(live)) {
    const cls = CHANNEL_CLASS[channel];
    if (!cls || (cls.kind !== 'claim' && cls.kind !== 'open')) continue;
    out.push({
      nav: channel as NavKey,
      kind: cls.kind,
      label: e.lines.join(' · '),
      why: cls.why,
      score: cls.score + Math.min(6, e.count),
      loop: loopOfNav(channel),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The next stop, excluding the surface being stood on (claim screens hand FORWARD). */
export function nextChainStop(save: SaveData, exclude?: string): ChainNode | null {
  return readyChain(save).find((n) => n.nav !== exclude) ?? null;
}

/** The set of screens hosting a chain stop — the doors/landing pulse source. */
export function chainNavs(save: SaveData): ReadonlySet<string> {
  return new Set(readyChain(save).map((n) => n.nav));
}
