# PREMIUM-ECONOMY-REPORT.md — the five-persona review

The final economy review required before shipping the Premium Store. Produced by the CI-gated
simulation `src/state/premiumEconomy.test.ts`: five spender personas play the **same 30 mid-game
days** (identical play income — ~3 runs/day: ~150 Cores, ~6 strain samples/tower, ~4 hero
shards/hero, ~25 essence daily), differ only in purchases, spend greedily through the **real** cost
ladders (stars, meta upgrades), and advance Campaign only when their **real** Power Score clears
the stage's recommended Power. Every number below is the simulation's output; the guardrails are
`expect()`s, so any future offer/pricing change that breaks the shape **fails CI**.

## Results (30 days, start = Campaign stage 8)

| Persona | Spend (30d) | Power Score | Campaign Stage | Ichor bank | Containers banked |
|---|---|---|---|---|---|
| Free-to-Play | $0.00 | 9,427 | 42 | 0 | 0 |
| Low ($7) | $6.98 | 9,427 | 42 | 170 | 1 |
| Medium (~$65) | $64.94 | 11,509 | 46 | 1,188 | 12 |
| High (~$105) | $104.91 | 11,577 | 47 | 1,985 | 20 |
| Whale (~$325) | $324.81 | 12,674 | 48 | 8,530 | 46 |

## Guardrails (enforced in CI)

- **Paying always feels rewarded** — each tier ends ≥ the tier below on Power *and* liquidity. ✓
- **F2P remains competitive** — 82% of the Medium spender's Power, 74% of the Whale's
  (floors: ≥75% / ≥60%). ✓
- **No broken PvE curve** — the Whale's Power lead is **×1.34** (ceiling ×1.6): a headstart on the
  same difficulty curve, never a different game. ✓
- **Campaign remains necessary** — the Whale finishes **6 stages** ahead (ceiling 6); every
  persona advanced 34+ stages through the same recommended-Power gates. Money accelerates
  *toward* gates; it cannot cross them (the star-cap preview honours the Evolution Cap). ✓
- **Prestige untouched** — purchased Cores never feed the Molt mint (safeguard test). ✓

## Findings

- **Expected purchase value.** Packs land ×1.44–×1.85 à-la-carte value (bounded ≤×3 by test);
  bundles honestly ladder 0%→60% bonus. Perceived value is strong without reward inflation —
  contents were RESHAPED to hit targets (the value calculator caught the first-draft rotating
  packs at ×0.56–×1.16 and they were re-tuned), never simply multiplied.
- **Progression acceleration.** Spending compresses time: the Medium spender reaches stage 46
  ~4 days before F2P does, primarily via earlier star purchases and upgrade levels. Nothing in
  any pack crosses a gate F2P doesn't also pass.
- **Economy impact.** The dominant spender surplus is **Ichor liquidity** (8.5k banked for a
  Whale) — it flows into the Splice Market's existing sinks whose loot still rolls normal odds,
  so rare drops keep their distribution. Legendary equipment remains a drop-only event.
- **Retention impact.** Healthy pacing preserved: the Evolution Cap keeps whales inside the
  campaign loop (their surplus shards WAIT at the cap — visible in Low/F2P power parity), the
  rotating pack is a once-per-day beat, and the daily/streak systems remain the primary habit
  loop. No pack removes a reason to play; most ADD reasons (containers → Vault, mats → Reforge).
- **Balance concerns.**
  1. *Low tier shows no Power delta at day 30* — its packs are early-QoL and the cap absorbs the
     shards; its real value is liquidity (170 Ichor, +1 container). Risk: a "$7 did nothing"
     feeling if the buyer only watches Power. **Recommendation:** surface the pack's Ichor/loot value in the
     receipt (done — the ceremony shows the worth line), and consider a small cosmetic in the
     Starter pack when cosmetics exist.
  2. *Whale Ichor pooling* (8.5k) — harmless today (sinks are odds-bounded), but when new Ichor
     sinks ship, re-run this simulation (it's CI — it re-runs itself) and watch the ×1.6 ceiling.
  3. *Rotating-pack FOMO* is deliberately mild (24h, re-appears every ~3 days). Keep it that way;
     do not shorten windows.
- **Recommendations.** (1) Ship at these prices. (2) Revisit `DAY_INCOME` constants if the live
  game's faucets drift >20% from the model. (3) When cosmetics land, bias future offers toward
  them — they monetize without touching this report at all. (4) Wire the real payment provider at
  the single checkout seam; keep `sandbox` receipts in dev builds.
