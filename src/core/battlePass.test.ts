// Battle Pass core (docs/BATTLEPASS.md): window/rotation math, the XP curve, the derived
// reward tables (no empty levels; every wardrobe battlepass item lands EXACTLY at its slot;
// passives/phenotypes placed; the crown levels), and the economy laws (premium never
// self-funding; the store SKU parity with the Ichor door).

import { describe, expect, it } from 'vitest';
import {
  BP, levelBuyPrice, levelOf, msToPassEnd, passWindow, PASS_PASSIVES, rewardLabel, rewardShort,
  seasonForWindow, SEASONS, seasonTracks, trackIchorTotal, xpForLevel, xpToReach,
} from './battlePass';
import { seasonItems } from './wardrobe';
import { offerValueIchor, SEASON_PASS_OFFER } from './premium';

describe('windows & rotation', () => {
  it('14-day windows from the epoch; the ring wraps forever', () => {
    const t0 = BP.epochMs + 5;
    expect(passWindow(t0)).toBe(0);
    expect(passWindow(t0 + BP.rotationMs)).toBe(1);
    expect(seasonForWindow(0).id).toBe('s1');
    expect(seasonForWindow(1).id).toBe('s2');
    expect(seasonForWindow(2).id).toBe('s1'); // unlimited future windows
    const ms = msToPassEnd(t0);
    expect(passWindow(t0 + ms)).toBe(1);
  });
});

describe('the XP curve', () => {
  it('is shallow-ramped, totals ~61.7k, and levelOf inverts it', () => {
    expect(xpForLevel(1)).toBe(320);
    expect(xpForLevel(100)).toBe(320 + 6 * 99);
    expect(xpToReach(BP.levels)).toBe(61_700);
    expect(levelOf(0)).toEqual({ level: 0, into: 0, need: 320 });
    expect(levelOf(319).level).toBe(0);
    expect(levelOf(320).level).toBe(1);
    expect(levelOf(xpToReach(100)).level).toBe(100);
    // Buying levels ramps and never gets cheap.
    expect(levelBuyPrice(0)).toBe(15);
    expect(levelBuyPrice(99)).toBe(15 + 9 * 2);
  });
});

describe('the reward tables', () => {
  it('EVERY level on BOTH tracks of BOTH seasons pays something', () => {
    for (const s of SEASONS) {
      const tracks = seasonTracks(s.id);
      for (let l = 1; l <= BP.levels; l++) {
        expect(tracks.free[l - 1].length, `${s.id} free L${l} empty`).toBeGreaterThan(0);
        expect(tracks.premium[l - 1].length, `${s.id} premium L${l} empty`).toBeGreaterThan(0);
        for (const r of [...tracks.free[l - 1], ...tracks.premium[l - 1]]) {
          expect(rewardLabel(r).label.length).toBeGreaterThan(0);
          // The track TILES name their cargo (no icon-guessing): every reward carries a
          // compact non-empty short label too, small enough to live inside an 84px cell.
          expect(rewardShort(r).length).toBeGreaterThan(0);
          expect(rewardShort(r).length).toBeLessThanOrEqual(26);
        }
      }
    }
  });

  it('every wardrobe battlepass item lands EXACTLY once, at its authored slot', () => {
    for (const s of SEASONS) {
      const tracks = seasonTracks(s.id);
      for (const item of seasonItems(s.id)) {
        const src = item.source;
        if (src.kind !== 'battlepass') continue;
        let hits = 0;
        for (let l = 1; l <= BP.levels; l++) {
          for (const track of ['free', 'premium'] as const) {
            for (const r of tracks[track][l - 1]) {
              if (r.kind === 'cosmetic' && r.id === item.id) {
                hits++;
                expect(l, `${item.id} at wrong level`).toBe(src.level);
                expect(track, `${item.id} on wrong track`).toBe(src.track);
              }
            }
          }
        }
        expect(hits, `${item.id} placed ${hits}×`).toBe(1);
      }
    }
  });

  it('passives sit at their SeasonDef levels — 5 free + 10 premium per season, each once', () => {
    for (const s of SEASONS) {
      const tracks = seasonTracks(s.id);
      const freePassives = tracks.free.flatMap((rs) => rs.filter((r) => r.kind === 'passive'));
      const premiumPassives = tracks.premium.flatMap((rs) => rs.filter((r) => r.kind === 'passive'));
      expect(freePassives).toHaveLength(5);
      expect(premiumPassives).toHaveLength(10);
      const ids = [...freePassives, ...premiumPassives].map((r) => r.kind === 'passive' ? r.id : '');
      expect(new Set(ids).size).toBe(15); // no dupes
    }
    // Premium permanents are ECONOMY-ONLY (the no-pay-to-win line, by type).
    for (const p of PASS_PASSIVES.filter((x) => x.id.includes('_p_'))) {
      expect(p.effect, `${p.id} premium passive carries a combat effect`).toBeUndefined();
      expect(p.econ).toBeDefined();
    }
  });

  it('level 100 is the crown: the flagship cosmetic + the infinite stack', () => {
    for (const s of SEASONS) {
      const tracks = seasonTracks(s.id);
      expect(tracks.free[99].some((r) => r.kind === 'stack')).toBe(true);
      expect(tracks.premium[99].some((r) => r.kind === 'cosmetic')).toBe(true);
      // The premium taste levels are pinned generous.
      for (const l of BP.freePremiumLevels) {
        expect(tracks.premium[l - 1].length).toBeGreaterThanOrEqual(1);
      }
      // Premium phenotype grants exist (5 per season via SeasonDef.phenotypeLevels).
      const phenos = tracks.premium.flatMap((rs) => rs.filter((r) => r.kind === 'phenotype'));
      expect(phenos).toHaveLength(5);
    }
  });
});

describe('economy laws', () => {
  it('completing a pass can NEVER fund the next premium (Ichor refund ≪ price)', () => {
    for (const s of SEASONS) {
      const total = trackIchorTotal(s.id, 'free') + trackIchorTotal(s.id, 'premium');
      expect(total, `${s.id} refunds ${total} Ichor`).toBeLessThan(BP.premiumIchor * 0.8);
    }
  });

  it('buying every level costs far more than the premium unlock (playing wins)', () => {
    let all = 0;
    for (let l = 0; l < BP.levels; l++) all += levelBuyPrice(l);
    expect(all).toBeGreaterThan(BP.premiumIchor * 8);
  });

  it('the store Season Pass SKU prices at the Ichor door (one truth, two doors)', () => {
    expect(offerValueIchor(SEASON_PASS_OFFER)).toBe(BP.premiumIchor);
  });
});
