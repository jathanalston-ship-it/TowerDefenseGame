// Mission card WAVE 1 (state/missionBrief.ts — Batch G): what the first wave actually sends, from the
// same generated plan the Game spawns — Mega first on Mega stages, fliers flagged, integer counts.
import { describe, expect, it } from 'vitest';
import { generateStage } from '../core/campaign';
import { ENEMY_DEFS, spawnCount } from '../core/config';
import { campaignMegaFor, megaBossDef } from '../core/megaboss';
import type { EnemyKind } from '../core/types';
import { waveOneThreats } from './missionBrief';

describe('mission card — wave 1 threats', () => {
  it('lists the real wave-1 composition (integer counts, no unknown kinds)', () => {
    const cfg = generateStage(14, 'standard');
    const w1 = waveOneThreats(cfg, 99);
    const total = cfg.waves[0].reduce((n, g) => n + spawnCount(g.count), 0);
    expect(w1.filter((t) => !t.boss).reduce((n, t) => n + t.count, 0)).toBe(total);
    for (const t of w1) expect(Number.isInteger(t.count)).toBe(true);
  });

  it('a Mega stage leads with the Mega that arrives WITH wave 1; fliers come before ground packs', () => {
    const stage = [10, 20, 30, 40].find((s) => campaignMegaFor(s) !== null)!;
    const w1 = waveOneThreats(generateStage(stage, 'standard'), 99);
    expect(w1[0].boss).toBe(true);
    expect(w1[0].name).toBe(megaBossDef(campaignMegaFor(stage)!.defId)!.name);
    const rest = w1.filter((t) => !t.boss);
    const firstGround = rest.findIndex((t) => !t.flier);
    if (firstGround >= 0) for (const t of rest.slice(firstGround)) expect(t.flier).toBe(false);
    for (const t of rest) expect(t.flier).toBe(ENEMY_DEFS[t.key as EnemyKind].behavior.flying === true);
  });

  it('caps the row for the card', () => {
    expect(waveOneThreats(generateStage(60, 'standard')).length).toBeLessThanOrEqual(4);
  });
});
