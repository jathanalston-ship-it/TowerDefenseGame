# Battle Pass — the rotating season (docs/BATTLEPASS.md)

A production-grade dual-track season built ON TOP of the Wardrobe (docs/COSMETICS.md
§wardrobe). Core: `src/core/battlePass.ts` (pure — window math, XP curve, SeasonDefs,
derived reward tables). Meta: `src/state/meta.ts` (persistence, claims, purchases, XP
faucets, rollover). UI: `src/ui/BattlePassScreen.tsx` (nav `season`).

## Structure

- **100 levels, two tracks** (free + premium), one shared XP pool. **No empty levels** —
  `battlePass.test.ts` walks all 200 slots per season.
- **Rotation:** seasons swap every **14 days** from a fixed UTC epoch
  (`BP.epochMs`, 2026-07-06). `SEASONS` is a ring — unlimited future windows wrap it.
  The save keeps the **max window observed** (clock-tamper rule, Splice-Market pattern).
- **Rollover mail:** on window advance every EARNED-but-unclaimed level auto-claims
  (premium only if owned; the taste levels always) — progress is never lost, then the
  record resets for the incoming season.

## Launch seasons

| | s1 · Crimson Bloom ❁ | s2 · Abyssal Tide ≋ |
|---|---|---|
| Palette | `#ff4d6d` / `#ffd24d` | `#4de0c4` / `#9adfff` |
| Music re-voice | +1 root, 1.0×, bright 0.6 | −4 root, 0.92×, bright 0.3 |
| Level-100 crown | Apex Crown nucleus + **Bloombearer** title | Void Colossi mega variant + **Tidecaller** title |

## Progression (§xp)

`xpForLevel(n) = 320 + 6(n−1)` → **61,700 XP** for 100 levels. Faucets (meta):
runs (`kills×0.5 + wave×8 + boss×25 + mega×80 + win 120/loss 30 + stage×3 + daily-clear
200 + contract×150`), achievements (+150 each), expeditions (+40), Bio-Roulette collects
(+30). Archetypes pinned by `state/battlePassEconomy.test.ts`:
casual free (~2 wins/day) lands **~level 55–65**; a heavy player completes **by day
~9–10** of 14; premium + casual clears with a handful of level buys.

## Purchases & the ad lane

- **Level buy:** `15 + 2×⌊level/10⌋` Ichor per level (skipping everything costs ~2,400 —
  playing is always the better deal).
- **Ad advance:** one level per UTC day via the rewarded-ad provider
  (`ads/provider.ts` rules — player-initiated, menus only, hidden without a provider).
- **Premium:** **250 Ichor** in-game OR the store's `bp_premium` Season Pass SKU
  ($9.99 — same flag, two doors). *Rebalanced from the 1500 draft:* at the store's
  25 Ichor/$ anchor, 1500 Ichor would price Premium at ~$60; 250 lands on the industry-
  standard $10 pass and keeps the earn-it-F2P path honest.
- **Never self-funding:** total Ichor across BOTH tracks (≈90 free + ≈70 premium) is well
  under the 250 premium price — pinned by test. Completing a pass can never pay for the next.

## Tracks

- **Free** — progression-first filler cadence (containers every 10, run caches every 5,
  cores/essence/mats/ichor drip, scaled by level) + ~5 cosmetics + **5 permanent passives**
  (tiny: +1% biomass, +3% XP lanes, +0.5% damage) + the Level-100 **Perennial Bloom**:
  an infinitely-stackable +0.4% biomass per full completion (the ONLY thing that repeats).
- **Premium** — cosmetics-first: ~15 wardrobe exclusives + 5 phenotype grants +
  **10 permanent passives** (economy-ONLY levers — XP/loot/campaign/quality; no damage —
  the no-pay-to-win line, enforced by type and by `premium.test.ts` safeguards) + richer
  filler (tower/hero shards, premium containers). Levels **1 / 50 / 99 are free-claimable**
  by everyone (the taste of the paid lane). Level 100 is the season crown.
- **Permanents are once-EVER** (cross-season ledger `battlePass.permanents`); on repeat
  rotations their levels pay `BP.repeatReplacement` (15 Ichor + 120 Cores) instead. Owned
  cosmetics and exhausted phenotype families replace the same way.

## Authoring a future season (a CONTENT task)

1. Author its wardrobe items with `source: { kind: 'battlepass', season, level, track }`.
2. Add a `SeasonDef` row (id/name/palette/music/passive levels/phenotype levels) and its
   15 `PASS_PASSIVES` rows (prefix `bp<N>_f_` / `bp<N>_p_`).
3. Done — tables derive, validation pins every slot, the rotation ring picks it up.
   Holiday/collab/anniversary passes are the same three steps.
