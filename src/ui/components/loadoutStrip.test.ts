// Pre-run LoadoutStrip (docs/UI-STANDARDS.md §loadout): a read-only summary of what the next
// run fields, whose segments appear only once their system has revealed.

import { describe, expect, it } from 'vitest';
import { loadoutSummary } from './LoadoutStrip';
import { defaultSave, type SaveData } from '../../save/saveStore';
import { fieldedLoadout } from '../../state/meta';

const atStage = (stage: number): SaveData => {
  const s = defaultSave();
  return { ...s, campaign: { ...s.campaign, cleared: { standard: stage } } };
};

describe('loadoutSummary', () => {
  it('a fresh account shows only its fielded hero — gear and genes wait for their reveals', () => {
    const s = loadoutSummary(defaultSave(), 'none');
    expect(s.heroes).toEqual(fieldedLoadout(defaultSave()));
    expect(s.heroes.length).toBeGreaterThan(0);
    expect(s.gear).toBeNull();
    expect(s.genes).toBeNull();
  });

  it('a veteran sees gear slots per fielded hero and the gene loadout fill', () => {
    const base = atStage(30);
    const save: SaveData = { ...base, geneSlots: 3, geneLoadout: ['a', null, 'b', 'c', null] };
    const s = loadoutSummary(save, 'none');
    expect(s.gear).toEqual({ filled: 0, slots: s.heroes.length * 3 });
    expect(s.genes).toEqual({ filled: 2, slots: 3 }); // slot 4 lies beyond the unlocked 3
  });

  it('counts only equipped gear the account still owns', () => {
    const base = atStage(30);
    const hero = fieldedLoadout(base)[0];
    const item = { uid: 'u1' } as SaveData['equipment']['inventory'][number];
    const save: SaveData = {
      ...base,
      equipment: { inventory: [item], loadouts: { [hero]: { weapon: 'u1', armor: 'ghost', relic: null } } },
    };
    expect(loadoutSummary(save, 'none').gear?.filled).toBe(1);
  });

  it('a doctrine-less mode shows no doctrine; a picked doctrine is named', () => {
    expect(loadoutSummary(atStage(30), null).doctrine).toBeNull();
    const none = loadoutSummary(atStage(30), 'none').doctrine;
    expect(none?.id).toBe('none'); // a day-one doctrine exists → "No doctrine" is a real choice
    expect(loadoutSummary(defaultSave(), 'kinetic_doctrine_missing_id').doctrine?.id).toBe('none'); // unknown ids fall back to none
  });
});
