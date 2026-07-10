// BOSS TROPHIES (docs/NEMESIS.md §trophies) — a first kill of each boss CHASSIS and each
// Mega Boss grows a trophy ORGAN: an account-wide passive with a real TRADEOFF (every
// trophy pays something and costs something, so the rack is a build choice, not a stat
// tax). VENGEANCE trophies are the third source — the reward for avenging a Nemesis
// (docs/NEMESIS.md §vengeance): a PURE-UPSIDE organ per chassis, the spoils of the personal
// hunt. OWNERSHIP is DERIVED for chassis/mega organs — chassis kills live in save.bossesSlain
// and mega kills in save.megaProgress.slain — while vengeance organs read the save.vengeance
// ledger (which chassis you have avenged; a genuine event, not a kill count).
// A RACK of up to `trophySlots` organs is equipped at once (save.equippedTrophies); every
// mounted organ's effects fold into runs exactly like gear (meta.trophyRunEffects). An empty
// rack = zero effect (golden-safe).

import { CHASSIS } from './boss';
import { megaBossRegistry } from './megaboss';
import type { CardEffect } from './cards';

export type TrophySource =
  | { kind: 'chassis'; chassis: string }
  | { kind: 'mega'; defId: string }
  | { kind: 'vengeance'; chassis: string };

export interface TrophyDef {
  id: string;
  name: string;
  organ: string; // the fiction — what was carved out of the corpse
  source: TrophySource;
  /** Tradeoff organs (chassis/mega) carry an upside AND a downside; vengeance organs are pure upside. */
  effects: CardEffect[];
  up: string; // human lines for the rack UI
  down: string; // '' for pure-upside vengeance organs
}

/** Ownership context — the kill ledgers + the avenged-chassis ledger the save already keeps. */
export interface TrophyOwnCtx {
  bossesSlain: readonly string[];
  megaSlain: readonly string[];
  vengeance: readonly string[];
}

/** The rack grows with the hunt: more organs owned ⇒ more mounts. Data-driven thresholds —
 *  a slot opens each time the owned count crosses one. */
export const TROPHY_SLOT_THRESHOLDS = [0, 5, 12] as const; // → 1 / 2 / 3 slots

/** How many organs may be mounted at once, given how many are owned. */
export function trophySlots(ownedCount: number): number {
  return TROPHY_SLOT_THRESHOLDS.filter((th) => ownedCount >= th).length;
}

const T = (id: string, name: string, organ: string, source: TrophySource, effects: CardEffect[], up: string, down: string): TrophyDef =>
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

/** Vengeance trophies — the spoils of avenging a Nemesis (docs/NEMESIS.md §vengeance). One
 *  PURE-UPSIDE organ per chassis: hard-won through the personal hunt, so unlike the tradeoff
 *  rack it only gives. Owned when the chassis appears in save.vengeance. Kept modest — a
 *  3-slot rack of these is a real reward, not a runaway. */
const VENGEANCE_TROPHIES: TrophyDef[] = [
  T('tr_venge_bruiser', 'Vengeance: Bruiser', 'the pulped heart, claimed in reprisal', { kind: 'vengeance', chassis: 'bruiser' },
    [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }], '+8% tower damage', ''),
  T('tr_venge_artillery', 'Vengeance: Artillery', 'the siege-gland, silenced for good', { kind: 'vengeance', chassis: 'artillery' },
    [{ op: 'mul', field: 'splashRadiusMult', value: 1.14 }], '+14% splash radius', ''),
  T('tr_venge_swarmlord', 'Vengeance: Swarmlord', 'the brood-womb, torn out whole', { kind: 'vengeance', chassis: 'swarmlord' },
    [{ op: 'mul', field: 'biomassMult', value: 1.1 }], '+10% biomass', ''),
  T('tr_venge_controller', 'Vengeance: Controller', 'the command-iris, finally blind', { kind: 'vengeance', chassis: 'controller' },
    [{ op: 'mul', field: 'towerFireRateMult', value: 1.07 }], '+7% tower fire rate', ''),
  T('tr_venge_juggernaut', 'Vengeance: Juggernaut', 'the core-plate, pried from the wreck', { kind: 'vengeance', chassis: 'juggernaut' },
    [{ op: 'mul', field: 'integrityMult', value: 1.12 }], '+12% Nucleus integrity', ''),
];

export const TROPHY_DEFS: TrophyDef[] = [...CHASSIS_TROPHIES, ...megaTrophies(), ...VENGEANCE_TROPHIES];

export function trophyById(id: string): TrophyDef | undefined {
  return TROPHY_DEFS.find((t) => t.id === id);
}

/** Ownership: chassis/mega organs derive from the kill ledgers; vengeance organs read the
 *  avenged-chassis ledger (save.vengeance) the revenge kill writes. */
export function trophyOwned(t: TrophyDef, ctx: TrophyOwnCtx): boolean {
  switch (t.source.kind) {
    case 'chassis': return ctx.bossesSlain.includes(t.source.chassis);
    case 'mega': return ctx.megaSlain.includes(t.source.defId);
    case 'vengeance': return ctx.vengeance.includes(t.source.chassis);
  }
}

/** The vengeance organ id for a chassis (what avenging a nemesis of that chassis grants). */
export function vengeanceTrophyFor(chassis: string): TrophyDef | undefined {
  return VENGEANCE_TROPHIES.find((t) => (t.source as { chassis: string }).chassis === chassis);
}

/** Sanity for CHASSIS coverage — one tradeoff organ AND one vengeance organ per body plan,
 *  forever (test-pinned). */
export function chassisTrophyCoverage(): boolean {
  const chassisHave = new Set(CHASSIS_TROPHIES.map((t) => (t.source as { chassis: string }).chassis));
  const vengeHave = new Set(VENGEANCE_TROPHIES.map((t) => (t.source as { chassis: string }).chassis));
  return Object.keys(CHASSIS).every((c) => chassisHave.has(c) && vengeHave.has(c));
}
