// BOSS TROPHIES (docs/NEMESIS.md §trophies) — a first kill of each boss CHASSIS and each
// Mega Boss grows a trophy ORGAN: an account-wide passive with a real TRADEOFF (every
// trophy pays something and costs something, so the rack is a build choice, not a stat
// tax). OWNERSHIP is DERIVED — chassis kills live in save.bossesSlain and mega kills in
// save.megaProgress.slain, so trophies need no ownership save field and can't desync.
// At most ONE trophy is equipped (save.equippedTrophy); its effects fold into every run
// exactly like gear (meta.trophyRunEffects). Unequipped = zero effect (golden-safe).

import { CHASSIS } from './boss';
import { megaBossRegistry } from './megaboss';
import type { CardEffect } from './cards';

export interface TrophyDef {
  id: string;
  name: string;
  organ: string; // the fiction — what was carved out of the corpse
  source: { kind: 'chassis'; chassis: string } | { kind: 'mega'; defId: string };
  /** The tradeoff pair: always one upside AND one downside. */
  effects: CardEffect[];
  up: string; // human lines for the rack UI
  down: string;
}

const T = (id: string, name: string, organ: string, source: TrophyDef['source'], effects: CardEffect[], up: string, down: string): TrophyDef =>
  ({ id, name, organ, source, effects, up, down });

/** Chassis trophies — one per boss body plan (owned once ANY boss of that chassis falls). */
const CHASSIS_TROPHIES: TrophyDef[] = [
  T('tr_bruiser', 'Knuckle of the Bruiser', 'a fused knuckle-plate, still warm', { kind: 'chassis', chassis: 'bruiser' },
    [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }, { op: 'mul', field: 'biomassMult', value: 0.96 }],
    '+5% tower damage', '−4% biomass'),
  T('tr_artillery', 'Bombard Gland', 'the pressurized siege-gland, intact', { kind: 'chassis', chassis: 'artillery' },
    [{ op: 'mul', field: 'splashRadiusMult', value: 1.12 }, { op: 'mul', field: 'towerFireRateMult', value: 0.97 }],
    '+12% splash radius', '−3% fire rate'),
  T('tr_swarmlord', 'Brood Heart', 'a mother-mass heart that still beats', { kind: 'chassis', chassis: 'swarmlord' },
    [{ op: 'mul', field: 'biomassMult', value: 1.08 }, { op: 'mul', field: 'towerDamageMult', value: 0.97 }],
    '+8% biomass', '−3% tower damage'),
  T('tr_controller', 'Command Iris', 'the scanning iris, forever open', { kind: 'chassis', chassis: 'controller' },
    [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }, { op: 'mul', field: 'heroDamageMult', value: 0.95 }],
    '+5% tower fire rate', '−5% hero damage'),
  T('tr_juggernaut', 'Weld-Plate Segment', 'an armor band, drilled and hung', { kind: 'chassis', chassis: 'juggernaut' },
    [{ op: 'mul', field: 'integrityMult', value: 1.1 }, { op: 'mul', field: 'towerFireRateMult', value: 0.98 }],
    '+10% Nucleus integrity', '−2% fire rate'),
];

/** Mega trophies — one per authored Mega Boss (owned when that mega is slain). */
function megaTrophies(): TrophyDef[] {
  return megaBossRegistry.all().map((m, i) => {
    const lanes: [CardEffect[], string, string][] = [
      [[{ op: 'mul', field: 'heroDamageMult', value: 1.08 }, { op: 'mul', field: 'biomassMult', value: 0.95 }], '+8% hero damage', '−5% biomass'],
      [[{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }, { op: 'mul', field: 'integrityMult', value: 0.92 }], '+5% fire rate', '−8% Nucleus integrity'],
      [[{ op: 'mul', field: 'biomassMult', value: 1.1 }, { op: 'mul', field: 'towerFireRateMult', value: 0.96 }], '+10% biomass', '−4% fire rate'],
      [[{ op: 'mul', field: 'towerDamageMult', value: 1.06 }, { op: 'mul', field: 'heroDamageMult', value: 0.94 }], '+6% tower damage', '−6% hero damage'],
      [[{ op: 'mul', field: 'heroSpeedMult', value: 1.1 }, { op: 'mul', field: 'splashRadiusMult', value: 0.94 }], '+10% hero speed', '−6% splash radius'],
    ];
    const [effects, up, down] = lanes[i % lanes.length];
    return T(`tr_mega_${m.id}`, `Relic of ${m.name}`, 'a weak-point organ, preserved in amber ichor', { kind: 'mega', defId: m.id }, effects, up, down);
  });
}

export const TROPHY_DEFS: TrophyDef[] = [...CHASSIS_TROPHIES, ...megaTrophies()];

export function trophyById(id: string): TrophyDef | undefined {
  return TROPHY_DEFS.find((t) => t.id === id);
}

/** Ownership is derived from the kill ledgers the save already keeps. */
export function trophyOwned(t: TrophyDef, bossesSlain: readonly string[], megaSlain: readonly string[]): boolean {
  return t.source.kind === 'chassis' ? bossesSlain.includes(t.source.chassis) : megaSlain.includes(t.source.defId);
}

/** Sanity for CHASSIS coverage — one trophy per body plan, forever (test-pinned). */
export function chassisTrophyCoverage(): boolean {
  const have = new Set(CHASSIS_TROPHIES.map((t) => (t.source as { chassis: string }).chassis));
  return Object.keys(CHASSIS).every((c) => have.has(c));
}
