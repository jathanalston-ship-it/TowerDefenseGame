// Live-event meta wiring (docs/LIVE-EVENTS.md §6): challenge crediting through the ONE
// quest judge (creditQuests front-runs creditEventChallenges — every credit seam pays event
// tokens for free), window-scoped ledger sanitizing on load (stale windows PRUNE — the
// disappearance IS the anti-inflation), threshold milestone claims (tokens are the ladder,
// never spent), the finite-stock shop sink, and the lane-mod fold half.
//
// The rotation is pure calendar math over the real clock, so every expectation here DERIVES
// from activeLiveEvents(now) instead of naming events — the suite stays green forever as the
// rings turn.

import { beforeEach, describe, expect, it } from 'vitest';
import { meta } from './meta';
import { notifications } from './notifications';
import './notificationSources';
import { activeLiveEvents, eventTrack, liveEventLaneMods, liveEventLaneModsNow, rowLedgerKey } from '../core/liveEvents';
import { missionCredit } from '../core/quests';
import type { QuestRunFacts } from '../core/quests';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

beforeEach(() => meta.reset());

const NOW = Date.now();
const trio = activeLiveEvents(NOW);

/** A heavy settled run — enough to move (and usually complete) run-verb challenges. */
const heavyRun = (): { type: 'run'; facts: QuestRunFacts } => ({
  type: 'run',
  facts: {
    mode: 'stage', won: true, wave: 60, kills: 5000, cardsDrafted: 12, integrityLost: 0,
    towerBuilds: { needle: 6 }, heroId: 'myco', bossKills: 40, megaKills: 6,
  },
});

/** Inject an arbitrary save through the REAL import path (parseImport → sanitizers). */
function inject(mutate: (s: SaveData) => SaveData): void {
  const result = meta.importText(serializeExport(mutate(defaultSave())));
  expect(result.ok).toBe(true);
}

describe('challenge crediting (the creditQuests seam)', () => {
  it('a settled run credits every active event challenge by the SAME judged vocabulary', () => {
    const ev = heavyRun();
    meta.creditQuests(ev, NOW);
    const le = meta.get().liveEvents;
    for (const a of trio) {
      if (!a.def.currency || !a.def.challenges) continue;
      for (const ch of a.def.challenges) {
        const expected = Math.min(ch.target, missionCredit(ch.cond, ev));
        expect(le.progress[a.key]?.[ch.id] ?? 0).toBe(expected);
      }
    }
  });

  it('crossing a challenge target banks its tokens — capped at the wallet', () => {
    const ev = heavyRun();
    meta.creditQuests(ev, NOW);
    const le = meta.get().liveEvents;
    for (const a of trio) {
      const cur = a.def.currency;
      if (!cur || !a.def.challenges) continue;
      const minted = a.def.challenges.reduce(
        (n, ch) => n + (missionCredit(ch.cond, ev) >= ch.target ? ch.tokens : 0), 0);
      expect(le.tokens[a.key] ?? 0).toBe(Math.min(cur.cap, minted));
    }
    // Belt and braces: minting must be REACHABLE in every rotation alignment. One heavy run
    // is not always enough (alignments exist where every live challenge is a multi-run
    // counter — e.g. deep_current's "8 runs"), so drive exactly as many runs as the easiest
    // authored challenge needs. An alignment no amount of running can mint in is an
    // authoring bug this line is meant to catch.
    const runsNeeded = Math.min(...trio.flatMap((a) =>
      (a.def.currency && a.def.challenges ? a.def.challenges : [])
        .map((ch) => { const per = missionCredit(ch.cond, ev); return per > 0 ? Math.ceil(ch.target / per) : Infinity; })));
    expect(runsNeeded).toBeLessThanOrEqual(64);
    for (let r = 1; r < runsNeeded; r++) meta.creditQuests(heavyRun(), NOW);
    expect(Object.values(meta.get().liveEvents.tokens).some((n) => n > 0)).toBe(true);
  });

  it('progress is monotonic and target-clamped across repeat runs', () => {
    meta.creditQuests(heavyRun(), NOW);
    const first = meta.get().liveEvents;
    meta.creditQuests(heavyRun(), NOW);
    const second = meta.get().liveEvents;
    for (const a of trio) {
      for (const ch of a.def.challenges ?? []) {
        const p1 = first.progress[a.key]?.[ch.id] ?? 0;
        const p2 = second.progress[a.key]?.[ch.id] ?? 0;
        expect(p2).toBeGreaterThanOrEqual(p1);
        expect(p2).toBeLessThanOrEqual(ch.target);
      }
      // A completed challenge never re-mints: tokens only grow while targets are crossed.
      const cur = a.def.currency;
      if (cur) expect(second.tokens[a.key] ?? 0).toBeLessThanOrEqual(cur.cap);
    }
  });
});

describe('save sanitizer (window-scoped ledgers)', () => {
  it('stale windows prune; live windows clamp to cap/target/stock', () => {
    const a = trio.find((x) => x.def.currency && x.def.challenges)!;
    const cur = a.def.currency!;
    const ch = a.def.challenges![0];
    const staleKey = `${a.def.id}:${a.window + 999}`; // same event, dead window
    inject((s) => ({
      ...s,
      liveEvents: {
        tokens: { [a.key]: cur.cap + 50, [staleKey]: 30, garbage: 10 },
        claimed: { [a.key]: [eventTrack(a.def)[0].at, 123456, eventTrack(a.def)[0].at] },
        progress: { [a.key]: { [ch.id]: ch.target + 99, bogus: 5 } },
        shopBought: a.def.shop ? { [a.key]: { [a.def.shop[0].id]: a.def.shop[0].stock + 7 } } : {},
        lifetimeBought: { 'retired_event:sig_row': 3 },
      },
    }));
    const le = meta.get().liveEvents;
    expect(le.tokens[a.key]).toBe(cur.cap); // clamped
    expect(le.tokens[staleKey]).toBeUndefined(); // pruned — the currency stopped existing
    expect(le.tokens.garbage).toBeUndefined();
    expect(le.claimed[a.key]).toEqual([eventTrack(a.def)[0].at]); // deduped, invalid at dropped
    expect(le.progress[a.key]).toEqual({ [ch.id]: ch.target }); // clamped, bogus id dropped
    if (a.def.shop) expect(le.shopBought[a.key]).toEqual({ [a.def.shop[0].id]: a.def.shop[0].stock });
    // lifetimeBought is the ONE ledger that survives every rotation — a retired event's
    // signature purchase must still block the re-buy when the event returns next year.
    expect(le.lifetimeBought['retired_event:sig_row']).toBe(3);
  });
});

describe('milestone claims (threshold — tokens are the ladder, not spent)', () => {
  const a = trio.find((x) => x.def.currency)!;
  const track = eventTrack(a.def);

  it('claims at threshold, pays, records — and never double-pays', () => {
    inject((s) => ({ ...s, liveEvents: { ...s.liveEvents, tokens: { [a.key]: track[0].at } } }));
    const before = meta.get();
    const lines = meta.claimEventMilestone(a.key, track[0].at, NOW);
    expect(lines).not.toBeNull();
    const after = meta.get();
    expect(after.liveEvents.claimed[a.key]).toContain(track[0].at);
    expect(after.liveEvents.tokens[a.key]).toBe(before.liveEvents.tokens[a.key]); // NOT spent
    expect(meta.claimEventMilestone(a.key, track[0].at, NOW)).toBeNull(); // once
  });

  it('refuses under-threshold, unknown milestones, and dead windows', () => {
    inject((s) => ({ ...s, liveEvents: { ...s.liveEvents, tokens: { [a.key]: Math.max(0, track[0].at - 1) } } }));
    expect(meta.claimEventMilestone(a.key, track[0].at, NOW)).toBeNull(); // short of the bar
    expect(meta.claimEventMilestone(a.key, 987654, NOW)).toBeNull(); // no such milestone
    expect(meta.claimEventMilestone(`${a.def.id}:${a.window + 1}`, track[0].at, NOW)).toBeNull(); // not live
  });
});

describe('event shop (the token sink)', () => {
  const a = trio.find((x) => x.def.currency && x.def.shop?.some((r) => !r.limit));

  it('spends the bank, counts stock, and sells out', () => {
    if (!a) return; // every event ships window rows — some rotation alignment could go shopless
    const row = a.def.shop!.find((r) => !r.limit)!; // plain window row (shop[0] is the lifetime signature)
    const bank = row.costTokens * (row.stock + 1);
    const cap = a.def.currency!.cap;
    inject((s) => ({ ...s, liveEvents: { ...s.liveEvents, tokens: { [a.key]: Math.min(cap, bank) } } }));
    let bought = 0;
    while (meta.buyEventShopRow(a.key, row.id, NOW) !== null) bought++;
    const le = meta.get().liveEvents;
    const affordable = Math.floor(Math.min(cap, bank) / row.costTokens);
    expect(bought).toBe(Math.min(row.stock, affordable)); // stock OR wallet stops the spree
    expect(le.shopBought[a.key]?.[row.id]).toBe(bought);
    expect(le.tokens[a.key]).toBe(Math.min(cap, bank) - bought * row.costTokens);
    expect(meta.buyEventShopRow(a.key, 'no_such_row', NOW)).toBeNull();
  });
});

describe('purchase limits (the v52 vocabulary — docs/LIVE-EVENTS.md §shops)', () => {
  it('lifetime rows write the forever ledger, never the windowed table, and refuse a re-buy', () => {
    // Every authored event leads with a lifetime signature row, so the trio always has one.
    const a = trio.find((x) => x.def.currency && x.def.shop?.some((r) => r.limit === 'lifetime'))!;
    const row = a.def.shop!.find((r) => r.limit === 'lifetime')!;
    inject((s) => ({ ...s, liveEvents: { ...s.liveEvents, tokens: { [a.key]: a.def.currency!.cap } } }));
    expect(meta.buyEventShopRow(a.key, row.id, NOW)).not.toBeNull();
    const le = meta.get().liveEvents;
    expect(le.lifetimeBought[`${a.def.id}:${row.id}`]).toBe(1);
    expect(le.shopBought[a.key]?.[row.id]).toBeUndefined(); // the windowed table stays clean
    expect(meta.buyEventShopRow(a.key, row.id, NOW)).toBeNull(); // once EVER — tokens remain
    expect(meta.get().liveEvents.tokens[a.key]).toBe(a.def.currency!.cap - row.costTokens);
  });

  it('a prior-window lifetime purchase (injected ledger) blocks the buy on event return', () => {
    const a = trio.find((x) => x.def.currency && x.def.shop?.some((r) => r.limit === 'lifetime'))!;
    const row = a.def.shop!.find((r) => r.limit === 'lifetime')!;
    inject((s) => ({
      ...s,
      liveEvents: {
        ...s.liveEvents,
        tokens: { [a.key]: a.def.currency!.cap },
        lifetimeBought: { [`${a.def.id}:${row.id}`]: 1 }, // bought during a PAST window
      },
    }));
    expect(meta.buyEventShopRow(a.key, row.id, NOW)).toBeNull();
  });

  it('daily/weekly rows count under composite period keys (window pruning retires them)', () => {
    const a = trio.find((x) => x.def.currency && x.def.shop?.some((r) => r.limit === 'daily' || r.limit === 'weekly'));
    if (!a) return; // today every medium ships a daily and every major a weekly — belt and braces
    const row = a.def.shop!.find((r) => r.limit === 'daily' || r.limit === 'weekly')!;
    inject((s) => ({ ...s, liveEvents: { ...s.liveEvents, tokens: { [a.key]: a.def.currency!.cap } } }));
    let bought = 0;
    while (meta.buyEventShopRow(a.key, row.id, NOW) !== null) bought++;
    expect(bought).toBe(row.stock); // caps out the PERIOD stock…
    const key = rowLedgerKey(row, NOW);
    expect(key).toContain('@'); // …under a composite `rowId@period` key
    const le = meta.get().liveEvents;
    expect(le.shopBought[a.key]?.[key]).toBe(bought);
    expect(le.shopBought[a.key]?.[row.id]).toBeUndefined();
  });

  it('a bpXp rider feeds the season lane and stamps the receipt', () => {
    const a = trio.find((x) => x.def.currency && x.def.shop?.some((r) => r.bpXp));
    if (!a) return; // both majors carry a Season-Infusion row, and one major is always live
    const row = a.def.shop!.find((r) => r.bpXp)!;
    inject((s) => ({ ...s, liveEvents: { ...s.liveEvents, tokens: { [a.key]: a.def.currency!.cap } } }));
    const xpBefore = meta.get().battlePass.xp;
    const lines = meta.buyEventShopRow(a.key, row.id, NOW);
    expect(lines).not.toBeNull();
    expect(lines!.some((l) => l.label === `+${row.bpXp} Season XP`)).toBe(true);
    expect(meta.get().battlePass.xp).toBe(xpBefore + row.bpXp!);
  });
});

describe('lane mods + notifications', () => {
  it('liveEventLaneMods is the product of the active trio (×1 baseline)', () => {
    const m = liveEventLaneMods(NOW);
    for (const k of Object.keys(m) as (keyof typeof m)[]) {
      let want = 1;
      for (const a of trio) want *= a.def.mods?.[k] ?? 1;
      expect(m[k]).toBeCloseTo(want, 12);
      expect(m[k]).toBeGreaterThan(0);
    }
  });

  it('the meta-consumed fold is NEUTRAL under tests (the liveops FIXED_TEST_NOW convention)', () => {
    // The trio is ALWAYS live — no lane-quiet date exists — so loot/economy assertions stay
    // date-independent only because the consumption-site fold pins to ×1 in test mode.
    for (const v of Object.values(liveEventLaneModsNow())) expect(v).toBe(1);
  });

  it('claimable milestones light the home channel (the Ready Chain feed)', () => {
    const a = trio.find((x) => x.def.currency)!;
    inject((s) => ({ ...s, liveEvents: { ...s.liveEvents, tokens: { [a.key]: eventTrack(a.def)[0].at } } }));
    expect(notifications.live(meta.get()).home?.count ?? 0).toBeGreaterThanOrEqual(1);
  });
});
