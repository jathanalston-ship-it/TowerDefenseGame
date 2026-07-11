// Commander identity (docs/PROFILE.md §commissioning): the sigil registry, the founding-title
// oath, and the designation generator — plus the meta.commission settle (name + sigil + the
// ONE-TIME title grant in a single persist) and the profileSigil save round-trip.

import { describe, it, expect } from 'vitest';
import { FOUNDING_TITLES, SIGILS, designationTag, displayCommanderName, foundingTitleName, sigilById, sigilRegistry, suggestCommanderName } from './identity';
import { meta, sanitizeCommanderName } from '../state/meta';
import { titleName } from '../state/profile';
import { defaultSave, serializeExport, DEFAULT_PROFILE_NAME } from '../save/saveStore';

describe('sigils — the mark worn beside the name', () => {
  it('the registry validates and every sigil is complete + unique', () => {
    expect(sigilRegistry.validate()).toEqual([]);
    expect(SIGILS.length).toBeGreaterThanOrEqual(10); // a real choice, not a token one
    expect(new Set(SIGILS.map((s) => s.id)).size).toBe(SIGILS.length);
  });

  it('sigilById resolves rows and refuses the rest', () => {
    expect(sigilById('hive')?.glyph).toBe('⬡');
    expect(sigilById(null)).toBeNull();
    expect(sigilById(undefined)).toBeNull();
    expect(sigilById('no_such_sigil')).toBeNull();
  });
});

describe('founding titles — the one-time oath', () => {
  it('exactly three roads, all resolvable through the shared titleName chain', () => {
    expect(FOUNDING_TITLES).toHaveLength(3);
    for (const f of FOUNDING_TITLES) {
      expect(f.id.startsWith('found_')).toBe(true);
      expect(foundingTitleName(f.id)).toBe(f.name);
      expect(titleName(f.id)).toBe(f.name); // the equipped-title slot renders it everywhere
    }
    expect(foundingTitleName('not_a_title')).toBeNull();
  });
});

describe('designation tags — the duplicate-name system', () => {
  it('is deterministic, 4 digits, and never 0000', () => {
    const a = designationTag('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    expect(a).toBe(designationTag('3f2504e0-4f89-11d3-9a0c-0305e82c3301'));
    for (let i = 0; i < 500; i++) {
      const tag = designationTag(`player-${i}-${i * 7919}`);
      expect(tag).toMatch(/^\d{4}$/);
      expect(tag).not.toBe('0000'); // 1..9999 — a register number always reads as REAL
    }
  });

  it('two same-named commanders almost surely read apart (the whole point)', () => {
    const tags = new Set<string>();
    for (let i = 0; i < 50; i++) tags.add(designationTag(crypto.randomUUID()));
    expect(tags.size).toBeGreaterThan(45); // ~50 draws over 9999 values — collisions are rare
  });

  it('displayCommanderName composes the full identity (and degrades without a tag)', () => {
    expect(displayCommanderName('Marrowthorn', '0421')).toBe('Marrowthorn #0421');
    expect(displayCommanderName('Marrowthorn', null)).toBe('Marrowthorn');
    expect(displayCommanderName('Marrowthorn')).toBe('Marrowthorn');
  });
});

describe('the designation generator', () => {
  it('every suggestion survives the server-mirrored sanitizer unchanged', () => {
    for (let i = 0; i < 200; i++) {
      const name = suggestCommanderName();
      expect(sanitizeCommanderName(name)).toBe(name);
      expect(name.length).toBeLessThanOrEqual(20);
    }
  });
  it('is deterministic under a fixed rng (tests + previews)', () => {
    expect(suggestCommanderName(() => 0.5)).toBe(suggestCommanderName(() => 0.5));
  });
});

describe('meta.commission — the ceremony settle', () => {
  const seed = (): void => {
    const r = meta.importText(serializeExport(defaultSave()));
    expect(r.ok).toBe(true);
  };

  it('settles name + sigil + the chosen founding title in one call', () => {
    seed();
    meta.commission({ name: 'Marrowthorn', sigilId: 'apex', titleId: 'found_survivor' });
    const s = meta.get();
    expect(s.profileName).toBe('Marrowthorn');
    expect(s.profileSigil).toBe('apex');
    expect(s.unlockedTitles).toContain('found_survivor');
    expect(s.equippedTitle).toBe('found_survivor');
  });

  it('the oath is ONE-TIME: a second founding title is never granted', () => {
    seed();
    meta.commission({ titleId: 'found_survivor' });
    meta.commission({ titleId: 'found_witness' }); // the road not taken stays untaken
    const s = meta.get();
    expect(s.unlockedTitles).toContain('found_survivor');
    expect(s.unlockedTitles).not.toContain('found_witness');
  });

  it('every part is optional and junk never lands', () => {
    seed();
    meta.commission({ name: 'x', sigilId: 'not_real', titleId: 'not_real' }); // name too short, junk ids
    const s = meta.get();
    expect(s.profileName).toBe(DEFAULT_PROFILE_NAME);
    expect(s.profileSigil).toBeNull();
    expect(s.unlockedTitles).toHaveLength(0);
    meta.commission({ sigilId: 'veil' }); // sigil alone is a valid commissioning
    expect(meta.get().profileSigil).toBe('veil');
    meta.setProfileSigil(null); // and freely removable later (unlike the oath)
    expect(meta.get().profileSigil).toBeNull();
  });

  it('profileSigil round-trips the save pipeline (export → import keeps it; junk sanitizes)', () => {
    seed();
    meta.commission({ sigilId: 'bloom' });
    const r = meta.importText(serializeExport(meta.get()));
    expect(r.ok).toBe(true);
    expect(meta.get().profileSigil).toBe('bloom');
    const tampered = { ...defaultSave(), profileSigil: 42 } as unknown as ReturnType<typeof defaultSave>;
    const r2 = meta.importText(serializeExport(tampered));
    expect(r2.ok).toBe(true);
    expect(meta.get().profileSigil).toBeNull(); // non-string junk → null
  });
});
