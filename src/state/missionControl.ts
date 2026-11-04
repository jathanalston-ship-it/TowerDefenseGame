// MISSION CONTROL (docs/MISSION-CONTROL.md — Foundation #1 of the UX consolidation pass): the
// Command Center's centerpiece read-model. One derivation answers, for the account's CURRENT
// state, the questions a player should never have to ask: what should I do (PRIMARY), what
// else is worth doing (SECONDARY), and where is this all going (LONG-TERM) — each row with
// progress, a reward preview, a jump shortcut, and (where real) an exact Power gain.
//
// COALESCING CONTRACT: this model does not invent new intelligence — it UNIFIES the engines
// that already exist so one fact has one value: the campaign frontier (homeModel.homeFrontier
// math re-derived here save-pure), the anticipation spine (state/nextGoal), the Power Advisor
// (state/powerAdvisor — Foundation #5), the vault, and the unlock learning curve
// (state/unlocks FEATURES). PURE over SaveData; consumers memoize per revision.

import type { SaveData } from '../save/saveStore';
import { CAMPAIGN_REWARDS, campaignSurveyBonus } from '../core/config';
import { recommendedPowerScore } from '../core/campaign';
import { composePower } from '../core/power';
import { accountPowerParts } from './meta';
import { nextGoals } from './nextGoal';
import { advisorPlan } from './powerAdvisor';
import type { AdvisorPlan } from './powerAdvisor';
import { FEATURES, evalCondition, featureRevealed, isOpenNav } from './unlocks';
import { difficultyPref } from './prefs';

export interface MissionObjective {
  id: string;
  tier: 'primary' | 'secondary' | 'longterm';
  title: string; // what to do ("Descend: Stage 7")
  why: string; // why it matters, one line
  progress: number; // 0..1
  remaining: string; // human distance ("+620 Power" / "18 Apex Genome" / "Ready now")
  reward: string; // preview ("+64 ◆ first clear" / "Bio-Containers")
  powerGain?: number; // present when the objective IS an exact Power move
  nav: string; // hub nav key — the jump shortcut
  glyph?: string; // sigil for long-term unlock rows
}

export interface MissionControlModel {
  primary: MissionObjective;
  secondary: MissionObjective[];
  longterm: MissionObjective[];
  /** The advisor plan the primary leaned on — surfaced so the panel can expand it in place. */
  plan: AdvisorPlan;
}

/** The single most important thing: the campaign frontier — deploy when ready, otherwise the
 *  exact Power path to readiness (the Advisor's plan is the "how"). */
function primaryObjective(save: SaveData, power: number, plan: AdvisorPlan): MissionObjective {
  const diff = difficultyPref('campaign');
  const cleared = save.campaign.cleared[diff] ?? 0;
  const stage = cleared + 1;
  const rec = recommendedPowerScore(stage, diff);
  const ready = power >= rec;
  const isMilestone = stage % CAMPAIGN_REWARDS.milestoneEvery === 0;
  const core = Math.round(CAMPAIGN_REWARDS.firstClearCore + CAMPAIGN_REWARDS.firstClearCorePerStage * stage + campaignSurveyBonus(stage));
  return {
    id: `descend:${diff}:${stage}`,
    tier: 'primary',
    title: `Descend: Stage ${stage}`,
    why: isMilestone ? 'A milestone stage — clearing it raises the Evolution Cap.' : 'Depth is the master key — stages unlock every deeper system.',
    progress: rec > 0 ? Math.min(1, power / rec) : 1,
    remaining: ready
      ? 'Ready now'
      : plan.totalGain >= rec - power
        ? `+${rec - power} Power — the Advisor plan covers it`
        : `+${rec - power} Power to the recommendation`,
    reward: `+${core} ◆ first clear${isMilestone ? ' · Evolution Cap' : ''}`,
    powerGain: ready ? undefined : Math.min(plan.totalGain, Math.max(0, rec - power)) || undefined,
    nav: 'campaign',
  };
}

/** LONG-TERM: the next unrevealed wings on the learning curve — where the game is going. */
function longtermObjectives(save: SaveData, limit: number): MissionObjective[] {
  return FEATURES
    .filter((f) => f.kind === 'screen' && !featureRevealed(save, f.id))
    .sort((a, b) => a.order - b.order)
    .slice(0, limit)
    .map((f) => {
      const c = evalCondition(f.condition, save);
      return {
        id: `unlock:${f.id}`,
        tier: 'longterm' as const,
        title: f.name,
        why: f.blurb,
        progress: c.progress,
        remaining: c.label || 'Almost there',
        reward: 'New wing of the hive',
        nav: 'home', // locked wings aren't navigable — the roadmap/teaser row owns the detail
        glyph: f.glyph,
      };
    });
}

export function missionControl(save: SaveData): MissionControlModel {
  const power = composePower(accountPowerParts(save)).score;
  const plan = advisorPlan(save, 5);

  const secondary: MissionObjective[] = [];
  // The anticipation spine — closest-to-done account goals, verbatim (one fact, one value).
  for (const g of nextGoals(save, 3)) {
    secondary.push({
      id: g.id, tier: 'secondary', title: g.label, why: g.reward,
      progress: g.progress, remaining: `${g.remaining} · ${g.eta}`, reward: g.reward, nav: g.nav, // §eta: the honest run ETA rides along
    });
  }
  // Banked value waiting on a click: the vault, and the Advisor's best instant move.
  if (save.pendingContainers.length > 0) {
    secondary.push({
      id: 'vault:pending', tier: 'secondary', title: 'Crack your Bio-Containers',
      why: 'Banked rewards do nothing sealed.', progress: 1,
      remaining: `${save.pendingContainers.length} ready`, reward: 'Gear · shards · materials', nav: 'vault',
    });
  }
  const top = plan.moves.find((m) => isOpenNav(save, m.nav)); // never a move in a sealed wing
  if (top) {
    secondary.push({
      id: 'advisor:top', tier: 'secondary', title: top.label, why: `Fastest Power in ${top.system}.`,
      progress: 1, remaining: top.price, reward: `+${top.powerDelta} Power`,
      powerGain: top.powerDelta, nav: top.nav,
    });
  }

  return {
    primary: primaryObjective(save, power, plan),
    secondary: secondary.slice(0, 4),
    longterm: longtermObjectives(save, 3),
    plan,
  };
}
