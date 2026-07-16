// Online foundation (docs/ONLINE-FOUNDATION.md) — the protocol/authority contracts:
//   • the codec round-trips every message kind, rejects foreign/hostile payloads WITHOUT
//     throwing, and version-gates;
//   • commands are INTENTS: applyArenaCommand can never mint resources — an unaffordable
//     place is rejected by the sim itself (the anti-cheat-by-construction property);
//   • the state digest is stable for identical sims and flips on gameplay divergence;
//   • connection quality bands are sane; the authority table covers the launch event classes;
//   • loadout fingerprints are order-independent and collision-sensible.

import { describe, expect, it } from 'vitest';
import {
  PROGRESSION_AUTHORITY, applyArenaCommand, arenaStateDigest, connectionQuality,
  decodeArenaMessage, encodeArenaMessage, loadoutFingerprint, NETCODE,
} from './online';
import type { ArenaMessage } from './online';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('the codec', () => {
  it('round-trips every message kind', () => {
    const messages: ArenaMessage[] = [
      { t: 'hello', proto: 1, playerId: 'p1', name: 'Vess', tag: '#0421', power: 1200, rating: 800, season: 2, heroKind: 'ravager' },
      { t: 'loadout', fingerprint: 123, towerKinds: ['needle'], heroKinds: ['ravager'] },
      { t: 'ready', matchId: 'm_12345678', seed: 42 },
      { t: 'cmd', tick: 60, seq: 0, cmd: { k: 'startWave' } },
      { t: 'state', tick: 120, digest: 999, integrityFrac: 0.8, wave: 3, heroDown: false },
      { t: 'ping', at: 1000 },
      { t: 'pong', at: 1000 },
      { t: 'resyncReq' },
      { t: 'resync', seed: 42, matchId: 'm_12345678', cmds: [{ tick: 1, seq: 0, cmd: { k: 'startWave' } }], tick: 300 },
      { t: 'finish', integrityFrac: 0.5, wave: 9, damageDealt: 12345, fellAtSec: null },
      { t: 'forfeit' },
      { t: 'bye' },
    ];
    for (const m of messages) {
      const back = decodeArenaMessage(encodeArenaMessage(m));
      expect(back).not.toBeNull();
      expect(back!.t).toBe(m.t);
    }
  });

  it('rejects junk, foreign kinds and wrong versions — without throwing', () => {
    expect(decodeArenaMessage('not json')).toBeNull();
    expect(decodeArenaMessage('{"v":1,"t":"stealAllIchor"}')).toBeNull();
    expect(decodeArenaMessage('{"v":999,"t":"ping","at":1}')).toBeNull();
    expect(decodeArenaMessage('{"t":"ping","at":1}')).toBeNull(); // versionless
    expect(decodeArenaMessage('null')).toBeNull();
  });
});

describe('commands are intents (anti-cheat by construction)', () => {
  it('an unaffordable place is rejected by the sim — no resources minted', () => {
    const game = new Game(1, NO_META);
    game.biomass = 0;
    const before = game.biomass;
    const ok = applyArenaCommand(game, { k: 'place', tower: 'needle', x: 100, y: 800 });
    expect(ok).toBe(false);
    expect(game.towers.length).toBe(0);
    expect(game.biomass).toBe(before);
  });

  it('a legal place lands and pays the sim price', () => {
    const game = new Game(1, NO_META);
    const before = game.biomass;
    const ok = applyArenaCommand(game, { k: 'place', tower: 'needle', x: 360, y: 820 });
    expect(ok).toBe(true);
    expect(game.towers.length).toBe(1);
    expect(game.biomass).toBe(before - TOWER_DEFS.needle.cost);
  });

  it('phase-gated commands (startWave/chooseCard) refuse out of phase', () => {
    const game = new Game(1, NO_META);
    applyArenaCommand(game, { k: 'startWave' });
    expect(game.phase).toBe('wave');
    expect(applyArenaCommand(game, { k: 'startWave' })).toBe(false); // already in a wave
    expect(applyArenaCommand(game, { k: 'chooseCard', cardId: 'anything' })).toBe(false); // no draft open
  });
});

describe('the state digest', () => {
  it('agrees for identically-driven sims and flips on divergence', () => {
    const drive = (place: boolean): number => {
      const g = new Game(777, NO_META);
      if (place) applyArenaCommand(g, { k: 'place', tower: 'needle', x: 360, y: 820 });
      applyArenaCommand(g, { k: 'startWave' });
      for (let i = 0; i < 600; i++) g.advance(SIM_DT);
      return arenaStateDigest(g);
    };
    expect(drive(true)).toBe(drive(true)); // determinism
    expect(drive(true)).not.toBe(drive(false)); // divergence trips it
  });
});

describe('quality bands + authority table', () => {
  it('connection quality classifies sanely', () => {
    expect(connectionQuality(40, 0)).toBe('excellent');
    expect(connectionQuality(150, 0)).toBe('good');
    expect(connectionQuality(300, 0)).toBe('poor');
    expect(connectionQuality(500, 0)).toBe('bad');
    expect(connectionQuality(40, 2)).toBe('bad'); // silence beats latency
  });

  it('the authority table covers the launch event classes with valid rules', () => {
    for (const key of ['arena.match', 'arena.passClaim', 'arena.exclusive', 'trade.list', 'trade.bid', 'trade.settle', 'purchase.checkout', 'leaderboard.submit', 'cloud.sync']) {
      expect(PROGRESSION_AUTHORITY[key] === 'server' || PROGRESSION_AUTHORITY[key] === 'shared-validated').toBe(true);
    }
    // trading is server-ONLY (no offline path — docs/TRADING-PREP.md §authority)
    expect(PROGRESSION_AUTHORITY['trade.settle']).toBe('server');
  });

  it('netcode constants stay inside sane envelopes (a config typo cannot ship)', () => {
    expect(NETCODE.bufferTicks).toBeGreaterThan(0);
    expect(NETCODE.reconnectWindowSec).toBeGreaterThan(NETCODE.heartbeatSec * NETCODE.dropAfterMissed);
  });
});

describe('loadout fingerprints', () => {
  it('are order-independent and change with content', () => {
    const a = loadoutFingerprint(['needle', 'mortar'], ['ravager'], 1000);
    const b = loadoutFingerprint(['mortar', 'needle'], ['ravager'], 1000);
    const c = loadoutFingerprint(['mortar', 'needle', 'reactor'], ['ravager'], 1000);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(loadoutFingerprint(['needle'], ['ravager'], 1000)).not.toBe(loadoutFingerprint(['needle'], ['ravager'], 2000));
  });
});
