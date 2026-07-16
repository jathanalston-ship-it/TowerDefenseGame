// Arena match orchestration (docs/ARENA.md §ruleset) — the live-PvP simulation battery:
//   • a FULL AI-vs-AI match runs headlessly to a terminal result with a bounds-valid claim;
//   • the rollback primitive: replayRemoteFromLog rebuilds the opponent's battlefield
//     BYTE-EXACTLY (state digest equality) from (bundle, seed, command log);
//   • the arena ruleset holds: no Mega Bosses, real-speed lock;
//   • boot-bundle anti-cheat rejects forged strength before a single tick simulates;
//   • forfeit lanes and the PvP timer's tiebreak ladder resolve correctly.

import { describe, expect, it } from 'vitest';
import { ArenaMatch, bootBundleProblem } from './arenaMatch';
import type { ArenaBootBundle, ArenaMatchSetup } from './arenaMatch';
import { generateAiOpponent, AiController } from './arenaAi';
import { arenaClaimProblem, ARENA } from './arena';
import { arenaStateDigest } from './online';
import { Game } from './game';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

const freshBundle = (): ArenaBootBundle => ({
  meta: { ...NO_META },
  heroKind: 'ravager',
  opts: { mode: 'endless' },
});

function aiSetup(seed: number, over: Partial<ArenaMatchSetup> = {}): ArenaMatchSetup {
  const ai = generateAiOpponent(seed, 900, 2);
  return {
    matchId: `m_test_${seed}`,
    seed,
    season: 1,
    local: freshBundle(),
    remote: ai.boot,
    vsAi: true,
    ai,
    localPower: 900,
    oppPower: ai.power,
    oppRating: ai.rating,
    ...over,
  };
}

describe('a full AI-vs-AI match (the headless live-PvP simulation)', () => {
  it('runs to a terminal result with a bounds-valid claim; both fields genuinely played', () => {
    const setup = aiSetup(1101);
    const match = new ArenaMatch(setup);
    // The local side is ALSO an AI player here (a second brain via the public command lane) —
    // the exact shape a human occupies.
    const localAi = generateAiOpponent(2202, 900, 2);
    const localCtl = new AiController(localAi.controllerSeed, localAi.personality);
    let guard = 0;
    while (!match.finished && guard++ < 4000) {
      for (const cmd of localCtl.step(match.localGame, 0.1)) match.issueLocal(cmd);
      match.step(0.1);
    }
    expect(match.finished).not.toBeNull();
    const f = match.finished!;
    expect(['win', 'loss', 'draw']).toContain(f.outcome);
    expect(arenaClaimProblem(f.claim)).toBeNull(); // the claim the server would accept
    expect(f.claim.vsAi).toBe(true);
    // both battlefields actually fought: waves launched, towers grown, commands logged
    expect(match.localGame.waveIndex).toBeGreaterThanOrEqual(1);
    expect(match.remoteGame.waveIndex).toBeGreaterThanOrEqual(1);
    expect(match.localGame.towers.length).toBeGreaterThanOrEqual(1);
    expect(match.remoteGame.towers.length).toBeGreaterThanOrEqual(1);
    expect(match.localLog.length).toBeGreaterThanOrEqual(3);
    expect(match.remoteLog.length).toBeGreaterThanOrEqual(3);
    expect(f.claim.durationSec).toBeLessThanOrEqual(ARENA.matchSec + 60);
  }, 30_000);

  it('the same setup replays to the identical result (the lockstep determinism contract)', () => {
    const play = (): string => {
      const match = new ArenaMatch(aiSetup(3303));
      const localAi = generateAiOpponent(4404, 900, 2);
      const ctl = new AiController(localAi.controllerSeed, localAi.personality);
      let guard = 0;
      while (!match.finished && guard++ < 1200) {
        for (const cmd of ctl.step(match.localGame, 0.1)) match.issueLocal(cmd);
        match.step(0.1);
      }
      const digest = `${arenaStateDigest(match.localGame)}|${arenaStateDigest(match.remoteGame)}`;
      return match.finished ? `${match.finished.outcome}|${digest}|${match.localLog.length}|${match.remoteLog.length}` : `unfinished|${digest}`;
    };
    const a = play();
    expect(play()).toBe(a);
  }, 60_000);
});

describe('rollback / reconnect (command-log replay)', () => {
  it('replayRemoteFromLog rebuilds the opponent battlefield byte-exactly', () => {
    const match = new ArenaMatch(aiSetup(5505));
    let guard = 0;
    while (match.elapsed < 45 && !match.finished && guard++ < 600) match.step(0.1);
    const before = arenaStateDigest(match.remoteGame);
    const towersBefore = match.remoteGame.towers.length;
    const tickBefore = match.remoteGame.stepCount;
    match.replayRemoteFromLog(tickBefore);
    expect(match.remoteGame.stepCount).toBe(tickBefore);
    expect(arenaStateDigest(match.remoteGame)).toBe(before);
    expect(match.remoteGame.towers.length).toBe(towersBefore);
  }, 30_000);
});

describe('the arena ruleset', () => {
  it('suppresses Mega Bosses (noMega) while a normal run still spawns them', () => {
    const arenaGame = new Game(42, NO_META, undefined, 'ravager', undefined, { mode: 'endless', noMega: true });
    const normalGame = new Game(42, NO_META, undefined, 'ravager', undefined, { mode: 'endless' });
    const enc = { defId: 'voraxis', tier: 1 } as Parameters<Game['spawnMegaBoss']>[0];
    arenaGame.spawnMegaBoss(enc, 'infinite');
    normalGame.spawnMegaBoss(enc, 'infinite');
    expect(arenaGame.getSnapshot().megaBanner).toBeNull();
    expect(normalGame.getSnapshot().megaBanner).not.toBeNull();
  });

  it('locks both fields to real speed (no fast-forward in PvP)', () => {
    const match = new ArenaMatch(aiSetup(6606));
    expect(match.localGame.timeScale).toBe(1);
    expect(match.remoteGame.timeScale).toBe(1);
  });
});

describe('boot-bundle anti-cheat', () => {
  it('accepts honest bundles and rejects each forged axis', () => {
    expect(bootBundleProblem(freshBundle())).toBeNull();
    expect(bootBundleProblem({ ...freshBundle(), meta: { ...NO_META, towerDamageMult: 999 } })).toBe('meta-mult');
    expect(bootBundleProblem({ ...freshBundle(), meta: { ...NO_META, integrityBonus: 99_999 } })).toBe('integrity');
    expect(bootBundleProblem({ ...freshBundle(), meta: { ...NO_META, bonusSlots: 99 } })).toBe('slots');
    expect(bootBundleProblem({ ...freshBundle(), heroKind: 'zeus' as never })).toBe('hero');
    expect(bootBundleProblem({ ...freshBundle(), opts: { unlocked: ['deathstar' as never] } })).toBe('roster');
    expect(bootBundleProblem({ ...freshBundle(), opts: { startingGenes: ['a', 'b', 'c', 'd', 'e', 'f'] } })).toBe('genes');
    expect(
      bootBundleProblem({ ...freshBundle(), towerProgress: { needle: { damageMult: 5000, fireRateMult: 1 } } as never }),
    ).toBe('tower-progress');
  });
});

describe('forfeits + the PvP timer', () => {
  it('a local forfeit resolves as a loss; a remote forfeit as a win', () => {
    const a = new ArenaMatch(aiSetup(7707));
    a.forfeitLocal();
    expect(a.finished!.outcome).toBe('loss');
    const b = new ArenaMatch(aiSetup(7708));
    b.forfeitRemote();
    expect(b.finished!.outcome).toBe('win');
  });

  it('the timer resolves two idle standing fields on the tiebreak ladder (draw)', () => {
    // vsAi:false with no driver on either side — two genuinely idle fields.
    const match = new ArenaMatch({ ...aiSetup(8808), vsAi: false, ai: undefined, remote: freshBundle() });
    match.step(ARENA.matchSec + 1); // sims barely move (advance clamps); the CLOCK expires
    expect(match.finished).not.toBeNull();
    expect(match.finished!.outcome).toBe('draw');
  });
});
