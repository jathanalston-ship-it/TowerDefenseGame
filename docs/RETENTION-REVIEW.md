# RETENTION-REVIEW.md — Gameplay-Loop Anticipation & Reward Audit

A Senior-Systems-Designer pass over the live loop, scoring each system's
**anticipation** (the wind-up — "something good is coming") and **reward** (the
release — "I got it"), flagging where excitement **drops**, and recommending
**low-complexity** fixes that pull players toward **"one more run."**

> **Design lens.** Retention is a chain of *anticipation → reward → new
> anticipation*. A loop leaks players wherever an anticipation has **no release**
> (you wind up and nothing pays off) or a reward has **no next hook** (you cash out
> and there's nothing to chase). The fixes below target exactly those breaks,
> cheaply.

---

## 1. System-by-system audit

| System | Anticipation | Reward | Status | Verdict |
|---|---|---|---|---|
| **Combat** | enemy tells, SHRED set-ups, elite halos | SHRED bursts, kills (biomass + loot), elite bounty | ✅ | **Strong.** Moment-to-moment payoff is good. |
| **Wave pacing** | auto-start countdown, **incoming preview**, boss telegraph | wave cleared | ✅ | **Strong.** The preview is a real wind-up. |
| **Build Phase** | countdown ring, banner, summary | "wave cleared" beat, early-start bonus | ✅ | **Good.** Satisfying transition. |
| **Loot Meter** | a forever bar visibly filling | fills → awards a box | ✅ | **Good earn-side, weak juice** → Part 2. |
| **Loot Boxes** | "I'm close to a box!" | — a box is **banked, then nothing** | 🟡 | **❌ BROKEN PAYOFF — top priority.** |
| **Cards** | 1-of-3 draft: "what will I get?" | a new run power | ✅ | **Strong** within a run. |
| **Permanent Progression** | saving toward the next node | power growth, all 4 tracks | ✅ | **Good** mid/long term. |
| **Mastery (track)** | next Mastery node | tempo/utility | 🟡 | Works, but the *infinite* mastery ramp is designed-only. |
| **Stars** | — | — | ⚪ | **Not built** — a whole anticipation axis is missing (designed). |
| **Equipment (track)** | next relic node | defensive power | 🟡 | Works; *hero gear chase* is designed-only. |
| **Hero Progression** | one damage upgrade | hero power | 🟡 | Thin — hero stars/mastery/gear designed-only. |

---

## 2. Where excitement drops (ranked by impact)

1. **Loot Boxes have no release (the biggest leak).** The Loot Meter builds
   anticipation beautifully — then filling it **just increments a counter**. The
   player wound up with nothing to open. This is a textbook broken loop:
   anticipation with no reward, and therefore no "I want another box" hook.
2. **Run-end → menu has no forward pull.** Results lists what you *earned*; it
   never says what you're *about to* earn. The single best "one more run" trigger —
   "you're 80% to your next box (and it's **Rare**)" — is absent.
3. **The Loot Meter is visually passive.** It fills, but it doesn't *invite the
   glance* that turns a background bar into an anticipation engine (Part 2).
4. **Long-term axes are missing (Stars / hero gear / infinite mastery).** These are
   the designed forever-chases; their absence caps the deep-retention ceiling. **Out
   of scope here** (they're large systems) — noted for the roadmap, not this pass.

---

## 3. Recommendations & what this pass implements

**Implemented now (low complexity, high "one-more-run" leverage):**

- **R1 — Openable Loot Boxes with rarity + reward (closes the #1 leak).** A box now
  has a **rarity** (Common / Rare / Epic) that is *deterministic by its earned index*
  (every 5th = Rare, every 25th = Epic) — so it is **previewable**, which is what
  makes the meter anticipatory ("the next box is **Rare**!"). Opening a box reveals a
  **currency cache** scaled by rarity (Shards / + Essence / + Components), feeding the
  upgrade tracks → *spend it → get stronger → one more run.* Reuses existing
  currencies and the rarity palette — **no new economy.**
- **R2 — Forward-pull nudge at run end + on the menu.** Results now shows **"loot box
  ready — open it"** when boxes are banked, and **"N% to your next box (rarity)"** as a
  pull. The menu meter carries the same preview. This converts the cash-out screen
  into a *next-goal* screen.
- **R3 — Loot Meter as a showcase UI (Part 2).** Fill animation, completion-approaching
  glow, rarity accents, milestone pulses, a completion burst, a subtle idle pulse, and
  a next-box preview — so the player *glances often*, and every glance builds
  anticipation. (Clutter-controlled: one accent colour, subtle idle, one-shot bursts.)

**Recommended, deferred (would significantly increase complexity — roadmap, not now):**

- Per-tower / per-hero **Star** ladders (the "unlock a mechanic" chase).
- **Hero gear** drops as loot-box contents (turns boxes into a build engine).
- **Infinite mastery** milestone perks (the forever background ramp).

The throughline of this pass: **make the loot loop pay off and pull.** It is the
cheapest, highest-leverage retention surface the game has today, and both the broken
payoff (R1) and the missing forward-pull (R2) live there.
