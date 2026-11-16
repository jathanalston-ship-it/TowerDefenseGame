// MISSION BRIEF (docs/CAMPAIGN.md §mission-card): actual wave 1 threats and any scheduled Mega Boss.
// Both read the generated stage and the campaign simulation's raid timing.

import { ENEMY_DEFS, spawnCount } from '../core/config';
import type { StageConfig } from '../core/campaign';
import { campaignMegaArrivalWave, campaignMegaFor, megaBossDef } from '../core/megaboss';
import type { EnemyKind } from '../core/types';

export interface WaveThreat {
  key: string;
  name: string;
  color: string;
  count: number; // the REAL number that spawns (spawnCount) — 1 for a boss
  flier: boolean; // flies over the lanes straight at the Nucleus — the classic opening killer
  boss: boolean; // a Mega / framework boss arriving with wave 1
}

const BOSS_COLOR = ENEMY_DEFS.tyrant.color;

/** Raid briefing. Its arrival uses the same timing as the campaign simulation. */
export function campaignMegaBrief(stage: StageConfig): { id: string; name: string; color: string; wave: number } | null {
  const enc = campaignMegaFor(stage.stage);
  const mega = enc ? megaBossDef(enc.defId) : undefined;
  return mega ? { id: mega.id, name: mega.name, color: mega.palette.glow, wave: campaignMegaArrivalWave(stage.waveCount) } : null;
}

/** Wave 1's threats, most dangerous first: bosses, then fliers, then the biggest groups. */
export function waveOneThreats(stage: StageConfig, max = 4): WaveThreat[] {
  const out: WaveThreat[] = [];
  const mega = campaignMegaBrief(stage);
  if (mega?.wave === 1) out.push({ key: `mega:${mega.id}`, name: mega.name, color: mega.color, count: 1, flier: false, boss: true });
  const bosses = [stage.miniBoss && stage.miniBossWave === 1 ? stage.miniBoss : null, stage.bossWaves?.[1] ?? null, stage.waveCount === 1 ? stage.boss : null];
  for (const b of bosses) if (b) out.push({ key: `boss:${b.id}`, name: b.name, color: BOSS_COLOR, count: 1, flier: false, boss: true });
  const counts = new Map<EnemyKind, number>();
  for (const g of stage.waves[0] ?? []) counts.set(g.kind, (counts.get(g.kind) ?? 0) + spawnCount(g.count));
  const rows: WaveThreat[] = [];
  for (const [kind, count] of counts) {
    const d = ENEMY_DEFS[kind];
    if (!d || count <= 0) continue;
    rows.push({ key: kind, name: d.name, color: d.color, count, flier: d.behavior.flying === true, boss: false });
  }
  rows.sort((a, b) => Number(b.flier) - Number(a.flier) || b.count - a.count || (a.key < b.key ? -1 : 1));
  return [...out, ...rows].slice(0, max);
}
