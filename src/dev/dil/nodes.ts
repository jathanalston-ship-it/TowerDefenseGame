// DIL INGESTION (docs/DIL.md §sources) — the graph is BUILT from the project's real registries,
// so it can never drift from the shipped game and NEW CONTENT JOINS AUTOMATICALLY: add a tower to
// TOWER_DEFS and it is a node with edges (and a completion checklist) the moment it compiles.
// Hand-curated design knowledge that lives in no registry (gates, rewards, conflicts, future
// plans) layers on top from knowledge.ts.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DilGraph } from './graph';
import { SYSTEMS, systemsForFile } from '../systemRegistry';
import { ENEMY_DEFS, HERO_DEFS, TOWER_DEFS } from '../../core/config';
import { BIOMES } from '../../core/biomes';
import { BOSS_DEFS } from '../../core/boss';
import { MEGA_BOSS_DEFS } from '../../core/megaboss';
import { TRACKS } from '../../audio/music';
import { ACHIEVEMENTS } from '../../state/achievements';
import { MECHANICS } from '../../state/mechanics';
import { TUTORIALS } from '../../core/tutorial';
import { GUIDES } from '../../../site/guides';
import { CONCEPTS, GUIDE_TOPICS, KNOWLEDGE_EDGES } from './knowledge';

export const REPO_ROOT = process.cwd();

function srcTestFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) srcTestFiles(p, out);
    else if (/\.test\.tsx?$/.test(e)) out.push(p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/'));
  }
  return out;
}

/** Build the whole Design Intelligence graph. Deterministic; ~1ms-scale per lookup afterward. */
export function buildDil(): DilGraph {
  const g = new DilGraph();

  // ── Systems (the engineering skeleton, from the enforced system registry) ──
  for (const s of SYSTEMS) {
    g.addNode({ id: `system:${s.id}`, kind: 'system', name: s.name, summary: s.purpose, at: s.files.join(', ') });
  }
  for (const s of SYSTEMS) {
    for (const d of s.dependsOn) g.addEdge(`system:${s.id}`, 'dependsOn', `system:${d}`);
    if (s.powerScore) g.addEdge(`system:${s.id}`, 'provides', 'concept:power-score', s.powerScore);
    for (const f of s.save) g.addEdge(`system:${s.id}`, 'consumes', 'system:meta-store', `owns save field '${f}'`);
  }

  // ── Concepts + currencies (curated — the cross-cutting ideas code has no registry for) ──
  for (const c of CONCEPTS) g.addNode(c);

  // ── Content entities (auto — one node per shipped thing) ──
  for (const t of Object.values(TOWER_DEFS)) {
    g.addNode({ id: `tower:${t.kind}`, kind: 'tower', name: t.name, summary: t.blurb, at: 'src/core/config.ts TOWER_DEFS' });
    g.addEdge(`tower:${t.kind}`, 'partOf', 'system:towers');
    g.addEdge(`tower:${t.kind}`, 'consumes', 'currency:biomass', `placement cost ${t.cost}`);
    if ((t.unlockShards ?? 0) > 0) g.addEdge('currency:tower-shards', 'gates', `tower:${t.kind}`, `${t.unlockShards} shards to unlock`);
  }
  for (const h of Object.values(HERO_DEFS)) {
    g.addNode({ id: `hero:${h.kind}`, kind: 'hero', name: h.name, summary: h.ability?.blurb ?? `${h.combatClass} ${h.behavior} champion`, at: 'src/core/config.ts HERO_DEFS' });
    g.addEdge(`hero:${h.kind}`, 'partOf', 'system:heroes');
    if (h.unlock) g.addEdge('concept:progression-gates', 'gates', `hero:${h.kind}`, 'progression unlock requirement');
  }
  for (const e of Object.values(ENEMY_DEFS)) {
    const traits = [e.shieldHp && 'shielded', e.regenPerSec && 'regen', e.summon && 'summoner', e.siege && 'artillery', e.explodeRadius && 'volatile', e.behavior.flying && 'flying'].filter(Boolean).join(', ');
    g.addNode({ id: `enemy:${e.kind}`, kind: 'enemy', name: e.name, summary: traits || 'baseline strain', at: 'src/core/config.ts ENEMY_DEFS' });
    g.addEdge(`enemy:${e.kind}`, 'partOf', 'system:engine', 'enemy defs/behaviors live in the sim core');
    g.addEdge(`enemy:${e.kind}`, 'rewards', 'currency:biomass', `bounty ${e.bounty}`);
  }
  for (const b of Object.values(BOSS_DEFS)) {
    g.addNode({ id: `boss:${b.id}`, kind: 'boss', name: b.name, summary: `${b.chassis} chassis · ${b.phases.length} phases`, at: 'src/core/boss.ts BOSS_DEFS' });
    g.addEdge(`boss:${b.id}`, 'partOf', 'system:bosses');
  }
  for (const m of Object.values(MEGA_BOSS_DEFS)) {
    g.addNode({ id: `mega:${m.id}`, kind: 'megaboss', name: m.name, summary: m.title, at: 'src/core/megaboss.ts MEGA_BOSS_DEFS' });
    g.addEdge(`mega:${m.id}`, 'partOf', 'system:mega-bosses');
  }
  for (const b of BIOMES) {
    g.addNode({ id: `biome:${b.id}`, kind: 'biome', name: b.name, summary: b.modifierName || 'frontier baseline', at: 'src/core/biomes.ts BIOMES' });
    g.addEdge(`biome:${b.id}`, 'partOf', 'system:biomes');
    g.addEdge(`biome:${b.id}`, 'modifies', 'system:engine', 'wave/stat modifiers + hazard');
  }
  for (const t of Object.values(TRACKS)) {
    g.addNode({ id: `music:${t.category}`, kind: 'music', name: t.id, summary: `${t.bpm}bpm generative track for '${t.category}'`, at: 'src/audio/music.ts TRACKS' });
    g.addEdge(`music:${t.category}`, 'partOf', 'system:audio');
  }

  // ── Teaching + recognition surfaces (auto) ──
  for (const id of Object.keys(TUTORIALS)) {
    g.addNode({ id: `tutorial:${id}`, kind: 'tutorial', name: TUTORIALS[id].name, summary: `${TUTORIALS[id].checkpoints.length} checkpoints`, at: 'src/core/tutorial.ts' });
    g.addEdge(`tutorial:${id}`, 'partOf', 'system:onboarding');
  }
  for (const m of MECHANICS) {
    g.addNode({ id: `help:${m.id}`, kind: 'help', name: m.title, summary: m.summary, at: 'src/state/mechanics.ts' });
    g.addEdge(`help:${m.id}`, 'partOf', 'system:onboarding');
  }
  for (const a of ACHIEVEMENTS) {
    g.addNode({ id: `achievement:${a.id}`, kind: 'achievement', name: a.name, summary: a.desc, at: 'src/state/achievements.ts' });
    g.addEdge(`achievement:${a.id}`, 'partOf', 'system:achievements');
    if ((a.reward ?? 0) > 0) g.addEdge(`achievement:${a.id}`, 'rewards', 'currency:genome-cores', `+${a.reward} on unlock`);
  }
  // The system registry already curates which tutorials/help/achievements belong to which system.
  for (const s of SYSTEMS) {
    for (const t of s.tutorial) g.addEdge(`tutorial:${t}`, 'teaches', `system:${s.id}`);
    for (const h of s.help) g.addEdge(`help:${h}`, 'teaches', `system:${s.id}`);
    for (const a of s.achievements) g.addEdge(`achievement:${a}`, 'references', `system:${s.id}`);
  }

  // ── Documentation (auto: every docs/*.md is a node; registry docs arrays wire ownership) ──
  const docsDir = join(REPO_ROOT, 'docs');
  if (existsSync(docsDir)) {
    for (const f of readdirSync(docsDir).filter((f) => f.endsWith('.md'))) {
      g.ensureNode({ id: `doc:${f}`, kind: 'doc', name: f, summary: 'project documentation', at: `docs/${f}` });
    }
  }
  for (const s of SYSTEMS) {
    for (const d of s.docs) {
      const id = `doc:${d.replace(/^docs\//, '')}`;
      g.ensureNode({ id, kind: 'doc', name: d.replace(/^docs\//, ''), summary: 'project documentation', at: d });
      g.addEdge(id, 'documents', `system:${s.id}`);
    }
  }

  // ── Site guides (auto) — the public teaching layer ──
  for (const gd of GUIDES) {
    g.addNode({ id: `guide:${gd.slug}`, kind: 'guide', name: gd.title, summary: gd.summary, at: `site/guides.ts → /guides/${gd.slug}/` });
    g.addEdge(`guide:${gd.slug}`, 'partOf', 'system:website');
    for (const target of GUIDE_TOPICS[gd.slug] ?? []) g.addEdge(`guide:${gd.slug}`, 'documents', target);
  }

  // ── Tests (auto: every *.test file, wired to the systems whose file globs own it) ──
  for (const tf of [...srcTestFiles(join(REPO_ROOT, 'src')), ...srcTestFiles(join(REPO_ROOT, 'site'))]) {
    const id = `test:${tf}`;
    g.addNode({ id, kind: 'test', name: tf, summary: 'automated validation', at: tf });
    // A test belongs to whichever system owns its file — AND to whichever owns the module it
    // exercises (its non-.test twin), since most registry file lists name only the module.
    const twin = tf.replace(/\.test\.(tsx?)$/, '.$1');
    const owners = tf.startsWith('site/')
      ? [{ id: 'website' }]
      : [...new Map([...systemsForFile(tf), ...systemsForFile(twin)].map((s) => [s.id, s])).values()];
    for (const o of owners) g.addEdge(id, 'tests', `system:${o.id}`);
    if (owners.length === 0) g.addEdge(id, 'tests', 'system:engine', 'unclaimed test — verify registry globs');
  }

  // ── Curated design knowledge (gates, rewards, balances, conflicts, plans) ──
  for (const e of KNOWLEDGE_EDGES) g.addEdge(e.from, e.kind, e.to, e.note);

  return g;
}
