// AUTO-CLAIM (docs/NOTIFICATIONS.md §auto-claim) — chores → decisions. After a run settles,
// every earned-but-unclaimed reward that involves NO choice is claimed in one pass and read back
// as ONE "Also earned" row on Results (ui/components/AutoClaimSummary.tsx) instead of a badge per
// screen and a toast per claim:
//   • Quest Board missions (weekly + the active story chapter),
//   • Season Pass levels (both tracks, exactly what claimAllPass would take),
//   • Metabolism milestones (every reached tier),
//   • Live-event track milestones (the token bank already crossed them — spending tokens in the
//     event SHOP stays a decision),
//   • Mastery Evolution Track nodes (towers + heroes).
// Each lane runs only once its screen has REVEALED (docs/PROGRESSION-GATING.md): progress banked
// earlier lands as one batch on the first settle after the reveal. Big moments keep a ceremony:
// quest FINALES (story cutscene + exclusive cosmetic) and Evolution "EVOLVE" stay manual, and any
// tier-3 (legendary-takeover) reward still toasts. Every claim goes through the normal guarded
// meta APIs — this module adds no economy, it only batches the presentation.

import { meta } from './meta';
import { rewardToast, tierOf } from './rewardToast';
import type { RewardEvent } from './rewardToast';
import { featureRevealed } from './unlocks';
import { autoClaimPref } from './prefs';
import { META_TRACKS, trackView } from './metabolism';
import { evolutionRosterSignal } from '../ui/evolutionTrackModel';
import { MAIN_QUESTLINE, weeklyQuestFor } from '../core/quests';
import { activeLiveEvents, eventTrack } from '../core/liveEvents';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import type { SaveData } from '../save/saveStore';

export interface AutoClaimReport {
  /** How many claims landed (missions + pass levels + milestone tracks + evolution units). */
  claims: number;
  /** Every reward the batch granted (captured — the one-row summary renders these). */
  events: RewardEvent[];
  /** The subset that still got its own toast (tier-3 big moments). */
  ceremonies: RewardEvent[];
}

/** Claimable quest MISSIONS right now (weekly window + active chapter) — finales excluded. */
function claimableMissions(s: SaveData): string[] {
  const q = s.quests;
  const weekly = weeklyQuestFor(q.weekly.window);
  const ids = weekly.missions
    .filter((m) => (q.weekly.progress[m.id] ?? 0) >= m.target && !q.weekly.claimed.includes(m.id))
    .map((m) => m.id);
  const chapter = MAIN_QUESTLINE.find((c) => !q.main.completions.includes(c.id));
  if (chapter) {
    for (const m of chapter.missions) {
      if ((q.main.progress[m.id] ?? 0) >= m.target && !q.main.claimed.includes(m.id)) ids.push(m.id);
    }
  }
  return ids;
}

/** Claim every no-choice reward on revealed systems. Returns null when the player turned
 *  auto-claim off (Settings) or nothing was waiting. */
export function autoClaimSettled(now = Date.now()): AutoClaimReport | null {
  if (!autoClaimPref()) return null;
  meta.pollWeeklyQuest(now);
  meta.pollBattlePass(now);
  let claims = 0;
  const events = rewardToast.capture(() => {
    const s = meta.get();
    if (featureRevealed(s, 'quests')) {
      for (const id of claimableMissions(s)) if (meta.claimQuestMission(id, now)) claims++;
    }
    if (featureRevealed(s, 'season')) {
      const before = meta.battlePass(now);
      const n = before.claimableFree.length + before.claimablePremium.length;
      if (n > 0 && meta.claimAllPass(now).length > 0) claims += n;
    }
    if (featureRevealed(s, 'metabolism')) {
      for (const def of META_TRACKS) {
        if (trackView(meta.get(), def).claimable > 0 && meta.claimMetabolism(def.id, now)) claims++;
      }
    }
    for (const a of activeLiveEvents(now)) {
      if (!a.def.currency) continue;
      for (const m of eventTrack(a.def)) {
        const le = meta.get().liveEvents;
        if ((le.tokens[a.key] ?? 0) >= m.at && !(le.claimed[a.key] ?? []).includes(m.at) && meta.claimEventMilestone(a.key, m.at, now)) claims++;
      }
    }
    for (const [subject, units, nav] of [['tower', TOWER_ORDER, 'towers'], ['hero', HERO_ORDER, 'heroes']] as const) {
      if (!featureRevealed(meta.get(), nav)) continue;
      for (const u of units) {
        if (evolutionRosterSignal(meta.get(), subject, u).claimable > 0 && meta.claimMasteryEvolution(subject, u) > 0) claims++;
      }
    }
  });
  if (claims === 0) return null;
  const ceremonies = events.filter((e) => tierOf(e) >= 3);
  for (const e of ceremonies) rewardToast.push(e); // big moments keep their placard
  return { claims, events, ceremonies };
}
