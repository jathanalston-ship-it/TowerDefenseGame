// DAILY BIO-CACHE meta pipeline (docs/DAILY-LOGIN.md): once per UTC day, consecutive days
// compound the streak, a gap resets ONLY the multiplier (lifetime/best are permanent), the
// preview and the claim agree line-for-line, the record round-trips the sanitizer (forged
// future keys self-heal), and the identity surfaces (codex / Genome Rank / wardrobe) ride
// the lifetime count.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { defaultSave, parseImport, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

/** Push junk through the real import path (serialize → parse ⇒ sanitize). */
function sanitized(junk: unknown): SaveData {
  const back = parseImport(serializeExport(junk as SaveData));
  if (!back.ok) throw new Error('import refused');
  return back.data;
}
import { streakMult } from '../core/loginStreak';
import { collectionView } from '../core/collection';
import { collectionContextOf } from './meta';

/** A fixed UTC noon so every test drives its own calendar. */
const DAY0 = Date.UTC(2026, 5, 10, 12, 0, 0);
const day = (i: number): number => DAY0 + i * 86_400_000;
const keyOf = (t: number): string => new Date(t).toISOString().slice(0, 10);

function seed(over: Partial<ReturnType<typeof defaultSave>> = {}): void {
  const imported = meta.importText(serializeExport({ ...defaultSave(), ...over }));
  expect(imported.ok).toBe(true);
}

describe('the day gate — once per UTC day', () => {
  it('a fresh account is claimable at multiplier ×1; the claim records day 1', () => {
    seed();
    const v = meta.loginView(day(0));
    expect(v.claimable).toBe(true);
    expect(v.nextStreak).toBe(1);
    expect(v.mult).toBe(1);
    const receipt = meta.claimLogin(day(0));
    expect(receipt).not.toBeNull();
    expect(receipt!.streak).toBe(1);
    expect(receipt!.lifetime).toBe(1);
    expect(meta.get().login).toEqual({ last: keyOf(day(0)), streak: 1, best: 1, lifetime: 1 });
  });

  it('the SAME day refuses a second claim and moves nothing', () => {
    seed();
    expect(meta.claimLogin(day(0))).not.toBeNull();
    const before = meta.get();
    expect(meta.claimLogin(day(0))).toBeNull();
    expect(meta.get()).toBe(before); // not even a persist
  });

  it('the claim actually pays — the preview lines land as wallet/bank movement', () => {
    seed();
    const before = meta.get();
    const receipt = meta.claimLogin(day(0))!;
    const after = meta.get();
    expect(receipt.lines.length).toBeGreaterThan(0);
    // SOMETHING moved: any of the lanes the generator speaks.
    const moved =
      after.shards !== before.shards || after.geneEssence !== before.geneEssence
      || after.ichor !== before.ichor || after.pendingContainers.length !== before.pendingContainers.length
      || after.mats.mutagen !== before.mats.mutagen || after.mats.scrap !== before.mats.scrap
      || after.mats.catalyst !== before.mats.catalyst || after.battlePass.xp !== before.battlePass.xp
      || JSON.stringify(after.towerShards) !== JSON.stringify(before.towerShards)
      || JSON.stringify(after.heroShards) !== JSON.stringify(before.heroShards)
      || after.rushStamina.value !== before.rushStamina.value;
    expect(moved).toBe(true);
    expect(after.timeline.some((t) => t.label.includes('Daily Bio-Cache'))).toBe(true);
  });

  it('preview and claim agree line-for-line (one deterministic roll)', () => {
    seed();
    const preview = meta.loginView(day(0)).todayLines.map((l) => l.label);
    const receipt = meta.claimLogin(day(0))!;
    expect(receipt.lines.map((l) => l.label)).toEqual(preview);
    // And the post-claim view still shows the SAME bundle (the claimed day's roll).
    expect(meta.loginView(day(0)).todayLines.map((l) => l.label)).toEqual(preview);
  });
});

describe('the streak — compounds daily, breaks soft', () => {
  it('consecutive days extend the streak and raise the multiplier', () => {
    seed();
    meta.claimLogin(day(0));
    const r2 = meta.claimLogin(day(1))!;
    expect(r2.streak).toBe(2);
    expect(r2.mult).toBe(streakMult(2));
    const r3 = meta.claimLogin(day(2))!;
    expect(r3.streak).toBe(3);
    expect(r3.mult).toBeGreaterThan(r2.mult);
    expect(meta.get().login).toEqual({ last: keyOf(day(2)), streak: 3, best: 3, lifetime: 3 });
  });

  it('a missed day resets ONLY the multiplier — lifetime and best survive', () => {
    seed();
    meta.claimLogin(day(0));
    meta.claimLogin(day(1));
    meta.claimLogin(day(2)); // streak 3
    const r = meta.claimLogin(day(5))!; // two days missed
    expect(r.streak).toBe(1);
    expect(r.mult).toBe(1);
    expect(r.lifetime).toBe(4); // NEVER reset
    expect(r.best).toBe(3); // the watermark survives the break
    expect(meta.get().login.best).toBe(3);
  });

  it('the view telegraphs a lapsed streak before the claim', () => {
    seed();
    meta.claimLogin(day(0));
    const v = meta.loginView(day(4));
    expect(v.claimable).toBe(true);
    expect(v.nextStreak).toBe(1); // the next claim restarts
    expect(v.lifetime).toBe(1);
  });

  it('tomorrow preview pitches the compounding continuation', () => {
    seed();
    meta.claimLogin(day(0));
    const v = meta.loginView(day(0));
    expect(v.claimable).toBe(false);
    expect(v.tomorrow.mult).toBe(streakMult(2));
    expect(v.tomorrow.target).toBeGreaterThan(0);
    // Six straight days in → tomorrow is the day-7 RARE container tease.
    for (let i = 1; i < 6; i++) meta.claimLogin(day(i));
    expect(meta.loginView(day(5)).tomorrow.milestone).toBe('rare');
  });
});

describe('the record — sanitizer + self-healing clock', () => {
  it('round-trips through export/import', () => {
    seed();
    meta.claimLogin(day(0));
    meta.claimLogin(day(1));
    const blob = serializeExport(meta.get());
    const back = parseImport(blob);
    expect(back.ok && back.data.login).toEqual({ last: keyOf(day(1)), streak: 2, best: 2, lifetime: 2 });
  });

  it('folds junk to safe values (types, negatives, absurd calendar keys)', () => {
    const s = sanitized({
      ...defaultSave(),
      login: { last: '2027-99-99', streak: -5, best: 'x', lifetime: 3.9 },
    });
    expect(s.login.last).toBe(''); // regex-shaped but NOT a real day — dropped, cache stays live
    expect(s.login.streak).toBe(0);
    expect(s.login.best).toBe(0);
    expect(s.login.lifetime).toBe(3);
  });

  it('keeps best/lifetime honest against the live streak', () => {
    const s = sanitized({
      ...defaultSave(),
      login: { last: '2026-06-10', streak: 9, best: 2, lifetime: 4 },
    });
    expect(s.login.best).toBe(9); // watermark can never trail the live streak
    expect(s.login.lifetime).toBe(9);
  });

  it('a forged FUTURE key blocks today but self-heals by waiting', () => {
    seed({ login: { last: keyOf(day(2)), streak: 1, best: 1, lifetime: 1 } });
    expect(meta.loginView(day(0)).claimable).toBe(false);
    expect(meta.claimLogin(day(0))).toBeNull();
    expect(meta.loginView(day(3)).claimable).toBe(true); // the real calendar caught up
    expect(meta.claimLogin(day(3))).not.toBeNull();
  });
});

describe('identity surfaces ride the lifetime count', () => {
  it('the Devotion codex discovers milestones and NEVER regresses on a break', () => {
    seed();
    for (let i = 0; i < 7; i++) meta.claimLogin(day(i));
    let logins = collectionView(collectionContextOf(meta.get())).categories.find((c) => c.id === 'logins')!;
    expect(logins.entries.find((e) => e.id === 'login_7')!.tier).toBe(1);
    expect(logins.entries.find((e) => e.id === 'login_streak')!.tier).toBe(1); // best streak 7
    expect(logins.bonuses).toEqual([]); // zero-power codex — attendance never buys strength
    meta.claimLogin(day(9)); // break the streak
    logins = collectionView(collectionContextOf(meta.get())).categories.find((c) => c.id === 'logins')!;
    expect(logins.entries.find((e) => e.id === 'login_7')!.tier).toBe(1); // still answered
    expect(logins.entries.find((e) => e.id === 'login_streak')!.tier).toBe(1); // watermark held
  });

  it('a fresh save reads zero everywhere (golden-safe)', () => {
    const v = collectionView(collectionContextOf(defaultSave()));
    const logins = v.categories.find((c) => c.id === 'logins')!;
    expect(logins.completion).toBe(0);
    expect(logins.discovered).toBe(0);
  });

  it('Genome Rank credits the journey; the wardrobe pays the 7-day title', () => {
    seed();
    const rating0 = meta.genomeRank().rating;
    for (let i = 0; i < 7; i++) meta.claimLogin(day(i));
    expect(meta.genomeSnapshot().lifetimeLogins).toBe(7);
    expect(meta.genomeRank().rating).toBeGreaterThan(rating0);
    // v53 two-state: the devotion title lands UNCLAIMED in the Specimen Vault.
    expect(meta.get().wardrobe.granted).toContain('wd_title_the_devoted');
    expect(meta.get().wardrobe.inventory.some((i) => i.item === 'wd_title_the_devoted')).toBe(true);
  });
});
