// HERO ABILITY CINEMATICS — the SIM half (docs/HERO-CINEMATICS.md). Pins:
//   • every ability of every hero carries a cinematic def, inside the response budget
//     (zone strikes read as set-pieces; utility NEVER lags — delay 0);
//   • a cinematic cast SPLITS: support components (heal/shield/buff/summon) land at cast,
//     the zone payload (damage/debuff/pool) lands exactly impactDelay later, once, and the
//     queue drains — crit/damage multipliers locked at cast (no rng at impact);
//   • the cast feed (RenderState.castEvents) publishes one monotonically-seq'd event per cast
//     with the fork-resolved presentation fields the renderer stages from;
//   • a cast-less run — the golden autoplay — never populates the feed or the queue.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, HERO_ORDER, SIM_DT } from './config';
import type { HeroKind, HeroProgress, MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function progressWith(skills: Partial<Record<HeroKind, number>>): HeroProgress {
  const out = {} as HeroProgress;
  for (const k of HERO_ORDER) out[k] = { damageMult: 1, cooldownMult: 1, skillCount: skills[k] ?? 0 };
  return out;
}

describe('cinematic defs — every ability performs, inside the response budget', () => {
  it('all heroes × (ult + 2 skills) carry a cinematic with impactDelay in [0, 0.6]', () => {
    for (const k of HERO_ORDER) {
      const d = HERO_DEFS[k];
      for (const ab of [d.ability, ...(d.skills ?? [])]) {
        expect(ab.cinematic, `${k}: ${ab.name} has no cinematic`).toBeTruthy();
        expect(ab.cinematic!.impactDelay, `${k}: ${ab.name}`).toBeGreaterThanOrEqual(0);
        expect(ab.cinematic!.impactDelay, `${k}: ${ab.name}`).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('zone strikes take a beat to land; pure support lands instantly', () => {
    for (const k of HERO_ORDER) {
      const d = HERO_DEFS[k];
      for (const ab of [d.ability, ...(d.skills ?? [])]) {
        const zone = ab.damage > 0 || ab.disrupt > 0 || (ab.poolDps ?? 0) > 0;
        if (zone) expect(ab.cinematic!.impactDelay, `${k}: ${ab.name} zone strike should travel`).toBeGreaterThan(0);
        else expect(ab.cinematic!.impactDelay, `${k}: ${ab.name} support must not lag`).toBe(0);
      }
    }
  });
});

describe('the payload LANDS with the performance (impactDelay in-sim)', () => {
  // The Knell isolates the seam: no auto-attack, and its 120px pulse can't reach a pack pinned
  // 130px out — while the 140px ult zone can. Support (the amp buff) must ring AT cast; the
  // blast + stagger must wait for the bell (0.45s), then land exactly once.
  const CX = 380;
  const CY = 300;
  function knellCast(): { g: Game; pin: () => void } {
    const g = new Game(5, NO_META, undefined, 'knell');
    g.startWave();
    g.debugSpawn('brute', 3);
    const pin = (): void => { for (const e of g.enemies) { e.x = CX + 130; e.y = CY; } };
    pin();
    g.armAbility();
    g.click(CX, CY); // the bell begins its descent
    return { g, pin };
  }

  it('support is INSTANT (the amp rings at cast) but the blast waits for the bell', () => {
    const { g, pin } = knellCast();
    expect(g.getSnapshot().buffs.some((b) => /% tower dmg/.test(b))).toBe(true); // buff at cast
    expect(g.getRunStats().damageDealt).toBe(0); // the zone payload hasn't landed…
    expect(g.enemies.every((e) => e.disrupt <= 0)).toBe(true); // …neither has the stagger
    const impactSteps = Math.ceil(0.45 / SIM_DT);
    for (let i = 0; i < impactSteps - 2; i++) { pin(); g.advance(SIM_DT); } // just short of landing
    expect(g.getRunStats().damageDealt).toBe(0);
    for (let i = 0; i < 4; i++) { pin(); g.advance(SIM_DT); } // …and across it
    expect(g.getRunStats().damageDealt).toBeGreaterThan(50); // 60 dmg × 3 brutes (post-armor)
    expect(g.enemies.some((e) => e.disrupt > 0)).toBe(true); // the stagger landed with it
    expect((g as unknown as { pendingImpacts: unknown[] }).pendingImpacts.length).toBe(0); // fired once, drained
  });

  it('the impact strikes whatever stands in the zone WHEN it lands (re-queried, not snapshotted)', () => {
    const { g, pin } = knellCast();
    // walk the pack OUT of the zone before the bell slams — the blow must find nothing
    for (const e of g.enemies) { e.x = CX + 600; e.y = CY; }
    for (let i = 0; i < Math.ceil(0.45 / SIM_DT) + 3; i++) g.advance(SIM_DT);
    expect(g.getRunStats().damageDealt).toBe(0); // the zone was empty at landing
    void pin;
  });

  it('a cast-less run never populates the feed or the queue (golden control)', () => {
    const g = new Game(5, NO_META); // the default Ravager — nothing ever triggers its ult
    g.startWave();
    g.debugSpawn('brute', 3);
    for (let i = 0; i < 120; i++) g.advance(SIM_DT);
    expect(g.getRenderState().castEvents.length).toBe(0);
    expect((g as unknown as { pendingImpacts: unknown[] }).pendingImpacts.length).toBe(0);
  });
});

describe('the cast feed — one seq\'d presentation event per cast', () => {
  it('an ult publishes its fork-resolved presentation row', () => {
    const g = new Game(5, NO_META, undefined, 'knell');
    g.startWave();
    g.debugSpawn('brute', 2);
    g.armAbility();
    g.click(380, 300);
    const evs = g.getRenderState().castEvents;
    expect(evs.length).toBe(1);
    expect(evs[0]).toMatchObject({
      hero: 'knell', slot: 'ult', name: 'Sundering Peal',
      actor: 'bellwave', motion: 'expand', delay: 0.45,
      x: 380, y: 300, radius: 140, color: '#ffc46b',
    });
  });

  it('kit skills publish too (slot index), and seq climbs monotonically across casts', () => {
    const g = new Game(5, NO_META, undefined, 'knell', progressWith({ knell: 1 }));
    g.startWave();
    g.debugSpawn('brute', 3);
    const h = g.heroes[0];
    for (let i = 0; i < 200 && g.getRenderState().castEvents.length === 0; i++) {
      for (const e of g.enemies) { e.x = h.x; e.y = h.y - 40; } // satisfy Tolling Strike's minEnemies
      g.advance(SIM_DT);
    }
    const evs = g.getRenderState().castEvents;
    expect(evs.length).toBeGreaterThan(0); // the kit performed
    expect(evs[0]).toMatchObject({ hero: 'knell', slot: 0, name: 'Tolling Strike', actor: 'bellwave' });
    g.armAbility();
    g.click(h.x, h.y); // the ult joins the feed
    const all = g.getRenderState().castEvents;
    expect(all.some((e) => e.slot === 'ult')).toBe(true);
    for (let i = 1; i < all.length; i++) expect(all[i].seq).toBeGreaterThan(all[i - 1].seq);
  });
});
