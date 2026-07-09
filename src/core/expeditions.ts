// HERO EXPEDITIONS (docs/EXPEDITIONS.md) — the idle lane: BENCHED heroes (owned but not
// fielded in the run loadout) go on real-time away-missions and come back carrying
// resources. Pure data + arithmetic here; meta owns the save ledger and the claims.
//
// TIME DISCIPLINE: durations are wall-clock milliseconds stored as absolute endsAt
// timestamps — offline-safe (nothing ticks; a claim just compares now to endsAt), and
// every meta API takes `now` for testability. The SIM never sees any of this.

export interface ExpeditionReward {
  cores: number; // Genome Cores
  essence: number; // Gene Essence
  mats: { mutagen: number; scrap: number; catalyst: number };
}

export interface ExpeditionDef {
  id: string;
  name: string;
  blurb: string;
  hours: number; // real-time length
  reward: ExpeditionReward; // BASE payout — scaled by the hero's stars at claim time
}

/** Three duration tiers — a session-length errand, an overnight, and a day-long haul.
 *  Rewards scale ~linearly with hours plus a patience premium on the long roads. */
export const EXPEDITION_DEFS: ExpeditionDef[] = [
  {
    id: 'exp_patrol', name: 'Perimeter Patrol', hours: 2,
    blurb: 'Sweep the near ruins for splice-worthy tissue. Quick, safe, modest.',
    reward: { cores: 30, essence: 40, mats: { mutagen: 2, scrap: 4, catalyst: 0 } },
  },
  {
    id: 'exp_harvest', name: 'Deep Harvest', hours: 6,
    blurb: 'Follow the vein-lines under the old city and bring back what still pulses.',
    reward: { cores: 110, essence: 150, mats: { mutagen: 8, scrap: 14, catalyst: 1 } },
  },
  {
    id: 'exp_relic', name: 'Relic Descent', hours: 12,
    blurb: 'A day in the dark. The deepest strata pay in catalyst and old genome.',
    reward: { cores: 260, essence: 340, mats: { mutagen: 18, scrap: 30, catalyst: 4 } },
  },
];

/** Concurrent away-missions the hive can support. */
export const EXPEDITION_SLOTS = 2;

export function expeditionById(id: string): ExpeditionDef | undefined {
  return EXPEDITION_DEFS.find((d) => d.id === id);
}

/** Star scaling: a decorated hero forages harder (+10%/star, from the CLAIM-time stars). */
export function scaleReward(base: ExpeditionReward, stars: number): ExpeditionReward {
  const m = 1 + 0.1 * Math.max(0, stars);
  return {
    cores: Math.round(base.cores * m),
    essence: Math.round(base.essence * m),
    mats: {
      mutagen: Math.round(base.mats.mutagen * m),
      scrap: Math.round(base.mats.scrap * m),
      catalyst: Math.round(base.mats.catalyst * m),
    },
  };
}
