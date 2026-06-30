# DEV-RESET.md — Developer Reset utility

A **development/testing-only** Settings panel to wipe save data at any granularity. Every
reset produces a **valid, current-version, checksummed** save — never an orphaned reference
or a corrupt state. Documented before implementation per the brief.

---

## 1. Access & safety

- **Where:** Settings → a new **Developer Tools** section (`ui/DevTools.tsx`), rendered by
  `Hub`'s `SettingsScreen`.
- **Gated:** shown openly only when `import.meta.env.DEV` (a `npm run dev` build) **or** the
  debug opt-in is enabled (`isDebugEnabled()`, the `?debug` flag). In a plain production build
  it is hidden behind an **explicit reveal** — a warning + "I understand, show Developer Tools"
  button — so it can never be triggered by accident.
- **Per-action safety (all resets):** a confirm dialog shows the exact warning (what will be
  erased) and a text input; the destructive button stays **disabled until the player types
  `RESET`** exactly. Click-away / ESC cancels.

---

## 2. The reset model — version-safe by construction

The save is a versioned, checksummed blob (`saveStore.ts`): `persist(next)` writes it via
`SaveStore.save`, which re-stamps `CURRENT_VERSION` and recomputes the checksum, and updates the
live in-memory store so the UI reflects the wipe immediately.

**Every granular reset is `persist({ ...currentSave, <slice>: defaultSave().<slice> })`.** Using
`defaultSave()`'s value for each slice guarantees the field is well-formed and complete; the rest
of the save is carried unchanged. Because the result is a real `SaveData` round-tripped through
`SaveStore.save` at `CURRENT_VERSION`, **version compatibility is preserved automatically** and
no migration is needed.

**No orphaned references:** each reset replaces *whole, coherent sub-objects* with defaults. The
one cross-reference risk — `equipment.loadout` slots pointing at inventory `uid`s — is avoided by
resetting the entire `equipment` object (inventory **and** loadout) together. Other id references
(`towerForks` option ids, `heroFavEquip` defIds, `selectedHero`) all resolve defensively in
`withDefaults`/the registries, so a partial reset can never dangle.

The pure transform lives in `state/devReset.ts` (`applyDevReset(save, id) → SaveData`), data-driven
over a `DEV_RESETS` catalog so the UI renders generically and a new scope is one row.

---

## 3. Scopes (the 13 options) → save fields cleared

`d = defaultSave()`. Currency mapping (docs: `currencies.ts`): Genome Cores ⇒ `shards`,
Ascendant Cells ⇒ `prestige.cells`, Tower/Hero Shards ⇒ tower/hero progress.

| Option | Fields reset to default | Notes |
|---|---|---|
| **Reset EVERYTHING** | the whole save **+ all backups + prefs/flags** | factory-fresh: wipes localStorage (`assimilate.*`, `audioOn`) too |
| **Reset Save Data** | the whole save (`defaultSave()`) | keeps backups + prefs |
| **Reset Campaign** | `campaign` | clears highest-cleared-stage per difficulty |
| **Reset Infinite Records** | `bestWave` | the endless depth record |
| **Reset Currency** | `shards`, `lifetimeShards`, `mats` | the Genome-Core wallet + crafting mats |
| **Reset Tower Progress** | `towerStars`, `towerForks`, `towerShards`, `towerKills` | NOT mastery |
| **Reset Hero Progress** | `heroStars`, `heroShards`, `heroKills`, `heroFavEquip`, `selectedHero` | NOT mastery |
| **Reset Equipment** | `equipment` | inventory **and** loadout together (no orphan) |
| **Reset Loot Boxes** | `lootQueue`, `pendingContainers` | queue + unopened containers |
| **Reset Achievements** | `achievements` | unlocked achievement ids |
| **Reset Statistics** | `stats`, `totalRuns`, `cardsSeen` | lifetime stats + run counters |
| **Reset Mastery** | `towerMasteryXp`, `heroMasteryXp`, `unlockedTitles`, `equippedTitle`, `unlockedLore` | mastery XP + the identity it earns |
| **Reset Ascension** | `prestige` | Ascendant Cells, Molts, Ascendant-Tree nodes |

`upgrades` (Genome-Core shop purchases) and `bossesSlain` (bestiary) are intentionally only
cleared by **Save Data / EVERYTHING** — they aren't one of the listed granular scopes.

### EVERYTHING — the storage wipe
Beyond `persist(defaultSave())`, EVERYTHING also: `SaveStore.wipeAll()` (removes the main save,
every backup, and the backup index via the injected storage — testable) and clears the known
preference/flag keys (`audioOn`, `assimilate.autogene`, `assimilate.debug`, `assimilate.autostart`).
The result is indistinguishable from a first-ever launch.

---

## 4. Determinism, testing, limitations
- Pure `applyDevReset` is unit-tested per scope: each clears its slice to the default, leaves
  every other field byte-identical, and the result passes the save round-trip
  (`serializeExport`/`parseImport`) ⇒ still a valid current-version save.
- No sim/golden impact — this is meta-only and never runs during a game.
- Limitation: EVERYTHING's pref wipe targets a known key list (not a blind `localStorage.clear()`)
  so it never touches unrelated keys; a new persisted pref must be added to that list.
