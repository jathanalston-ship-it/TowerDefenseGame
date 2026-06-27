// The Shepherd's "Bloom" ult grants the caster a damage-absorbing shield (the
// `grantShield` ability primitive). This pins that behavior — granted, soaks contact
// damage before HP, lapses, and is surfaced in the HUD snapshot — which the mechanic
// shipped without. Golden-safe: only the Shepherd's ult carries a shield; the default
// Ravager does not, so the golden Ravager run is unaffected.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, HERO_DEFS } from './config';
import { WIDTH } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };
const BLOOM_SHIELD = HERO_DEFS.shepherd.ability.shield ?? 0;

// Mid-field cast point: far from the Nucleus (bottom) so a pinned test enemy can press
// the hero without instantly counting as a line breach.
const FIELD_Y = 400;

/** Cast the primary hero's signature ability, moving the hero to (px,py). */
function castUlt(game: Game, px = game.heroes[0].x, py = game.heroes[0].y): void {
  game.armAbility();
  game.click(px, py);
}

describe('Shepherd Bloom shield (grantShield primitive)', () => {
  it('grants the caster an absorbing shield, surfaced in the snapshot', () => {
    const game = new Game(7, NO_META, undefined, 'shepherd');
    const h = game.heroes[0];
    expect(h.shield).toBe(0); // none before the cast
    expect(BLOOM_SHIELD).toBeGreaterThan(0); // Bloom is configured to grant a shield
    castUlt(game);
    expect(h.shield).toBe(BLOOM_SHIELD); // full grant
    expect(h.shieldTime).toBeGreaterThan(0); // and its window is armed
    expect(game.getSnapshot().hero.shield).toBe(BLOOM_SHIELD);
  });

  it('soaks contact damage before HP while it lasts', () => {
    const game = new Game(7, NO_META, undefined, 'shepherd');
    const h = game.heroes[0];
    game.startWave();
    castUlt(game, WIDTH / 2, FIELD_Y); // shield up, hero mid-field
    game.debugSpawn('tank', 1); // tanky, avoidHero: 0 — survives Bloom and presses the hero
    const e = game.enemies.find((x) => x.kind === 'tank')!;
    const hp0 = h.hp;
    const shield0 = h.shield;
    // Pin the enemy on the hero so contact is unambiguous, then advance.
    for (let i = 0; i < 12; i++) {
      e.x = h.x;
      e.y = h.y;
      game.advance(SIM_DT);
    }
    expect(h.shield).toBeLessThan(shield0); // the shield absorbed contact damage
    expect(h.hp).toBe(hp0); // …and HP was fully protected
  });

  it('falls through to HP once the shield is spent', () => {
    const game = new Game(7, NO_META, undefined, 'shepherd');
    const h = game.heroes[0];
    game.startWave();
    castUlt(game, WIDTH / 2, FIELD_Y);
    h.shield = 1; // nearly spent — the next contact drains it and bleeds into HP
    game.debugSpawn('tank', 1);
    const e = game.enemies.find((x) => x.kind === 'tank')!;
    const hp0 = h.hp;
    for (let i = 0; i < 30; i++) {
      e.x = h.x;
      e.y = h.y;
      game.advance(SIM_DT);
    }
    expect(h.shield).toBe(0); // fully drained
    expect(h.hp).toBeLessThan(hp0); // damage past the shield reaches HP
  });

  it("the Ravager's ult grants no shield (control of the golden default)", () => {
    const game = new Game(7, NO_META); // defaults to the Ravager
    castUlt(game);
    expect(game.heroes[0].shield).toBe(0);
    expect(game.getSnapshot().hero.shield).toBe(0);
  });
});
