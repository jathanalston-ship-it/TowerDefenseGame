// Patch-note tracking (docs/CHANGELOG-PIPELINE.md): unseen releases derive from the
// save's seen pointer, marking seen collapses the queue, opt-out is permanent (and
// reversible), the sanitizer keeps the v28 field shaped, and the generated releases
// module only speaks the standard category vocabulary.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { RELEASES } from '../changelog/releases.gen';
import { NOTE_CATEGORIES } from '../changelog/types';
import { defaultSave, parseImport } from '../save/saveStore';

describe('patch notes tracking', () => {
  it('a never-seen save has every release unseen; marking seen empties the queue', () => {
    meta.reset();
    const v = meta.patchNotesView(RELEASES);
    expect(v.optOut).toBe(false);
    if (RELEASES.length > 0) {
      expect(v.latest?.id).toBe(RELEASES[0].id);
      expect(v.unseen.length).toBeGreaterThan(0);
      meta.markPatchNotesSeen(RELEASES);
      expect(meta.patchNotesView(RELEASES).unseen).toHaveLength(0);
      expect(meta.get().patchNotes.seen).toBe(RELEASES[0].id);
    }
  });

  it('opt-out survives and also marks the current release seen', () => {
    meta.reset();
    meta.setPatchNotesOptOut(true, RELEASES);
    expect(meta.patchNotesView(RELEASES).optOut).toBe(true);
    expect(meta.patchNotesView(RELEASES).unseen).toHaveLength(0);
    meta.setPatchNotesOptOut(false, RELEASES); // reversible in Settings
    expect(meta.patchNotesView(RELEASES).optOut).toBe(false);
  });

  it('sanitizer shapes junk patchNotes and deep-fills pre-v28 saves', () => {
    const bad = { ...defaultSave(), patchNotes: { seen: 12, optOut: 'yes' } } as unknown as Record<string, unknown>;
    const r = parseImport(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.patchNotes).toEqual({ seen: '', optOut: false });
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.patchNotes;
    const l = parseImport(JSON.stringify(legacy));
    expect(l.ok).toBe(true);
    if (l.ok) expect(l.data.patchNotes).toEqual({ seen: '', optOut: false });
  });

  it('generated releases are newest-first and use only standard categories', () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
    for (const r of RELEASES) {
      expect(r.id).toMatch(/^v\d{4}\.\d{2}\.\d{2}/);
      for (const e of r.entries) expect(NOTE_CATEGORIES).toContain(e.cat);
    }
  });
});
