// Doc ↔ implementation synchronization checks (the "documentation can never silently rot" layer).
// Three mechanisms, strongest first:
//   1. ANCHORS — value-level assertions: a doc MUST contain a string derived from the live code
//      (save version, gate stages, drop rates…). Change the code without the doc ⇒ hard FAIL.
//   2. DEAD PATHS — every `src/...ts(x)` and `docs/...md` reference inside docs/ must exist.
//   3. STALENESS — git-based advisory: systems whose code moved after their docs (warnings,
//      produced by scripts/doc-sync.ts; not a test failure — rapid iteration would drown in red).
// Enforced by systemRegistry.test.ts (1+2) and surfaced by `npm run docs:check` / `npm run validate`.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_VERSION } from '../save/saveStore';
import { GENE_LEVEL_GATES, GENE_LEVEL_POWER_FLOOR, GENE_POWER_SCALE } from '../core/geneCards';
import { ESSENCE_PER_SHARD, ESSENCE_COST } from '../core/geneEssence';
import { CARD_POOL } from '../core/cards';
import { TOWER_ORDER, HERO_ORDER, READINESS, DRAFT_FEATURES, SPLICE, HIVE_MIND, RUSH, GEAR_RARITY_BANDS } from '../core/config';
import { MEGA_HUNT } from '../core/megaboss';
import { GENE_LOADOUT_SLOTS } from '../core/geneLoadout';
import { ASSIMILATION_TIERS } from '../core/assimilation';
import { COMBAT_TUTORIAL } from '../core/tutorial';
import { FEEL, ANNOUNCE, LAST_KILL } from '../render/feel';
import { GUTTERS } from '../render/gutters';
import { FILM } from '../render/filmDirection';
import { PRESTIGE } from '../core/prestige';
import { OUTRO } from '../render/runOutro';
import { TOWER_MOMENTS } from '../render/towerMoments';
import { LOGIN } from '../core/loginStreak';
import { INCOME } from '../state/income';

export const REPO_ROOT = join(__dirname, '..', '..');

export interface DocAnchor {
  doc: string; // repo-relative doc path
  contains: string; // the string the doc MUST contain (derived from live code)
  why: string; // what drifted if this fails
}

/** A design token's live value from src/index.css `:root` (the CSS owns these, not TS). */
function cssToken(name: string): string {
  const css = readFileSync(join(REPO_ROOT, 'src/index.css'), 'utf8');
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim().split('/*')[0].trim() : `<missing token --${name}>`;
}

/** Value-level doc↔code anchors. ADD ONE whenever a doc states a number the code owns. */
export function docAnchors(): DocAnchor[] {
  const gates = GENE_LEVEL_GATES.filter((g) => g.stage > 0).map((g) => `L${g.level}@${g.stage}`).join(' · ');
  return [
    { doc: 'docs/GAME-STATE.md', contains: `CURRENT_VERSION = ${CURRENT_VERSION}`, why: 'save schema version drifted (saveStore.CURRENT_VERSION)' },
    { doc: 'docs/GAME-STATE.md', contains: `| Cards (genes) | ${CARD_POOL.length} |`, why: 'card count drifted (CARD_POOL)' },
    { doc: 'docs/GAME-STATE.md', contains: `| Towers | ${TOWER_ORDER.length} |`, why: 'tower count drifted (TOWER_ORDER)' },
    { doc: 'docs/GAME-STATE.md', contains: `| Heroes | ${HERO_ORDER.length} |`, why: 'hero count drifted (HERO_ORDER)' },
    { doc: 'docs/PROGRESSION-LOOP.md', contains: `config: ${READINESS.warnBelow})`, why: 'deploy-warning tolerance drifted (config.READINESS.warnBelow)' },
    { doc: 'docs/GAME-STATE.md', contains: gates, why: 'gene campaign gates drifted (GENE_LEVEL_GATES)' },
    { doc: 'docs/TUTORIAL.md', contains: `The encounter is **${COMBAT_TUTORIAL.waves} waves**`, why: 'combat tutorial wave count drifted (COMBAT_TUTORIAL.waves — the HUD reports it)' },
    { doc: 'docs/TUTORIAL.md', contains: `| 3 | Cold-open banner → **Combat Tutorial** | ${COMBAT_TUTORIAL.checkpoints.length} lessons, ${COMBAT_TUTORIAL.waves} waves |`, why: 'combat tutorial lesson count drifted (COMBAT_TUTORIAL.checkpoints)' },
    { doc: 'docs/GENE-EVOLUTION.md', contains: `GENE_POWER_SCALE = ${GENE_POWER_SCALE}`, why: 'gene power calibration drifted (GENE_POWER_SCALE)' },
    { doc: 'docs/GENE-EVOLUTION.md', contains: `\`GENE_LEVEL_POWER_FLOOR\` = ${GENE_LEVEL_POWER_FLOOR}`, why: 'per-level gene Power floor drifted (GENE_LEVEL_POWER_FLOOR)' },
    { doc: 'docs/GENE-EVOLUTION.md', contains: `| Essence / shard | ${ESSENCE_PER_SHARD.common} | ${ESSENCE_PER_SHARD.uncommon} | ${ESSENCE_PER_SHARD.rare} | ${ESSENCE_PER_SHARD.epic} | ${ESSENCE_PER_SHARD.legendary} | ${ESSENCE_PER_SHARD.mythic} |`, why: 'duplicate-conversion rates drifted (ESSENCE_PER_SHARD)' },
    { doc: 'docs/GENE-EVOLUTION.md', contains: `${ESSENCE_COST.baseByCardRarity.common}`, why: 'essence cost base drifted (ESSENCE_COST.common)' },
    { doc: 'docs/GENE-EVOLUTION.md', contains: `${GENE_LOADOUT_SLOTS.length}`, why: 'loadout slot count drifted (GENE_LOADOUT_SLOTS)' },
    { doc: 'docs/PROJECT_MANIFEST.md', contains: 'gates at stages 15/30/50/75', why: 'manifest gene-gate summary drifted (GENE_LEVEL_GATES)' },
    { doc: 'docs/ASSIMILATION.md', contains: `${ASSIMILATION_TIERS.length} evolution tiers`, why: 'tier count drifted (ASSIMILATION_TIERS)' },
    { doc: 'docs/GENOME-CORE.md', contains: `imprintPerMolt ${PRESTIGE.molt.imprintPerMolt} · imprintMax ${PRESTIGE.molt.imprintMax}`, why: 'Molt Imprint retention drifted (core/prestige.ts PRESTIGE.molt)' },
    // Batch G (GR2): draft fit · opening draft · Splice · the Hive opening — doc-stated tunables.
    { doc: 'docs/CARDS.md', contains: `\`SPLICE.costDeploys\` (${SPLICE.costDeploys}) × the next deploy cost × \`SPLICE.growth\` (${SPLICE.growth})`, why: 'Splice price drifted (config.ts SPLICE)' },
    { doc: 'docs/CARDS.md', contains: `Campaign runs from Stage **${DRAFT_FEATURES.opening.fromStage}**`, why: 'opening-draft gate drifted (config.ts DRAFT_FEATURES.opening)' },
    { doc: 'docs/CARDS.md', contains: `Campaign Stage **${DRAFT_FEATURES.splice.fromCleared}**`, why: 'Splice unlock drifted (config.ts DRAFT_FEATURES.splice)' },
    { doc: 'docs/HIVE-MIND.md', contains: `\`thinBoardTowers\` = ${HIVE_MIND.thinBoardTowers}`, why: 'Hive thin-board hold drifted (config.ts HIVE_MIND.thinBoardTowers)' },
    { doc: 'docs/BOSS-RUSH.md', contains: `\`columnGraceSec\` (${RUSH.columnGraceSec} s)`, why: 'Boss Rush column grace drifted (RUSH.columnGraceSec, §wall)' },
    { doc: 'docs/BOSS-RUSH.md', contains: `× geoGrowth (${RUSH.geoGrowth}) per wave past geoFromWave`, why: 'Boss Rush geometric growth drifted (RUSH.geoGrowth, §wall)' },
    { doc: 'docs/BOSS-RUSH.md', contains: `\`+RUSH.corePerBoss\` (${RUSH.corePerBoss}) Genome Cores and \`+RUSH.lootPerBoss\` (${RUSH.lootPerBoss})`, why: 'Boss Rush per-boss payout drifted (RUSH.corePerBoss/lootPerBoss)' },
    { doc: 'docs/MEGA-BOSS.md', contains: `\`rankCoreFrac\` (${MEGA_HUNT.rankCoreFrac})`, why: 'Mega Hunt rank bounty drifted (MEGA_HUNT.rankCoreFrac, §hunt)' },
    { doc: 'docs/EQUIPMENT.md', contains: `i33+: ${GEAR_RARITY_BANDS.find((b) => b.fromIlvl === 33)?.legendary}% Rampant · ${(GEAR_RARITY_BANDS.find((b) => b.fromIlvl === 33)?.exotic ?? 0) * 100}% Apex`, why: 'gear rarity band drifted (GEAR_RARITY_BANDS, §gear-chase)' },
    { doc: 'docs/DAILY-LOGIN.md', contains: `LOGIN.incomeMinutes (${LOGIN.incomeMinutes}), LOGIN.incomeRunCap (${LOGIN.incomeRunCap})`, why: 'Bio-Cache income line drifted (core/loginStreak.ts LOGIN.incomeMinutes / incomeRunCap)' },
    { doc: 'docs/ONE-MORE-RUN.md', contains: `\`etaRuns ≤ INCOME.honestRuns\` (${INCOME.honestRuns})`, why: '"one more run" honesty threshold drifted (state/income.ts INCOME.honestRuns)' },
    // Identity trilogy (docs/UI_STYLE_GUIDE.md) — pinned to the LIVE :root tokens.
    { doc: 'docs/UI_STYLE_GUIDE.md', contains: `--kinetic ${cssToken('kinetic')}`, why: 'class-hue palette drifted (src/index.css --kinetic)' },
    { doc: 'docs/UI_STYLE_GUIDE.md', contains: `--viral ${cssToken('viral')}`, why: 'class-hue palette drifted (src/index.css --viral)' },
    { doc: 'docs/UI_STYLE_GUIDE.md', contains: `--r-mythic ${cssToken('r-mythic')}`, why: 'rarity ladder drifted (src/index.css --r-mythic)' },
    { doc: 'docs/UI_STYLE_GUIDE.md', contains: `--panel-deep ${cssToken('panel-deep')}`, why: 'panel ramp drifted (src/index.css --panel-deep)' },
    { doc: 'docs/UI_STYLE_GUIDE.md', contains: `--dur-2 ${cssToken('dur-2')}`, why: 'motion tokens drifted (src/index.css --dur-2)' },
    { doc: 'docs/UI_STYLE_GUIDE.md', contains: `--dur-3 ${cssToken('dur-3')}`, why: 'motion tokens drifted (src/index.css --dur-3)' },
    { doc: 'docs/GAME-FEEL.md', contains: `boss fall **${FEEL.bossFall.shake} / ${FEEL.bossFall.hitstop} s**`, why: 'boss-fall feel drifted (render/feel.ts FEEL.bossFall)' },
    { doc: 'docs/GAME-FEEL.md', contains: `ult impact **${FEEL.abilityImpact.shake} / ${FEEL.abilityImpact.hitstop} s**`, why: 'ult impact feel drifted (render/feel.ts FEEL.abilityImpact)' },
    { doc: 'docs/HERO-CINEMATICS.md', contains: `trauma ${FEEL.abilityImpact.shake})`, why: 'ult impact kick drifted (render/feel.ts FEEL.abilityImpact)' },
    { doc: 'docs/SIGNATURE-MOMENTS.md', contains: `\`LAST_KILL\` normal ${Math.round(LAST_KILL.normal.depth * 100)} % · ${LAST_KILL.normal.outMs} ms · boss ${Math.round(LAST_KILL.boss.depth * 100)} % · ${LAST_KILL.boss.outMs} ms · nudge ≤ ${Math.round(LAST_KILL.normal.zoom * 100)} %`, why: 'last-kill taste values drifted (render/feel.ts LAST_KILL)' },
    { doc: 'docs/GAME-FEEL.md', contains: `mega fall ${ANNOUNCE.megaFall.priority} › mega intro ${ANNOUNCE.megaIntro.priority} › boss fall ${ANNOUNCE.bossFall.priority} › boss intro ${ANNOUNCE.bossIntro.priority} › weak point ${ANNOUNCE.weakPoint.priority} › wave ${ANNOUNCE.wave.priority}`, why: 'centre-stage priority ladder drifted (render/feel.ts ANNOUNCE)' },
    { doc: 'docs/TOWER-VISUAL-EVOLUTION.md', contains: `rings 1 → ${TOWER_MOMENTS.evolve.maxRings}`, why: 'evolve molt ring cap drifted (render/towerMoments.ts TOWER_MOMENTS.evolve.maxRings)' },
    { doc: 'docs/SIGNATURE-MOMENTS.md', contains: `brightness **${GUTTERS.brightness}** · bake at **${GUTTERS.resScale}×** · poll **${GUTTERS.pollMs} ms** · crossfade **${GUTTERS.fadeMs} ms**`, why: 'living-gutters tunables drifted (render/gutters.ts GUTTERS)' },
    { doc: 'docs/SIGNATURE-MOMENTS.md', contains: `Victory hold **${OUTRO.holdMs.won} ms** (defeat ${OUTRO.holdMs.lost} ms · reduced motion ${OUTRO.holdMs.reduced} ms)`, why: 'run-end outro hold drifted (render/runOutro.ts OUTRO.holdMs)' },
    { doc: 'docs/SIGNATURE-MOMENTS.md', contains: `The wash **${OUTRO.wash.ms} ms**; the defeat cracks ${OUTRO.defeat.ms} ms`, why: 'victory wash / defeat crack timing drifted (render/runOutro.ts OUTRO)' },
    { doc: 'docs/SIGNATURE-MOMENTS.md', contains: `--rb-blur ${cssToken('rb-blur')} · --rb-dim ${cssToken('rb-dim')}`, why: 'Results backdrop blur/dim drifted (src/index.css §S2)' },
    { doc: 'docs/CUTSCENES.md', contains: `default \`FILM.punch.zoom\` = ${Math.round(FILM.punch.zoom * 1000) / 10} %, hard ceiling ${Math.round(FILM.punch.max * 1000) / 10} %`, why: 'film punch dials drifted (render/filmDirection.ts FILM.punch)' },
  ];
}

/** Anchors whose doc is missing the required string. Empty = docs agree with the code. */
export function anchorProblems(): string[] {
  const out: string[] = [];
  for (const a of docAnchors()) {
    const p = join(REPO_ROOT, a.doc);
    if (!existsSync(p)) { out.push(`${a.doc}: MISSING FILE (${a.why})`); continue; }
    const text = readFileSync(p, 'utf8');
    if (!text.includes(a.contains)) out.push(`${a.doc}: expected "${a.contains}" — ${a.why}`);
  }
  return out;
}

export function allDocFiles(): string[] {
  return readdirSync(join(REPO_ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`);
}

const SELF_EXEMPT = new Set(['docs/BUGFIX-LOG.md', 'docs/BACKLOG.md']); // historical logs may cite deleted files

/** `src/**.ts(x)` and `docs/**.md` references inside docs that point at nothing. */
export function deadDocPaths(): string[] {
  const out: string[] = [];
  for (const doc of allDocFiles()) {
    if (SELF_EXEMPT.has(doc)) continue;
    const text = readFileSync(join(REPO_ROOT, doc), 'utf8');
    const refs = new Set<string>();
    for (const m of text.matchAll(/\bsrc\/[A-Za-z0-9_./-]+\.(?:tsx?|css)\b/g)) refs.add(m[0]);
    for (const m of text.matchAll(/\bdocs\/[A-Za-z0-9_.-]+\.md\b/g)) refs.add(m[0]);
    for (const ref of refs) {
      if (!existsSync(join(REPO_ROOT, ref))) out.push(`${doc}: dead reference → ${ref}`);
    }
  }
  return out;
}
