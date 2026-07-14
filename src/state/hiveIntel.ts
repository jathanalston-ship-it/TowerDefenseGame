// HIVE INTELLIGENCE FEED (docs/HIVE-INTEL.md — Foundation #2 of the UX consolidation pass):
// the notification layer, re-founded. Instead of an event log competing for attention, the
// feed is DERIVED from the save each revision — every entry is TRUE right now, answers all
// four questions (what happened · why it matters · what to do · how much stronger), and
// retires itself the moment the player acts (act ⇒ the save changes ⇒ the derivation drops
// it). No new save state, no staleness, no meaningless rows by construction.
//
// COALESCING CONTRACT: the feed unifies the guidance sources that previously competed —
// the Power Advisor's best move, banked claimables (vault, daily cache), unlock proximity
// (the learning curve's next gate), and the account timeline's recent milestones (the old
// command-feed widget, absorbed as the low-priority tail). The transient RewardToaster
// remains the CEREMONY layer; this feed is the STANDING intel layer.

import type { SaveData } from '../save/saveStore';
import { advisorPlan } from './powerAdvisor';
import { FEATURES, evalCondition, featureRevealed } from './unlocks';
import { agoLabel } from '../ui/homeModel';

export type IntelPriority = 'act' | 'soon' | 'note'; // act now · worth planning · ambient

export interface IntelEntry {
  id: string;
  icon: string;
  priority: IntelPriority;
  what: string; // what happened / what is true
  why: string; // why it matters, one line
  action: string; // the verb — what to do about it
  nav: string; // hub nav key — the one-tap shortcut
  powerGain?: number; // exact gain when the entry IS a power move
  ago?: string; // recency label (timeline tail only)
}

/** The standing intelligence feed, highest priority first, capped. Pure over the save. */
export function hiveIntel(save: SaveData, now: number, limit = 6): IntelEntry[] {
  const out: IntelEntry[] = [];

  // ── ACT — banked value and exact gains waiting on a click ──────────────────────────────
  if (save.pendingContainers.length > 0) {
    out.push({
      id: 'intel:vault', icon: '◈', priority: 'act',
      what: `${save.pendingContainers.length} Bio-Container${save.pendingContainers.length === 1 ? '' : 's'} sealed in the Vault`,
      why: 'Banked rewards do nothing sealed — gear, shards and materials are inside.',
      action: 'Crack them open', nav: 'vault',
    });
  }
  const plan = advisorPlan(save, 1);
  const top = plan.moves[0];
  if (top) {
    out.push({
      id: 'intel:advisor', icon: '⚡', priority: 'act',
      what: `${top.label} is ready (${top.price})`,
      why: `The fastest Power available right now — ${top.system}.`,
      action: 'Take the upgrade', nav: top.nav, powerGain: top.powerDelta,
    });
  }

  // ── SOON — the learning curve's next gate, with honest distance ─────────────────────────
  const nextFeature = FEATURES
    .filter((f) => f.kind === 'screen' && !featureRevealed(save, f.id))
    .sort((a, b) => a.order - b.order)[0];
  if (nextFeature) {
    const c = evalCondition(nextFeature.condition, save);
    if (c.progress > 0.25) { // only when it is genuinely CLOSE — never noise about far horizons
      out.push({
        id: `intel:unlock:${nextFeature.id}`, icon: nextFeature.glyph, priority: 'soon',
        what: `${nextFeature.name} is close — ${Math.round(c.progress * 100)}%`,
        why: nextFeature.blurb,
        action: c.label || 'Keep pushing', nav: 'campaign',
      });
    }
  }

  // ── NOTE — the account's recent milestones (the absorbed command-feed tail) ─────────────
  for (const e of [...(save.timeline ?? [])].sort((a, b) => b.at - a.at).slice(0, 3)) {
    out.push({
      id: `intel:tl:${e.at}`, icon: e.icon, priority: 'note',
      what: e.label, why: 'A milestone on the account record.',
      action: 'Review', nav: 'profile', ago: agoLabel(e.at, now),
    });
  }

  const rank: Record<IntelPriority, number> = { act: 0, soon: 1, note: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, limit);
}
