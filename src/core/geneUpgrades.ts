// Permanent Gene Card upgrade levels (docs/GENE-EVOLUTION.md, Task 4) — the authored CONTENT for
// every card in CARD_POOL. `GENE_UPGRADES[id][i]` is the jump to level i+1; cards.ts folds these
// onto each def (upgrades + maxLevel) before registration, so every seam (effectiveGeneEffects,
// Power, the Archive) reads them off the def generically.
//
// Authoring rules (enforced by cardProblems + geneUpgrades.test):
//   • EVERY card has 3–5 levels — no exceptions. Commons run 3, rares 4, epics 4–5, legendaries 5
//     (matching the essenceUpgradeCost depth: higher rarity = the longer chase).
//   • Levels EVOLVE the card, not just inflate it: capstones add a rule (a pierce grant, an on-kill
//     hook, a keystone field, a hero verb) and mid levels sharpen the card's identity.
//   • Every level is POWER-VISIBLE: it carries at least one effect scored by FIELD_WEIGHT/ADD_POWER,
//     so genePermanentPowerMult strictly rises with every level (the Task 9 guarantee).
//   • NO boot-only fields (startBiomassBonus / integrityMult / heroMaxHpMult) — a card can be drafted
//     MID-run, where those are already consumed; upgrades must always do something.

import type { GeneUpgradeLevel } from './cards';

export const GENE_UPGRADES: Record<string, GeneUpgradeLevel[]> = {
  // ════════════════ Expansion towers (docs/TOWERS.md §expansion) ════════════════
  wider_jaws: [
    { effects: [{ op: 'mul', field: 'mawCleaveRadiusMult', value: 1.06 }], note: 'Unhinged — +6% bite reach.' },
    { effects: [{ op: 'mul', field: 'mawCleaveRadiusMult', value: 1.08 }], note: 'Distended gullet — +8% bite reach.' },
    { effects: [{ op: 'mul', field: 'mawCleaveRadiusMult', value: 1.06 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Grinding rows — +6% reach, +5% tower damage.' },
  ],
  thick_amber: [
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.08 }], note: 'Slow pour — +8% encasement duration.' },
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.08 }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'Caustic set — +8% duration, +4% tower damage.' },
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.1 }], note: 'Museum grade — +10% encasement duration.' },
  ],
  lingering_dread: [
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.08 }], note: 'Long echo — +8% panic duration.' },
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.08 }, { op: 'mul', field: 'towerFireRateMult', value: 1.04 }], note: 'Urgent keening — +8% duration, +4% fire rate.' },
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.1 }], note: 'The unending note — +10% panic duration.' },
  ],
  gnashing_hunger: [
    { effects: [{ op: 'mul', field: 'mawCleaveRadiusMult', value: 1.06 }], note: 'Hungrier — +6% bite reach.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.06 }], note: 'Snapping tendons — +6% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'mawCleaveRadiusMult', value: 1.08 }], note: 'The open grave — +8% bite reach.' },
    { effects: [{ op: 'mul', field: 'mawCleaveRadiusMult', value: 1.06 }, { op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Feeding frenzy — +6% reach, +6% tower damage.' },
  ],
  crystalline_matrix: [
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.06 }], note: 'Denser lattice — +6% encasement duration.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Razor facets — +5% tower damage.' },
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.08 }], note: 'Perfect clarity — +8% encasement duration.' },
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.06 }, { op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'The reliquary — +6% duration, +6% damage.' },
  ],
  chorus_of_grief: [
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.06 }], note: 'A second mourner — +6% panic duration.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }], note: 'Swelling dirge — +5% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.08 }], note: 'Grief carries — +8% panic duration.' },
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.06 }, { op: 'add', field: 'obeliskSlowBonus', value: 0.04 }], note: 'All things mourn — +6% duration, Disruption slows +4% harder.' },
  ],
  total_lockdown: [
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.06 }, { op: 'mul', field: 'effigyDreadDurationMult', value: 1.06 }], note: 'Twin clamps — +6% encasement AND panic duration.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.05 }], note: 'Heavier field — +5% Disruption vulnerability.' },
    { effects: [{ op: 'mul', field: 'chrysalisFreezeDurationMult', value: 1.08 }, { op: 'mul', field: 'effigyDreadDurationMult', value: 1.08 }], note: 'The stillness — +8% to both holds.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.08 }], note: 'Nothing moves, everything breaks — +8% Disruption vulnerability.' },
  ],

  // ════════════════ Progression-gated (docs/CARDS.md §gates) — rare, 4 levels ════════════════
  regenerative_carapace: [
    { effects: [{ op: 'add', field: 'integrityRegenPerWave', value: 10 }, { op: 'mul', field: 'biomassMult', value: 1.05 }], note: 'Faster knit — +10 Integrity/wave, +5% biomass.' },
    { effects: [{ op: 'integrity', value: 25 }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'Hardened plating — +25 Integrity now, +4% tower damage.' },
    { effects: [{ op: 'add', field: 'integrityRegenPerWave', value: 15 }, { op: 'mul', field: 'biomassMult', value: 1.05 }], note: 'Living carapace — +15 more Integrity per wave.' },
    { effects: [{ op: 'add', field: 'sellRefundFrac', value: 0.05 }, { op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Reclaimed plates — +5% sell refund, +6% tower damage.' },
  ],
  ambush_enzyme: [
    { effects: [{ op: 'add', field: 'fullHealthDamageBonus', value: 0.15 }], note: 'Sharper ambush — +15% first-strike damage.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Coiled strike — +6% tower damage.' },
    { effects: [{ op: 'add', field: 'fullHealthDamageBonus', value: 0.2 }], note: 'Perfect opening — +20% first-strike damage.' },
    { effects: [{ op: 'add', field: 'fullHealthDamageBonus', value: 0.15 }, { op: 'mul', field: 'towerFireRateMult', value: 1.06 }], note: 'Killing tempo — +15% first-strike, +6% fire rate.' },
  ],
  culling_instinct: [
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.02 }], note: 'Sharper cull — execute below 12% HP.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Culling edge — +6% tower damage.' },
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.03 }], note: 'No stragglers — execute below 15% HP.' },
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.03 }, { op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Law of the hive — execute below 18% HP, +1 Fracture cap.' },
  ],
  viral_payload: [
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Deeper cracks — +1 max Fracture stack.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Weaponized rot — +5% tower damage.' },
    { effects: [{ op: 'add', field: 'killFractureSplash', value: 1 }, { op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Wider bloom — +1 Fracture spread, +1 cap.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'The plague CHAINS — status reactions re-fire once more.' },
  ],
  toxic_aura: [
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.1 }], note: 'Thicker miasma — Corrosion ticks +10% harder.' },
    { effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.06 }, { op: 'mul', field: 'poolDpsMult', value: 1.06 }], note: 'Clinging fumes — Corrosion slows +6% more.' },
    { effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.1 }], note: 'Necrotic haze — +10% Infection damage.' },
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.12 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.04 }], note: 'The reeking field — Corrosion ticks +12% harder.' },
  ],

  // ════════════════ Common (3 levels) ════════════════
  sharpened_needles: [
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Honed edges — +6% tower damage.' },
    { effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'mul', field: 'towerDamageMult', value: 1.03 }], note: 'Needles punch THROUGH — all tower shots pierce +1 enemy.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Splintering tips — +2 max Fracture stacks, +5% damage.' },
  ],
  rapid_glands: [
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.06 }], note: 'Quickened glands — +6% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'heroAttackSpeedMult', value: 1.1 }], note: 'The hero metabolizes it too — +10% hero attack speed.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.08 }], note: 'Overdrive secretion — +8% tower fire rate.' },
  ],
  fertile_decay: [
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.08 }], note: 'Richer rot — +8% biomass from kills.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 1 } } }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'Corpses drip — +1 biomass on EVERY kill.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.1 }], note: 'Total decomposition — +10% biomass from kills.' },
  ],
  biomass_surge: [
    { effects: [{ op: 'biomass', value: 60 }, { op: 'mul', field: 'biomassMult', value: 1.03 }], note: '+60 more biomass now; the surge lingers (+3% income).' },
    { effects: [{ op: 'biomass', value: 60 }, { op: 'integrity', value: 15 }, { op: 'add', field: 'sellRefundFrac', value: 0.03 }], note: 'The surge feeds the walls too — +60 biomass, +15 Integrity, +3% sell refund.' },
    { effects: [{ op: 'biomass', value: 120 }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'A flood — +120 more biomass now, +4% income.' },
  ],
  thick_marrow: [
    { effects: [{ op: 'integrity', value: 20 }, { op: 'mul', field: 'biomassMult', value: 1.03 }], note: '+20 more Integrity; marrow feeds the economy (+3% biomass).' },
    { effects: [{ op: 'integrity', value: 25 }, { op: 'hook', hook: { on: 'waveCleared', action: { do: 'heal', value: 4 } } }, { op: 'add', field: 'sellRefundFrac', value: 0.02 }], note: 'Marrow knits — +4 Integrity regrown every cleared wave.' },
    { effects: [{ op: 'integrity', value: 30 }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'Dense cores — +30 more Integrity.' },
  ],
  twin_fang: [
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Serrated fangs — +1 max Fracture stack.' },
    { effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Fangs bite THROUGH — shots pierce +1 enemy.' },
    { effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }], note: 'TRIPLE fang — the Needle Spitter fires yet another needle.' },
  ],
  battle_stims: [
    { effects: [{ op: 'heroHp', value: 30 }, { op: 'mul', field: 'heroHealingMult', value: 1.05 }], note: '+30 more hero HP; stims aid recovery (+5% healing received).' },
    { effects: [{ op: 'mul', field: 'heroHealingMult', value: 1.15 }], note: 'Regenerative cocktail — +15% healing received.' },
    { effects: [{ op: 'heroHp', value: 60 }, { op: 'add', field: 'heroArmor', value: 0.03 }], note: 'Battle-hardened — +60 hero HP and 3% contact damage shrugged off.' },
  ],
  toxic_coating: [
    { effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.08 }], note: 'Thicker venom — +8% Infection damage.' },
    { effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Corrosion', amount: 2 } }, { op: 'mul', field: 'poolDpsMult', value: 1.06 }], note: "The hero's claws drip — hero hits apply Corrosion." },
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.12 }, { op: 'mul', field: 'parasiteInfectionMult', value: 1.08 }], note: 'Compound toxins — +12% Corrosion and +8% Infection damage.' },
  ],
  caustic_edge: [
    { effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.04 }, { op: 'mul', field: 'poolDpsMult', value: 1.05 }], note: 'Sharper acid — Corrosion slows +4% more and ticks +5% harder.' },
    { effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.15 }, { op: 'mul', field: 'poolDpsMult', value: 1.06 }], note: 'The acid clings — pools last +15% longer.' },
    { effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.06 }, { op: 'mul', field: 'poolDpsMult', value: 1.06 }], note: 'Deep burn — Corrosion slows +6% more.' },
  ],
  numbing_field: [
    { effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.04 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.02 }], note: 'Wider numbness — Disruption slows +4% more.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.05 }], note: 'Numbed flesh splits — Disrupted enemies take +5% more damage.' },
    { effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.06 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.03 }], note: 'Paralytic field — Disruption slows +6% more.' },
  ],
  disorient: [
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.04 }], note: 'Deeper confusion — +4% damage taken while Disrupted.' },
    { effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.05 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.02 }], note: 'Staggered gait — Disruption also slows +5% more.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.06 }], note: 'Total disorientation — +6% damage taken while Disrupted.' },
  ],
  thick_hide: [
    { effects: [{ op: 'heroHp', value: 40 }, { op: 'add', field: 'heroArmor', value: 0.02 }], note: '+40 more hero HP; the hide toughens (2% damage shrugged).' },
    { effects: [{ op: 'add', field: 'heroArmor', value: 0.06 }], note: 'Hardened hide — 6% of contact damage shrugged off.' },
    { effects: [{ op: 'heroHp', value: 80 }, { op: 'add', field: 'heroThornsFrac', value: 0.05 }], note: 'Barbed hide — +80 HP and attackers take 5% of their damage back.' },
  ],
  combat_stims: [
    { effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.96 }], note: 'Refined dose — a further −4% ability cooldown.' },
    { effects: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.08 }], note: 'Abilities bloom wider — +8% ability radius.' },
    { effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.94 }], note: 'Constant drip — a further −6% ability cooldown.' },
  ],
  fleet_step: [
    { effects: [{ op: 'mul', field: 'heroSpeedMult', value: 1.06 }], note: 'Lighter stride — +6% hero move speed.' },
    { effects: [{ op: 'mul', field: 'heroAggroRangeMult', value: 1.15 }], note: 'Hunts wider — +15% hero engagement range.' },
    { effects: [{ op: 'mul', field: 'heroSpeedMult', value: 1.08 }, { op: 'add', field: 'heroCritChance', value: 0.03 }], note: 'Momentum kills — +8% speed and +3% crit chance.' },
  ],
  fracture_point: [
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Finer cracks — +1 max Fracture stack.' },
    { effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Fracture', amount: 1 } }, { op: 'add', field: 'fractureBonusStacks', value: 1 }], note: "The hero's blows crack chitin — hero hits apply Fracture." },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }], note: 'Structural failure — +2 max Fracture stacks.' },
  ],
  bonemeal: [
    { effects: [{ op: 'biomass', value: 50 }, { op: 'mul', field: 'biomassMult', value: 1.03 }], note: '+50 more biomass now, +3% income.' },
    { effects: [{ op: 'biomass', value: 50 }, { op: 'add', field: 'sellRefundFrac', value: 0.05 }], note: 'Waste not — +5% tower sell refund.' },
    { effects: [{ op: 'biomass', value: 100 }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'Ground to dust — +100 more biomass now.' },
  ],
  hardened_carapace: [
    { effects: [{ op: 'integrity', value: 30 }, { op: 'add', field: 'sellRefundFrac', value: 0.03 }], note: '+30 more Integrity; chitin reclaimed from every demolition (+3% sell refund).' },
    { effects: [{ op: 'integrity', value: 35 }, { op: 'hook', hook: { on: 'waveCleared', action: { do: 'heal', value: 4 } } }, { op: 'mul', field: 'biomassMult', value: 1.03 }], note: 'Living armor — +4 Integrity regrown every cleared wave.' },
    { effects: [{ op: 'integrity', value: 40 }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'Fortress plating — +40 more Integrity.' },
  ],
  engorged_reactor: [
    { effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.05 }], note: 'Swollen chambers — +0.05 reactor overcharge.' },
    { effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.15 }], note: 'Reactors seep — +15% reactor biomass.' },
    { effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.1 }], note: 'Critical mass — +0.10 reactor overcharge.' },
  ],

  // ════════════════ Rare (4 levels) ════════════════
  caustic_catalyst: [
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.15 }], note: 'Hotter reagent — Corrosion pools tick +15% harder.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }], note: 'Cracks run deeper — +2 max Fracture stacks.' },
    { effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.2 }, { op: 'mul', field: 'poolDpsMult', value: 1.08 }], note: 'Stabilized catalyst — pools last +20% longer.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'SHRED echoes — status reactions re-fire once more.' },
  ],
  volatile_marrow: [
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.1 }], note: 'Wider burst — +10% splash radius.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Denser marrow — +6% tower damage.' },
    { effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'mul', field: 'splashRadiusMult', value: 1.05 }], note: 'Shrapnel carries THROUGH — shots pierce +1 enemy.' },
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.15 }, { op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Chain detonation — +15% splash radius, +6% damage.' },
  ],
  fracture_cascade: [
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Deeper fault lines — +1 max Fracture stack.' },
    { effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Fracture', amount: 1 } }, { op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'The hero joins the cascade — hero hits apply Fracture.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }], note: 'Compounding fractures — +2 max Fracture stacks.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'The cascade CHAINS — status reactions re-fire once more.' },
  ],
  apex_adrenaline: [
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.1 }], note: 'Purer strain — +10% hero damage.' },
    { effects: [{ op: 'add', field: 'heroCritChance', value: 0.05 }], note: 'Adrenaline sharpens — +5% hero crit chance.' },
    { effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.92 }], note: 'Endless rush — a further −8% ability cooldown.' },
    { effects: [{ op: 'add', field: 'heroCritDamageBonus', value: 0.5 }, { op: 'mul', field: 'heroDamageMult', value: 1.1 }], note: 'Killing instinct — crits hit +50% harder, +10% damage.' },
  ],
  lingering_acid: [
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.1 }], note: 'Concentrated — pools tick +10% harder.' },
    { effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.2 }, { op: 'mul', field: 'poolDpsMult', value: 1.05 }], note: 'Never dries — pools last +20% longer.' },
    { effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.08 }, { op: 'mul', field: 'poolDpsMult', value: 1.05 }], note: 'Acid clings to legs — Corrosion slows +8% more.' },
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.2 }, { op: 'mul', field: 'mortarPoolDurationMult', value: 1.2 }], note: 'A permanent swamp — pools tick +20% harder and last +20% longer.' },
  ],
  overcharged_veins: [
    { effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.08 }], note: 'Wider veins — +0.08 reactor overcharge.' },
    { effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.15 }], note: 'Richer flow — +15% reactor biomass.' },
    { effects: [{ op: 'hook', hook: { on: 'waveCleared', action: { do: 'biomass', value: 25 } } }, { op: 'mul', field: 'reactorBiomassMult', value: 1.08 }], note: 'Veins vent a gout — +25 biomass every cleared wave.' },
    { effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.12 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.15 }], note: 'Arterial overcharge — +0.12 overcharge and +15% reactor biomass.' },
  ],
  swarm_bounty: [
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.08 }], note: 'Fatter prey — +8% biomass from kills.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 1 } } }, { op: 'mul', field: 'biomassMult', value: 1.05 }], note: 'The swarm tithes — +1 biomass on EVERY kill.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.1 }], note: 'Glutted harvest — +10% biomass from kills.' },
    { effects: [{ op: 'biomass', value: 150 }, { op: 'mul', field: 'biomassMult', value: 1.08 }], note: 'The hive pays forward — +150 biomass now and +8% income.' },
  ],
  plague_vector: [
    { effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.1 }], note: 'Virulent strain — +10% Infection damage.' },
    { effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Infection', amount: 1 } }, { op: 'mul', field: 'parasiteInfectionMult', value: 1.05 }], note: 'The hero carries the plague — hero hits apply Infection.' },
    { effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.15 }], note: 'Mutation drift — +15% Infection damage.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Infection', amount: 1, radius: 110 } } }, { op: 'mul', field: 'parasiteInfectionMult', value: 1.08 }], note: 'A second, wider bloom — kills spread Infection to a larger radius.' },
  ],
  vulnerability_field: [
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.05 }], note: 'Deeper exposure — +5% damage taken while Disrupted.' },
    { effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.08 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.02 }], note: 'The field drags — Disruption also slows +8% more.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.07 }], note: 'Flayed defenses — +7% damage taken while Disrupted.' },
    { effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Disruption', amount: 1.5 } }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.04 }], note: "The hero's presence disrupts — hero hits apply Disruption." },
  ],
  pierce_protocol: [
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Denser rounds — +6% tower damage.' },
    { effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'Protocol v2 — shots pierce +1 FURTHER enemy (3 total).' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }], note: 'Hardened penetrators — +8% tower damage.' },
    { effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'Protocol final — shots pierce +1 FURTHER enemy (4 total).' },
  ],
  heavy_caliber: [
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }], note: 'Heavier loads — +8% tower damage.' },
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.1 }], note: 'Rounds burst wider — +10% splash radius.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }], note: 'Recoil tamed — the fire-rate penalty erased.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.12 }], note: 'Siege caliber — +12% tower damage.' },
  ],
  rapid_cycling: [
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.06 }], note: 'Faster cycling — +6% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'heroAttackSpeedMult', value: 1.1 }], note: 'The rhythm spreads — +10% hero attack speed.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.08 }], note: 'Red-line cycling — +8% tower fire rate.' },
    { effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }], note: 'Cycling so hot the Needle Spitter grows a barrel — +1 needle.' },
  ],
  reclaimed_node: [
    { effects: [{ op: 'biomass', value: 100 }, { op: 'add', field: 'damagePerEmptySlot', value: 0.01 }], note: 'The node comes stocked — +100 biomass on draft.' },
    { effects: [{ op: 'integrity', value: 40 }, { op: 'add', field: 'damagePerEmptySlot', value: 0.01 }], note: 'Reclaiming reinforces the Hive — +40 Integrity.' },
    { effects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.03 }], note: 'Unbuilt ground focuses the network — +3% tower damage per EMPTY slot.' },
    { effects: [{ op: 'add', field: 'bonusTowerSlots', value: 1 }, { op: 'add', field: 'damagePerTower', value: 0.01 }], note: 'A SECOND emplacement reclaimed — +1 more tower slot this run.' },
  ],
  warlords_presence: [
    { effects: [{ op: 'add', field: 'heroAuraRadius', value: 20 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.02 }], note: 'The presence carries — +20 aura radius.' },
    { effects: [{ op: 'add', field: 'heroTowerDamageAura', value: 0.05 }], note: 'Rallying roar — aura grants a further +5% tower damage.' },
    { effects: [{ op: 'add', field: 'heroTowerHasteAura', value: 0.08 }], note: 'The aura QUICKENS — nearby towers also gain +8% fire rate.' },
    { effects: [{ op: 'add', field: 'heroAuraRadius', value: 30 }, { op: 'add', field: 'heroTowerDamageAura', value: 0.07 }], note: "Warlord ascendant — +30 radius, +7% aura damage." },
  ],
  lifelink: [
    { effects: [{ op: 'add', field: 'heroLifestealFrac', value: 0.03 }], note: 'Deeper link — heal a further 3% of damage dealt.' },
    { effects: [{ op: 'mul', field: 'heroHealingMult', value: 1.15 }], note: 'Drink deeper — +15% healing received.' },
    { effects: [{ op: 'add', field: 'heroLifestealFrac', value: 0.04 }], note: 'Vampiric strain — heal a further 4% of damage dealt.' },
    { effects: [{ op: 'add', field: 'heroThornsFrac', value: 0.1 }], note: 'The link cuts BOTH ways — attackers take 10% of their damage back.' },
  ],
  adaptive_arsenal: [
    { effects: [{ op: 'add', field: 'diversityBonus', value: 0.02 }], note: 'Broader adaptation — +2% damage per distinct tower class.' },
    { effects: [{ op: 'add', field: 'classResonanceBonus', value: 0.05 }], note: "Resonates with the hero — +5% damage for towers matching the hero's class." },
    { effects: [{ op: 'add', field: 'diversityBonus', value: 0.03 }], note: 'Cross-pollination — +3% damage per distinct tower class.' },
    { effects: [{ op: 'add', field: 'bonusTowerSlots', value: 1 }, { op: 'add', field: 'diversityBonus', value: 0.02 }], note: 'The arsenal EXPANDS — +1 tower slot this run.' },
  ],

  // ════════════════ Epic (4–5 levels) ════════════════
  caustic_detonation: [
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.15 }], note: 'Volatile mix — pools tick +15% harder.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 3 }], note: 'Blast-fractured chitin — +3 max Fracture stacks.' },
    { effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.25 }, { op: 'add', field: 'corrosionSlowBonus', value: 0.08 }, { op: 'mul', field: 'poolDpsMult', value: 1.08 }], note: 'The burn never stops — pools last +25% longer and slow +8% more.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'Detonations ECHO — status reactions re-fire once more.' },
  ],
  shatterpoint: [
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }], note: 'Finer shatter lines — +2 max Fracture stacks.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }], note: 'Force multiplied — +8% tower damage.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 3 }], note: 'Total structural failure — +3 max Fracture stacks.' },
    { effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Fracture', amount: 2 } }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'The hero IS a shatterpoint — hero hits apply 2 Fracture.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'Reactions re-fire TWICE — the cascade never ends.' },
  ],
  cull_the_weak: [
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.02 }], note: 'Sharper cull — execute below 14% HP.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 1 } } }, { op: 'add', field: 'executeThreshold', value: 0.01 }], note: 'Culled meat feeds the Hive — +1 biomass on every kill.' },
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.03 }], note: 'No stragglers — execute below 18% HP.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }, { op: 'add', field: 'executeThreshold', value: 0.02 }], note: 'The law of the Hive — execute below 20% HP, +10% damage.' },
  ],
  avatar_of_war: [
    { effects: [{ op: 'add', field: 'heroAuraRadius', value: 25 }, { op: 'mul', field: 'heroDamageMult', value: 1.05 }], note: 'The avatar looms — +25 aura radius.' },
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.1 }], note: 'War incarnate — +10% hero damage.' },
    { effects: [{ op: 'add', field: 'heroTowerDamageAura', value: 0.08 }], note: 'Banner of ruin — aura grants a further +8% tower damage.' },
    { effects: [{ op: 'add', field: 'heroTowerHasteAura', value: 0.1 }], note: 'Drums of war — aura grants a further +10% fire rate.' },
    { effects: [{ op: 'add', field: 'classResonanceBonus', value: 0.12 }], note: "EXALTATION — towers sharing the avatar's class gain +12% damage." },
  ],
  catalyst_engine: [
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Hotter engine — +6% tower damage.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }], note: 'Catalytic stress — +2 max Fracture stacks.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }], note: 'Perpetual reaction — +8% tower damage.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'The engine DOUBLES again — reactions re-fire once more.' },
  ],
  overcharged_grid: [
    { effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.1 }], note: 'Grid expansion — +0.10 reactor overcharge.' },
    { effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.2 }], note: 'High-voltage veins — +20% reactor biomass.' },
    { effects: [{ op: 'hook', hook: { on: 'waveStarted', action: { do: 'biomass', value: 30 } } }, { op: 'mul', field: 'reactorBiomassMult', value: 1.1 }], note: 'The grid SURGES as each wave breaks — +30 biomass per wave.' },
    { effects: [{ op: 'add', field: 'reactorOverchargeBonus', value: 0.15 }, { op: 'mul', field: 'towerDamageMult', value: 1.08 }], note: 'Total overcharge — +0.15 overcharge, +8% tower damage.' },
  ],
  carrion_bloom: [
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }], note: 'Fertile spores — +6% biomass from kills.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.05 }, { op: 'mul', field: 'reactorBiomassMult', value: 1.08 }], note: 'Deep mycelium — +5% biomass, +8% reactor biomass.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 1 } } }, { op: 'mul', field: 'biomassMult', value: 1.05 }], note: 'Gorging bloom — each kill sheds +1 MORE biomass, +5% biomass.' },
    { effects: [{ op: 'hook', hook: { on: 'waveCleared', action: { do: 'heal', value: 25 } } }, { op: 'mul', field: 'biomassMult', value: 1.06 }], note: 'Bloom cycle — surviving a wave regrows +25 Nucleus integrity, +6% biomass.' },
  ],
  gravity_well: [
    { effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.06 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.03 }], note: 'Heavier pull — Disruption slows +6% more.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.08 }], note: 'Crushing weight — +8% damage taken while Disrupted.' },
    { effects: [{ op: 'mul', field: 'heroAbilityRadiusMult', value: 1.12 }], note: "The well warps the hero's reach — +12% ability radius." },
    { effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.1 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.08 }], note: 'Event horizon — Disruption slows +10% and exposes +8% more.' },
  ],

  // ════════════════ Legendary (5 levels) ════════════════
  glass_genome: [
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }], note: 'Purer glass — +10% tower damage.' },
    { effects: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.96 }], note: 'The bargain softens — enemies gain 4% LESS bonus HP.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.12 }], note: 'Crystalline focus — +12% tower damage.' },
    { effects: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.95 }], note: 'The genome perfects — enemies gain 5% LESS bonus HP.' },
    { effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'mul', field: 'towerDamageMult', value: 1.15 }], note: 'GLASS SHARDS — +15% damage and every shot pierces +1 enemy.' },
  ],
  executioners_law: [
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.02 }], note: 'A broader writ — execute below 22% HP.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 2 } } }, { op: 'add', field: 'executeThreshold', value: 0.01 }], note: 'Executions pay a bounty — +2 biomass on every kill.' },
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.03 }], note: 'Summary judgment — execute below 26% HP.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }], note: 'The law is absolute — +10% tower damage.' },
    { effects: [{ op: 'add', field: 'executeThreshold', value: 0.04 }], note: 'FINAL VERDICT — execute non-elite enemies below 30% HP.' },
  ],
  last_bastion: [
    { effects: [{ op: 'add', field: 'damagePerTower', value: 0.01 }], note: 'Every wall counts — a further +1% damage per tower fielded.' },
    { effects: [{ op: 'integrity', value: 60 }, { op: 'mul', field: 'lastStandMult', value: 1.05 }], note: 'The bastion thickens — +60 Integrity.' },
    { effects: [{ op: 'mul', field: 'lastStandMult', value: 1.1 }], note: 'Desperation sharpens — Last Stand deals ×1.1 more.' },
    { effects: [{ op: 'add', field: 'lastStandThreshold', value: 0.05 }, { op: 'mul', field: 'lastStandMult', value: 1.05 }], note: 'The line moves up — Last Stand triggers at 55% Nucleus.' },
    { effects: [{ op: 'hook', hook: { on: 'waveCleared', action: { do: 'heal', value: 10 } } }, { op: 'add', field: 'damagePerTower', value: 0.01 }], note: 'The bastion REGROWS — +10 Integrity every cleared wave.' },
  ],
  apex_predator: [
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.15 }], note: 'Sharper instincts — +15% hero damage.' },
    { effects: [{ op: 'heroHp', value: 75 }, { op: 'mul', field: 'heroHealingMult', value: 1.1 }], note: 'Predator bulk — +75 hero HP, +10% healing received.' },
    { effects: [{ op: 'add', field: 'heroLifestealFrac', value: 0.08 }], note: 'Feeds on the kill — heal 8% of damage dealt.' },
    { effects: [{ op: 'mul', field: 'enemyHpRunMult', value: 0.95 }], note: 'Prey weakens — enemies gain 5% LESS bonus HP.' },
    { effects: [{ op: 'add', field: 'heroCritChance', value: 0.1 }, { op: 'add', field: 'heroCritDamageBonus', value: 0.5 }], note: 'THE APEX STRIKES TRUE — +10% crit chance, crits hit +50% harder.' },
  ],

  // ════════════════ Deep-Strain (docs/SIPHON.md §gate) — GATED cards; deep unlocks run 4–5 levels ════════════════
  deep_overclock: [
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.06 }], note: 'Redlined glands — +6% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Denser output — +6% tower damage.' },
    { effects: [{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce1' } }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'Overclocked penetrators — all tower shots pierce +1 enemy.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.08 }], note: 'Runaway cadence — +8% tower fire rate.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'The overclock ECHOES — status reactions re-fire once more.' },
  ],
  marrow_feast: [
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.08 }], note: 'Richer marrow — +8% biomass from kills.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 2 } } }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'Every corpse feeds — +2 biomass on EVERY kill.' },
    { effects: [{ op: 'biomass', value: 120 }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'A glut — +120 more biomass now.' },
    { effects: [{ op: 'add', field: 'sellRefundFrac', value: 0.06 }, { op: 'mul', field: 'biomassMult', value: 1.04 }], note: 'Nothing wasted — +6% tower sell refund.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.1 }], note: 'The endless feast — +10% biomass from kills.' },
  ],
  neural_dominion: [
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.05 }], note: 'Deeper exposure — Disrupted enemies take +5% more damage.' },
    { effects: [{ op: 'add', field: 'obeliskSlowBonus', value: 0.08 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.02 }], note: 'Crushing field — Disruption slows +8% more.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Focused ruin — +6% tower damage.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.06 }], note: 'Total exposure — +6% more damage taken while Disrupted.' },
    { effects: [{ op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.05 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Dominion absolute — +5% vulnerability and +5% tower damage.' },
  ],
  hollow_bastion: [
    { effects: [{ op: 'integrity', value: 40 }, { op: 'add', field: 'damagePerTower', value: 0.01 }], note: '+40 more Integrity; the network tightens (+1% per tower).' },
    { effects: [{ op: 'add', field: 'damagePerTower', value: 0.02 }], note: 'Fortress network — +2% tower damage per tower fielded.' },
    { effects: [{ op: 'integrity', value: 40 }, { op: 'add', field: 'sellRefundFrac', value: 0.05 }], note: 'Reclaimed chitin — +40 Integrity, +5% sell refund.' },
    { effects: [{ op: 'hook', hook: { on: 'waveCleared', action: { do: 'heal', value: 8 } } }, { op: 'add', field: 'damagePerTower', value: 0.01 }], note: 'The bastion REGROWS — +8 Integrity every cleared wave.' },
    { effects: [{ op: 'add', field: 'damagePerTower', value: 0.02 }, { op: 'add', field: 'damagePerEmptySlot', value: 0.02 }], note: 'Every wall a weapon — +2% per tower AND +2% per empty slot.' },
  ],
  apex_ascendant: [
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.12 }], note: 'Sharper apex — +12% hero damage.' },
    { effects: [{ op: 'heroHp', value: 90 }, { op: 'mul', field: 'heroHealingMult', value: 1.1 }], note: 'Ascendant bulk — +90 hero HP, +10% healing received.' },
    { effects: [{ op: 'add', field: 'heroCritChance', value: 0.1 }], note: 'Perfect aim — +10% hero crit chance.' },
    { effects: [{ op: 'add', field: 'heroLifestealFrac', value: 0.08 }], note: 'Feeds on ruin — heal 8% of damage dealt.' },
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.15 }, { op: 'add', field: 'heroCritDamageBonus', value: 0.5 }], note: 'THE ASCENDANT — +15% damage, crits hit +50% harder.' },
  ],
  gorging_instinct: [
    { effects: [{ op: 'mul', field: 'siphonRampMult', value: 1.08 }], note: 'Hungrier — the beam gorges +8% faster.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Searing draw — +5% tower damage.' },
    { effects: [{ op: 'mul', field: 'siphonRampMult', value: 1.1 }], note: 'Ravenous — the beam gorges +10% faster.' },
    { effects: [{ op: 'mul', field: 'siphonDrainMult', value: 1.15 }, { op: 'mul', field: 'siphonRampMult', value: 1.06 }], note: 'Instinct to feed — +15% Biomass siphoned, +6% Gorge.' },
  ],
  hemophage: [
    { effects: [{ op: 'mul', field: 'siphonDrainMult', value: 1.1 }], note: 'Thirstier — +10% Biomass siphoned.' },
    { effects: [{ op: 'mul', field: 'siphonRampMult', value: 1.08 }], note: 'Faster feed — the beam gorges +8% faster.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'biomass', value: 2 } } }, { op: 'mul', field: 'siphonDrainMult', value: 1.06 }], note: 'Every kill bleeds — +2 biomass on EVERY kill.' },
    { effects: [{ op: 'mul', field: 'siphonDrainMult', value: 1.15 }], note: 'Hemorrhage — +15% Biomass siphoned.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.08 }, { op: 'mul', field: 'siphonDrainMult', value: 1.08 }], note: 'The hive gorges — +8% all biomass and +8% siphoned.' },
  ],
  // ════════════════ Resonance Coil cards (gated by owning the Coil) ════════════════
  // Modest permanent bumps (the base DRAFT effect carries the card's strength; upgrades are a gentle
  // permanent nudge that keeps the whole gene library within its calibrated ≤2.6× power band).
  harmonic_overload: [ // rare → 4
    { effects: [{ op: 'mul', field: 'coilRampMult', value: 1.039 }], note: 'Tighter tuning — +6% beam ramp.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.01 }], note: 'Sympathetic resonance — +3% tower damage.' },
    { effects: [{ op: 'mul', field: 'coilRampMult', value: 1.052 }], note: 'Runaway harmonics — +8% beam ramp.' },
    { effects: [{ op: 'add', field: 'coilBeamTargets', value: 1 }, { op: 'mul', field: 'coilRampMult', value: 1.032 }], note: 'Overtone SPLIT — the beam melts one more target, +5% ramp.' },
  ],
  prismatic_split: [ // epic → 4
    { effects: [{ op: 'mul', field: 'coilRampMult', value: 1.039 }], note: 'Refracted focus — +6% beam ramp.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.01 }], note: 'Brighter lattice — +3% tower damage.' },
    { effects: [{ op: 'mul', field: 'coilRampMult', value: 1.052 }], note: 'Deeper prism — +8% beam ramp.' },
    { effects: [{ op: 'add', field: 'coilBeamTargets', value: 1 }], note: 'FULL SPECTRUM — the beam forks to yet another target.' },
  ],

  // ════════════════ Progression-gated general cards ════════════════
  viral_bloom: [ // rare → 4
    { effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.039 }], note: 'Virulent strain — +6% Infection.' },
    { effects: [{ op: 'grant', grant: { kind: 'heroAttackStatus', status: 'Infection', amount: 1 } }, { op: 'mul', field: 'parasiteInfectionMult', value: 1.026 }], note: 'The hero carries it — hero hits apply Infection.' },
    { effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.052 }], note: 'Mutation drift — +8% Infection.' },
    { effects: [{ op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Infection', amount: 1, radius: 110 } } }, { op: 'mul', field: 'parasiteInfectionMult', value: 1.032 }], note: 'Second bloom — kills spread Infection wider.' },
  ],
  neural_overclock: [ // epic → 4
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.016 }], note: 'Overclocked synapses — +5% hero damage.' },
    { effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.96 }], note: 'Faster firing — a further −4% ability cooldown.' },
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.02 }], note: 'Neural surge — +6% hero damage.' },
    { effects: [{ op: 'add', field: 'heroCritChance', value: 0.04 }, { op: 'mul', field: 'heroCooldownMult', value: 0.96 }], note: 'Precision burst — +4% crit chance, −4% cooldown.' },
  ],
  siege_protocol: [ // rare → 4
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.052 }], note: 'Wider shells — +8% splash radius.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.01 }], note: 'Heavier payload — +3% tower damage.' },
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.052 }], note: 'Saturation spread — +8% splash radius.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.013 }, { op: 'mul', field: 'splashRadiusMult', value: 1.032 }], note: 'Total bombardment — +4% damage, +5% splash.' },
  ],
  overclocked_matrix: [ // epic → 4
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.013 }], note: 'Tighter cadence — +4% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.013 }], note: 'Denser output — +4% tower damage.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.016 }], note: 'Red-line matrix — +5% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.013 }, { op: 'mul', field: 'towerFireRateMult', value: 1.013 }], note: 'Overclock ascendant — +4% damage, +4% fire rate.' },
  ],
  unstable_genome: [ // legendary → 5
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.016 }], note: 'Volatile splice — +5% tower damage.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 2 }], note: 'Cracking chitin — +2 max Fracture stacks.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.02 }], note: 'Runaway mutation — +6% tower damage.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'Reactions CASCADE further — re-fire once more.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.02 }, { op: 'add', field: 'fractureBonusStacks', value: 2 }], note: 'GENOME UNBOUND — +6% damage, +2 max Fracture.' },
  ],

  // ── Expansion base pool (5, ungated) ──
  barbed_carapace: [ // common → 3
    { effects: [{ op: 'heroHp', value: 40 }, { op: 'add', field: 'heroThornsFrac', value: 0.04 }], note: 'Denser plating — +40 hero HP, +4% thorns.' },
    { effects: [{ op: 'add', field: 'heroThornsFrac', value: 0.05 }, { op: 'mul', field: 'heroHealingMult', value: 1.08 }], note: 'Reactive spines — +5% thorns, +8% healing received.' },
    { effects: [{ op: 'heroHp', value: 60 }, { op: 'add', field: 'heroThornsFrac', value: 0.05 }], note: 'Living bulwark — +60 hero HP, +5% thorns.' },
  ],
  concussive_rounds: [ // rare → 4
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Denser payload — +5% tower damage.' },
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.12 }, { op: 'mul', field: 'towerFireRateMult', value: 1.04 }], note: 'Wider burst — +12% splash, +4% fire rate.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Shaped charge — +6% tower damage.' },
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.15 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Overpressure — +15% splash, +5% tower damage.' },
  ],
  gestating_brood: [ // common → 3
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }], note: 'Fecund spores — +6% biomass.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }, { op: 'add', field: 'reactorOverchargeBonus', value: 0.08 }], note: 'Nutrient glut — +6% biomass, +0.08 reactor overcharge.' },
    { effects: [{ op: 'biomass', value: 200 }, { op: 'mul', field: 'biomassMult', value: 1.08 }], note: 'Bloom — 200 biomass now, +8% biomass income.' },
  ],
  corroded_fangs: [ // common → 3
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.08 }], note: 'Sharper acid — +8% Corrosion damage.' },
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.08 }, { op: 'add', field: 'corrosionSlowBonus', value: 0.06 }], note: 'Etching bite — +8% Corrosion, +6% slow.' },
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.1 }, { op: 'mul', field: 'parasiteInfectionMult', value: 1.08 }], note: 'Necrotic venom — +10% Corrosion, +8% Infection.' },
  ],
  tempered_instincts: [ // epic → 4
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.06 }], note: 'Honed strikes — +6% hero damage.' },
    { effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.94 }, { op: 'mul', field: 'heroAttackSpeedMult', value: 1.05 }], note: 'Fluid kata — −6% cooldown, +5% attack speed.' },
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.08 }], note: 'Killer focus — +8% hero damage.' },
    { effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.08 }, { op: 'mul', field: 'heroCooldownMult', value: 0.92 }], note: 'Apex tempo — +8% hero damage, −8% cooldown.' },
  ],

  // ── Expansion gated pool (5, unique gates) ──
  apex_swarm: [ // rare → 4
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }], note: 'Ravenous — +6% biomass.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.07 }, { op: 'add', field: 'sellRefundFrac', value: 0.03 }], note: 'Efficient reclaim — +7% biomass, +3% sell refund.' },
    { effects: [{ op: 'biomass', value: 200 }, { op: 'mul', field: 'biomassMult', value: 1.07 }], note: 'Swarm feast — 200 biomass now, +7% biomass income.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.08 }, { op: 'add', field: 'reactorOverchargeBonus', value: 0.1 }], note: 'Hive gorge — +8% biomass, +0.1 reactor overcharge.' },
  ],
  corrosive_deluge: [ // epic → 5
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.1 }], note: 'Caustic flood — +10% Corrosion damage.' },
    { effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.2 }, { op: 'mul', field: 'poolDpsMult', value: 1.05 }], note: 'Lingering mire — pools +20% longer, +5% Corrosion.' },
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.1 }, { op: 'add', field: 'corrosionSlowBonus', value: 0.08 }], note: 'Viscous acid — +10% Corrosion, +8% slow.' },
    { effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.12 }], note: 'Hyper-etchant — +12% Corrosion damage.' },
    { effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.25 }, { op: 'mul', field: 'poolDpsMult', value: 1.1 }], note: 'Deluge — pools +25% longer, +10% Corrosion.' },
  ],
  phalanx_protocol: [ // rare → 4
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }], note: 'Drilled cadence — +5% fire rate.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'Disciplined volley — +5% fire rate, +4% damage.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.06 }], note: 'Locked formation — +6% fire rate.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.06 }, { op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Shield wall — +6% fire rate, +5% damage.' },
  ],
  dread_resonance: [ // epic → 4
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.1 }], note: 'Deeper wail — +10% panic duration.' },
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.1 }, { op: 'mul', field: 'towerFireRateMult', value: 1.05 }], note: 'Terror cadence — +10% panic, +5% fire rate.' },
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.12 }], note: 'Soul-rattling — +12% panic duration.' },
    { effects: [{ op: 'mul', field: 'effigyDreadDurationMult', value: 1.12 }, { op: 'add', field: 'obeliskVulnerabilityBonus', value: 0.08 }], note: 'Broken minds — +12% panic; disrupted foes take +8%.' },
  ],
  singularity_core: [ // legendary → 5
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'Gravitic lensing — +6% tower damage.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }], note: 'Event horizon — status reactions re-fire once more.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }], note: 'Collapsing core — +8% tower damage.' },
    { effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.15 }, { op: 'mul', field: 'towerFireRateMult', value: 1.06 }], note: 'Accretion — +15% splash, +6% fire rate.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }, { op: 'mul', field: 'towerDamageMult', value: 1.08 }], note: 'SINGULARITY — reactions re-fire once more, +8% tower damage.' },
  ],

  // ════════════════ Expansion II gated pool (docs/CARDS.md §gates) — fresh scored axes ════════════════
  predator_instinct: [ // epic → 5
    { effects: [{ op: 'add', field: 'heroCritChance', value: 0.06 }], note: 'Killer’s eye — +6% crit chance.' },
    { effects: [{ op: 'add', field: 'heroCritDamageBonus', value: 0.15 }], note: 'Deeper cut — +15% crit damage.' },
    { effects: [{ op: 'add', field: 'heroCritChance', value: 0.06 }, { op: 'mul', field: 'heroAttackSpeedMult', value: 1.05 }], note: 'Bloodscent — +6% crit chance, +5% attack speed.' },
    { effects: [{ op: 'add', field: 'heroCritDamageBonus', value: 0.2 }], note: 'Rend — +20% crit damage.' },
    { effects: [{ op: 'add', field: 'heroCritChance', value: 0.05 }, { op: 'mul', field: 'heroDamageMult', value: 1.06 }], note: 'Apex hunter — +5% crit chance, +6% hero damage.' },
  ],
  entrenchment: [ // rare → 4
    { effects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.01 }], note: 'Deeper trench — +1% tower damage per empty slot.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Zeroed sights — +5% tower damage.' },
    { effects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.01 }], note: 'Hardpoints — +1% tower damage per empty slot.' },
    { effects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.01 }, { op: 'mul', field: 'towerFireRateMult', value: 1.05 }], note: 'Dug in — +1% per empty slot, +5% fire rate.' },
  ],
  vanguard_doctrine: [ // epic → 4
    { effects: [{ op: 'add', field: 'classResonanceBonus', value: 0.04 }], note: 'Shared drills — +4% class-resonance damage.' },
    { effects: [{ op: 'add', field: 'diversityBonus', value: 0.03 }], note: 'Combined arms — +3% damage per distinct class.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }], note: 'War college — +6% tower damage.' },
    { effects: [{ op: 'add', field: 'classResonanceBonus', value: 0.05 }, { op: 'add', field: 'diversityBonus', value: 0.03 }], note: 'Grand strategy — +5% resonance, +3% per class.' },
  ],
  second_wind: [ // rare → 4
    { effects: [{ op: 'add', field: 'heroArmor', value: 0.05 }], note: 'Scar tissue — +5% damage reduction.' },
    { effects: [{ op: 'mul', field: 'heroHealingMult', value: 1.1 }], note: 'Fast clotting — +10% healing received.' },
    { effects: [{ op: 'add', field: 'heroThornsFrac', value: 0.08 }], note: 'Barbed hide — reflect +8% of contact damage.' },
    { effects: [{ op: 'add', field: 'heroArmor', value: 0.05 }, { op: 'add', field: 'heroLifestealFrac', value: 0.05 }], note: 'Undying — +5% damage reduction, heal 5% of damage dealt.' },
  ],
  salvage_enzymes: [ // rare → 4
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }], note: 'Richer marrow — +6% biomass from kills.' },
    { effects: [{ op: 'add', field: 'sellRefundFrac', value: 0.03 }, { op: 'add', field: 'reactorOverchargeBonus', value: 0.08 }], note: 'Reclaimers — sell refunds +3%, +0.08 reactor overcharge.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }], note: 'Enzymatic bloom — +6% biomass from kills.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.05 }, { op: 'add', field: 'sellRefundFrac', value: 0.03 }], note: 'Total recycling — +5% biomass, sell refunds +3%.' },
  ],
  // ── Blight Sower signature set (docs/SOWER.md) ──
  mycelial_carpet: [ // rare → 4
    { effects: [{ op: 'mul', field: 'sowerBlastRadiusMult', value: 1.06 }], note: 'Creeping weave — +6% blast radius.' },
    { effects: [{ op: 'mul', field: 'sowerBlastRadiusMult', value: 1.06 }, { op: 'mul', field: 'towerDamageMult', value: 1.03 }], note: 'Dense mat — +6% radius, +3% tower damage.' },
    { effects: [{ op: 'mul', field: 'sowerBlastRadiusMult', value: 1.08 }], note: 'Field-spanning hyphae — +8% blast radius.' },
    { effects: [{ op: 'mul', field: 'sowerBlastRadiusMult', value: 1.08 }, { op: 'mul', field: 'poolDpsMult', value: 1.06 }], note: 'The carpet SEETHES — +8% radius, +6% Corrosion damage.' },
  ],
  seed_hoard: [ // epic → 4
    { effects: [{ op: 'add', field: 'sowerExtraMines', value: 1 }], note: 'Deeper cellar — +1 more armed mine.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.04 }], note: 'Eager germination — +4% tower fire rate.' },
    { effects: [{ op: 'mul', field: 'sowerBlastRadiusMult', value: 1.08 }], note: 'Fat seeds — +8% blast radius.' },
    { effects: [{ op: 'add', field: 'sowerExtraMines', value: 1 }], note: 'The hoard OVERFLOWS — +1 more armed mine.' },
  ],
  war_rhythm: [ // rare → 4
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.04 }], note: 'Quickening drums — +4% fire rate.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.04 }, { op: 'mul', field: 'towerDamageMult', value: 1.03 }], note: 'Marching cadence — +4% rate, +3% damage.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }], note: 'Battle tempo — +5% fire rate.' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'Total war — +5% rate, +4% damage.' },
  ],
  apex_hunger: [ // epic → 4
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.05 }], note: 'Sharper appetite — +5% biomass.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.05 }, { op: 'add', field: 'sellRefundFrac', value: 0.02 }], note: 'Waste nothing — +5% biomass, +2% sell refund.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Fed and lethal — +5% tower damage.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.07 }, { op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: 'The apex FEEDS — +7% biomass, +4% damage.' },
  ],
  trophy_takers: [ // legendary → 5
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.05 }], note: 'First trophies — +5% biomass.' },
    { effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }], note: 'Bone-splitting pride — +1 max Fracture stack.' },
    { effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }], note: 'Mounting spoils — +6% biomass.' },
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'Emboldened — +5% tower damage.' },
    { effects: [{ op: 'add', field: 'reactionRepeats', value: 1 }, { op: 'mul', field: 'biomassMult', value: 1.05 }], note: 'LEGENDS NOW — reactions re-fire once more, +5% biomass.' },
  ],
};
