// Power gain events (docs/POWER-SCORE.md §feel + POWER-AUDIT.md meta tripwire): every strength
// API announces "amount + source"; a declared strength source that fails to raise Power records
// a validator warning. This pins BOTH behaviors end-to-end through the real meta APIs.

import { describe, it, expect, beforeEach } from 'vitest';
import { meta } from './meta';
import { onPowerGain, announcePower, powerAnnounceWarnings } from './powerEvents';
import type { PowerGain } from './powerEvents';
import { TOWER_ORDER, META_UPGRADES } from '../core/config';

describe('powerEvents — the announce bus', () => {
  beforeEach(() => {
    meta.reset();
    powerAnnounceWarnings.length = 0;
  });

  it('a Genome upgrade announces its gain WITH the source label', () => {
    const gains: PowerGain[] = [];
    const off = onPowerGain((g) => gains.push(g));
    meta.debugAddShards(10_000);
    expect(meta.buyUpgrade(META_UPGRADES[0].id)).toBe(true);
    off();
    expect(gains).toHaveLength(1);
    expect(gains[0].delta).toBeGreaterThan(0);
    expect(gains[0].source).toContain('Genome Upgrade');
    expect(powerAnnounceWarnings).toEqual([]);
  });

  it('a Tower Evolution announces with the tower name and star', () => {
    const gains: PowerGain[] = [];
    const off = onPowerGain((g) => gains.push(g));
    meta.debugAddTowerShards(10_000);
    expect(meta.buyStar(TOWER_ORDER[0])).toBe(true);
    off();
    expect(gains).toHaveLength(1);
    expect(gains[0].source).toContain('Evolution ◈1');
  });

  it('the meta tripwire records a strength source that fails to move Power', () => {
    announcePower('Broken Future Upgrade', 1000, 1000); // expectGain defaults true
    expect(powerAnnounceWarnings).toHaveLength(1);
    expect(powerAnnounceWarnings[0]).toContain('Broken Future Upgrade');
    // …and a legitimately optional source (unequip/sidegrade) stays silent.
    announcePower('Unequipped item', 1000, 990, false);
    expect(powerAnnounceWarnings).toHaveLength(1);
  });
});
