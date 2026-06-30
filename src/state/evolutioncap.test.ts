import { describe, it, expect } from 'vitest';
import { meta } from './meta';

// Campaign Evolution Cap end-to-end through the meta store: a tower cannot be evolved past the
// Campaign-unlocked cap even with unlimited Tower Shards (docs/EVOLUTION-CAP.md).
describe('buyStar — gated by the Campaign Evolution Cap', () => {
  it('blocks stars above the cap despite unlimited shards, and unblocks as Campaign advances', () => {
    meta.reset();
    meta.debugAddTowerShards(1_000_000); // fuel is never the constraint here

    // Fresh account: no Campaign cleared ⇒ cap ★2.
    expect(meta.evolutionCap()).toBe(2);
    expect(meta.buyStar('needle')).toBe(true); // ★1
    expect(meta.buyStar('needle')).toBe(true); // ★2
    expect(meta.buyStar('needle')).toBe(false); // ★3 blocked by Campaign, NOT shards
    expect(meta.get().towerStars.needle).toBe(2);

    // Clear Campaign stage 10 ⇒ cap ★3.
    meta.debugSetCampaignStage(10);
    expect(meta.evolutionCap()).toBe(3);
    expect(meta.buyStar('needle')).toBe(true); // ★3 now permitted
    expect(meta.buyStar('needle')).toBe(false); // ★4 still gated
    expect(meta.get().towerStars.needle).toBe(3);

    // Deep Campaign clear ⇒ cap ★10: the tower can be maxed.
    meta.debugSetCampaignStage(300);
    expect(meta.evolutionCap()).toBe(10);
    let guard = 0;
    while (meta.buyStar('needle') && guard++ < 20) { /* climb to the absolute cap */ }
    expect(meta.get().towerStars.needle).toBe(10);
    expect(meta.buyStar('needle')).toBe(false); // maxed
  });

  it('reads the highest stage across ANY difficulty track', () => {
    meta.reset();
    meta.debugSetCampaignStage(5, 'standard');
    meta.debugSetCampaignStage(55, 'brutal'); // a harder track is further along
    expect(meta.evolutionCap()).toBe(5); // stage 55 → ★5 cap (max across tracks)
  });
});
