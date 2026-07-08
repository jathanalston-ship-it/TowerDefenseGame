// Replay share codec (docs/REPLAY-SHARE.md): the wire format must round-trip a REAL
// recorded run byte-perfectly (the decoded record re-simulates to the same outcome),
// shrink it (gzip), accept the raw fallback wire, and reject every malformed shape.

import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { SIM_DT } from '../core/config';
import { towerSlots } from '../core/map';
import { attachRecorder, replayRun } from '../core/replay';
import type { ReplayCtorArgs, ReplayRecord } from '../core/replay';
import type { MetaModifiers } from '../core/types';
import { decodeReplayCode, encodeReplayCode, replayShareUrl } from './replayShare';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** A short honest session through the recorded UI funnel (same recipe as core/replay.test.ts). */
function playRecorded(seed: number): { record: ReplayRecord; wave: number; kills: number } {
  const args: ReplayCtorArgs = [seed, NO_META];
  const game = new Game(...args);
  const rec = attachRecorder(game, args);
  let placed = 0;
  let guard = 0;
  while (game.waveIndex < 3 && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 40_000) {
    if (game.phase === 'draft') {
      game.chooseCard(game.getSnapshot().draft![0].id);
      continue;
    }
    if (game.phase === 'prep') {
      for (let i = 0; i < 2 && placed < towerSlots.length; i++) {
        game.selectTower('needle');
        const s = towerSlots[placed];
        game.click(s.x, s.y);
        placed++;
      }
      game.startWave();
    }
    for (let i = 0; i < 30; i++) game.advance(SIM_DT);
  }
  return { record: rec.finish({ wave: game.waveIndex, kills: game.kills }), wave: game.waveIndex, kills: game.kills };
}

const b64url = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');

describe('replay share codec', () => {
  it('gzip wire round-trips a real recording and still re-simulates to the claim', async () => {
    const { record, wave, kills } = playRecorded(4242);
    const json = JSON.stringify(record);
    const code = await encodeReplayCode(json);
    expect(code.startsWith('ARZ1.')).toBe(true);
    expect(code.length).toBeLessThan(json.length); // gzip earns its keep on step-indexed logs
    const decoded = await decodeReplayCode(code);
    expect(decoded).toEqual(record);
    const replayed = replayRun(decoded!, 1_200);
    expect(replayed.wave).toBe(wave);
    expect(replayed.kills).toBe(kills);
  });

  it('accepts the raw (uncompressed) fallback wire', async () => {
    const { record } = playRecorded(7);
    const json = JSON.stringify(record);
    const decoded = await decodeReplayCode(`ARR1.${b64url(json)}`);
    expect(decoded).toEqual(record);
  });

  it('tolerates surrounding whitespace (chat apps pad pastes)', async () => {
    const { record } = playRecorded(11);
    const code = await encodeReplayCode(JSON.stringify(record));
    expect(await decodeReplayCode(`  ${code}\n`)).toEqual(record);
  });

  it('rejects every malformed wire without throwing', async () => {
    expect(await decodeReplayCode('hello there')).toBeNull(); // no prefix
    expect(await decodeReplayCode('ARZ1.!!!not-base64!!!')).toBeNull(); // bad b64
    expect(await decodeReplayCode(`ARZ1.${b64url('not gzip bytes')}`)).toBeNull(); // bad gzip
    expect(await decodeReplayCode(`ARR1.${b64url('not json')}`)).toBeNull(); // bad json
    expect(await decodeReplayCode(`ARR1.${b64url('{"a":1}')}`)).toBeNull(); // wrong shape
    expect(await decodeReplayCode(`ARR1.${b64url('{"v":2,"args":[],"log":[],"end":1,"claim":{"wave":1}}')}`)).toBeNull(); // wrong version
  });

  it('rejects oversized payloads (the verifier size gate applies to shares too)', async () => {
    const huge = JSON.stringify({ v: 1, args: [1, {}], log: [], end: 1, claim: { wave: 1, kills: 0 }, pad: 'x'.repeat(300_000) });
    expect(await decodeReplayCode(`ARR1.${b64url(huge)}`)).toBeNull();
  });

  it('replayShareUrl is null outside a browser (codes still share as text)', () => {
    expect(replayShareUrl('ARZ1.abc')).toBeNull();
  });
});
