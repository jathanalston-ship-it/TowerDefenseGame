import { describe, it, expect } from 'vitest';
import { meta } from './meta';

describe('abandonRun — forfeit all rewards', () => {
  it("rolls back this run's live-banked loot and banks nothing", () => {
    meta.reset();
    expect(meta.pendingContainers().length).toBe(0);
    const shardsBefore = meta.get().shards;
    const runsBefore = meta.get().totalRuns;

    // Simulate a run banking loot LIVE (syncRunLoot completes containers as it progresses).
    meta.syncRunLoot(30, 1000);
    expect(meta.pendingContainers().length).toBeGreaterThan(0);

    meta.abandonRun();
    expect(meta.pendingContainers().length).toBe(0); // this run's containers forfeited
    expect(meta.get().shards).toBe(shardsBefore); // no run-end rewards banked
    expect(meta.get().totalRuns).toBe(runsBefore); // the run was never settled
  });

  it('leaves containers banked from PRIOR runs untouched', () => {
    meta.reset();
    meta.debugAddLootPoints(800); // a prior run's containers, already in the Vault
    const prior = meta.pendingContainers().length;
    expect(prior).toBeGreaterThan(0);

    meta.syncRunLoot(20, 600); // a new live run banks more
    expect(meta.pendingContainers().length).toBeGreaterThan(prior);

    meta.abandonRun();
    expect(meta.pendingContainers().length).toBe(prior); // only the abandoned run's loot is removed
  });
});
