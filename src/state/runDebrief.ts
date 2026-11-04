// RUN DEBRIEF (docs/REWARD-PRESENTATION.md §debrief) — the read-model behind the Results screen's
// "what happened" lines: the run's HIGHEST THREAT (named by what actually fell, not by the render
// proxy a framework boss borrows) and, on a defeat, how close the run came, what got through, and
// ONE concrete next step. Pure over the run's RunStats (+ the caller's Power numbers and a
// "may I point there?" predicate) — no meta import, no DOM; the sim ledgers it reads are
// observation-only (core/game.ts getRunStats).

import { DEBRIEF, ENEMY_DEFS, READINESS } from '../core/config';
import type { EnemyDef } from '../core/config';
import { megaBossDef } from '../core/megaboss';
import type { EnemyKind, RunStats } from '../core/types';

export interface ThreatLine {
  key: string; // the hiveDamageBy key (EnemyKind | boss:<name> | mega:<name>)
  name: string;
  color: string;
  boss: boolean;
  dmg: number; // Nucleus integrity this source took
  share: number; // 0..1 of the run's total Nucleus damage
}

export interface DefeatDebrief {
  wave: number; // the wave the Nucleus fell on
  totalWaves: number; // 0 = open-ended mode (Infinite / Boss Rush)
  bosses: { name: string; hpPct: number }[]; // bosses still standing — "it had 23% left"
  threats: ThreatLine[]; // what got through, most damage first (≤ 3)
  tip: string; // ONE concrete suggestion
  tipNav?: string; // where to act on it (only ever an OPEN destination)
  /** §board: towers standing at the end vs a typical WINNING board on the same open slots. */
  board?: { towers: number; typical: number; slots: number };
  /** §anti-air: the wave fliers first came on, and how many seconds until the first one was downed
   *  (null = never) — only when fliers came. */
  antiAir?: { wave: number; downedAfter: number | null };
}

const BOSS_COLOR = ENEMY_DEFS.tyrant.color;

/** The run's toughest kill. Megas outrank framework bosses outrank the roster; the 'tyrant' kind
 *  is ALSO the framework-boss render proxy, so its count is reduced by the bosses it stood in for
 *  (bossKills − megaKills) — a stage boss is never misnamed "Brood Tyrant". */
export function highestThreat(stats: RunStats): { name: string; color: string } | null {
  const megas = stats.megaKills ?? [];
  for (let i = megas.length - 1; i >= 0; i--) {
    const def = megaBossDef(megas[i].defId);
    if (def) return { name: def.name, color: def.palette.glow };
  }
  const bosses = stats.bossesSlain ?? [];
  if (bosses.length > 0) return { name: bosses[bosses.length - 1], color: BOSS_COLOR };
  const proxied = Math.max(0, (stats.bossKills ?? 0) - megas.length);
  let best: EnemyDef | null = null;
  for (const [k, n] of Object.entries(stats.killsByEnemy) as [EnemyKind, number][]) {
    const real = k === 'tyrant' ? n - proxied : n;
    const d = ENEMY_DEFS[k];
    if (real > 0 && d && (!best || d.hp > best.hp)) best = d;
  }
  return best ? { name: best.name, color: best.color } : null;
}

/** Name + color for a hiveDamageBy key. */
function threatOf(key: string): { name: string; color: string; boss: boolean } {
  if (key.startsWith('boss:')) return { name: key.slice(5), color: BOSS_COLOR, boss: true };
  if (key.startsWith('mega:')) return { name: key.slice(5), color: BOSS_COLOR, boss: true };
  const d = ENEMY_DEFS[key as EnemyKind];
  return d ? { name: d.name, color: d.color, boss: false } : { name: 'Artillery', color: 'var(--danger)', boss: false };
}

/** Role-trait advice, first match wins — DATA keyed by the enemy's own traits (a new enemy
 *  inherits the right tip with no table edit). */
const TRAIT_TIPS: { when: (d: EnemyDef) => boolean; tip: (name: string) => string }[] = [
  { when: (d) => !!d.behavior.flying, tip: (n) => `${n} fly over the lanes — keep a long-range strain covering the Hive itself.` },
  { when: (d) => !!d.siege, tip: (n) => `${n} shell the Hive from range — build further forward so they die before they set up.` },
  { when: (d) => !!d.explodeDamage, tip: (n) => `${n} burst on contact — catch them early with long-range or splash strains.` },
  { when: (d) => (d.shieldHp ?? 0) > 0 || d.armor >= 6, tip: (n) => `${n} shrug off chip damage — field heavier hitters, or stack Fracture to break the armor.` },
  { when: (d) => !!d.summon, tip: (n) => `${n} keep refilling the wave — focus them before the brood they birth.` },
  { when: (d) => d.speed >= 80, tip: (n) => `${n} outrun thin coverage — place towers earlier on the lane, not at the Hive.` },
];

const POWER_NAVS: { nav: string; label: string }[] = [
  { nav: 'towers', label: 'the Tower Lab' },
  { nav: 'evolution', label: 'Evolution HQ' },
  { nav: 'heroes', label: 'the Hero Hall' },
];

/** The defeat read-model — null on a win. `power`/`rec` are the account Power and the attempted
 *  stage's recommendation (rec 0 = no recommendation for this mode); `canOpen` is the caller's
 *  gate check (unlocks.isOpenNav) so the tip never sends the player at a sealed wing. */
export function defeatDebrief(
  run: { won: boolean; wave: number; stats: RunStats },
  opts: { power: number; rec: number; canOpen: (nav: string) => boolean },
): DefeatDebrief | null {
  if (run.won) return null;
  const s = run.stats;
  const by = s.hiveDamageBy ?? {};
  const total = Object.values(by).reduce((a, n) => a + n, 0);
  const threats: ThreatLine[] = Object.entries(by)
    .filter(([, dmg]) => dmg > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, dmg]) => ({ key, ...threatOf(key), dmg, share: total > 0 ? dmg / total : 0 }));
  const bosses = (s.bossHpAtDefeat ?? []).map((b) => ({ name: b.name, hpPct: Math.max(1, Math.round(b.hpFrac * 100)) }));

  // ONE suggestion, most actionable first: a genuine Power gap → the open wing that closes it;
  // a boss that broke through → the boss-wave plan; otherwise the top leaker's counter-play.
  let tip = 'Spread your strains so every lane is covered before the Hive — and spend biomass every build phase.';
  let tipNav: string | undefined;
  const top = threats[0];
  const powerGap = opts.rec > 0 && opts.power < opts.rec * READINESS.warnBelow;
  // §board — G1: 90 % of losses fell in waves 1–3 on 1–4 towers while winners filled every slot.
  const board = s.boardAtEnd !== undefined && s.slotsAtEnd !== undefined && s.slotsAtEnd > 0
    ? { towers: s.boardAtEnd, slots: s.slotsAtEnd, typical: Math.max(1, Math.round(s.slotsAtEnd * DEBRIEF.winBoardFill)) }
    : undefined;
  const thin = board !== undefined && board.towers < board.typical * DEBRIEF.thinBoardFrac;
  const spend = POWER_NAVS.find((p) => opts.canOpen(p.nav));
  if (powerGap && spend) {
    tip = `You fought ${Math.round(opts.rec - opts.power).toLocaleString()} Power under the recommendation — grow it in ${spend.label}, then try again.`;
    tipNav = spend.nav;
  } else if (powerGap) {
    tip = `You fought ${Math.round(opts.rec - opts.power).toLocaleString()} Power under the recommendation — replay a cleared stage to bank samples and Mastery, then try again.`;
  } else if (thin && board) {
    tip = `Your board was thin — ${board.towers} ${board.towers === 1 ? 'tower' : 'towers'} where winning runs field ~${board.typical}. Deploy every build phase: fill the open slots before wave 3.`;
  } else if (bosses.length > 0 || top?.boss) {
    tip = 'The boss broke through — hold your hero ability and a biomass reserve for the final wave, and lean on single-target damage.';
  } else if (top) {
    const def = ENEMY_DEFS[top.key as EnemyKind];
    const rule = def ? TRAIT_TIPS.find((t) => t.when(def)) : undefined;
    tip = rule ? rule.tip(`${top.name}s`) : `Most of the damage came from ${top.name}s — cover their approach earlier so they never reach the Hive.`;
  }
  const antiAir = s.firstFlierSec !== undefined
    ? { wave: s.firstFlierWave ?? 1, downedAfter: s.firstAirKillSec !== undefined ? Math.max(0, Math.round(s.firstAirKillSec - s.firstFlierSec)) : null }
    : undefined;
  return {
    wave: run.wave, totalWaves: s.totalWaves ?? 0, bosses, threats, tip, ...(tipNav ? { tipNav } : {}),
    ...(board ? { board } : {}), ...(antiAir ? { antiAir } : {}),
  };
}
