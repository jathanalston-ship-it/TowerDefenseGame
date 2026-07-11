// ENCYCLOPEDIA BUILDERS (docs/WEBSITE.md §content) — the site's reference pages are GENERATED
// from the game's real data registries (TOWER_DEFS, HERO_DEFS, ENEMY_DEFS, BIOMES, BOSS_DEFS,
// MEGA_BOSS_DEFS). Ship a new tower/enemy/biome and `npm run site` regenerates the pages — the
// website's reference content can never drift from the shipped game, and it expands for free.

import { ENEMY_DEFS, HERO_DEFS, TOWER_DEFS } from '../src/core/config';
import { BIOMES } from '../src/core/biomes';
import { BOSS_DEFS } from '../src/core/boss';
import { MEGA_BOSS_DEFS } from '../src/core/megaboss';
import { DOCTRINES } from '../src/core/doctrines';
import type { DoctrineFamily } from '../src/core/doctrines';
import { esc } from './shell';

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The full tower roster table (Tower Guide + a home "featured" pick). */
export function towerTable(): string {
  const rows = Object.values(TOWER_DEFS).map((t) => `
    <tr>
      <td><span class="swatch" style="background:${esc(t.color)}"></span>${esc(t.name)}</td>
      <td>${esc(t.combatClass)}</td>
      <td>${t.cost}</td>
      <td>${t.range}</td>
      <td>${num(t.damage)}</td>
      <td>${num(t.fireInterval)}s</td>
      <td>${t.splash > 0 ? t.splash : '—'}</td>
      <td>${esc(t.blurb)}</td>
    </tr>`).join('');
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th>Tower</th><th>Class</th><th>Cost</th><th>Range</th><th>Damage</th><th>Cadence</th><th>Splash</th><th>Role</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function towerCount(): number { return Object.keys(TOWER_DEFS).length; }
export function heroCount(): number { return Object.keys(HERO_DEFS).length; }
export function enemyCount(): number { return Object.keys(ENEMY_DEFS).length; }
export function biomeCount(): number { return BIOMES.length; }
export function bossCount(): number { return Object.keys(BOSS_DEFS).length + Object.keys(MEGA_BOSS_DEFS).length; }
export function doctrineCount(): number { return Object.keys(DOCTRINES).length - 1; } // 'none' is no commitment

/** The Doctrine Codex — every run commitment grouped by family, straight from the registry. */
export function doctrineCodex(): string {
  const fams: { id: DoctrineFamily; title: string; blurb: string }[] = [
    { id: 'build', title: 'Build Doctrines', blurb: 'Bend YOUR math — damage, cadence, integrity, economy. The enemy world stays honest; your rules change.' },
    { id: 'protocol', title: 'Protocols', blurb: 'Reshape the ENEMY WORLD — spawn counts, monster stats, the endless ramp — and collect run-end reward premiums for surviving the warp.' },
    { id: 'pact', title: 'Pacts', blurb: 'A sacrifice AND a payoff, signed together — both sides of the ledger on one signature.' },
  ];
  return fams.map((f) => {
    const cards = Object.values(DOCTRINES)
      .filter((d) => d.id !== 'none' && d.family === f.id)
      .sort((a, b) => a.unlockStage - b.unlockStage)
      .map((d) => `
      <div class="card"><div class="k">${esc(d.icon)} ${d.unlockStage > 0 ? `UNSEALS AT STAGE ${d.unlockStage}` : 'AVAILABLE FROM RUN ONE'}</div>
      <h3>${esc(d.name)}</h3><p>${esc(d.blurb)}</p></div>`).join('');
    return `<h2>${esc(f.title)}</h2><p>${esc(f.blurb)}</p><div class="card-grid">${cards}</div>`;
  }).join('');
}

/** A rotating "featured" pick — deterministic by ISO week, so the homepage changes weekly
 *  without a server. */
export function featuredOfWeek<T>(list: T[], salt: number): T {
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  return list[(week + salt) % list.length];
}
export function featuredTower(): { name: string; blurb: string; color: string } {
  const t = featuredOfWeek(Object.values(TOWER_DEFS), 0);
  return { name: t.name, blurb: t.blurb, color: t.color };
}
export function featuredHero(): { name: string; blurb: string; color: string } {
  const h = featuredOfWeek(Object.values(HERO_DEFS), 3);
  return { name: h.name, blurb: h.ability?.blurb ?? h.ability?.name ?? 'A living weapon of the hive.', color: h.color };
}

/** The hero roster table (Hero Guide). */
export function heroTable(): string {
  const rows = Object.values(HERO_DEFS).map((h) => `
    <tr>
      <td><span class="swatch" style="background:${esc(h.color)}"></span>${esc(h.name)}</td>
      <td>${esc(h.combatClass)}</td>
      <td>${esc(h.behavior)}</td>
      <td>${h.maxHp}</td>
      <td>${h.attackRange > 0 ? `${num(h.attackDamage)} / ${num(h.attackInterval)}s` : 'support'}</td>
      <td>${esc(h.ability?.name ?? '—')}</td>
    </tr>`).join('');
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th>Hero</th><th>Class</th><th>Doctrine</th><th>HP</th><th>Attack</th><th>Active Ability</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/** The Enemy Compendium — every strain grouped by threat role, with its authored stats. */
export function enemyCompendium(): string {
  const all = Object.values(ENEMY_DEFS);
  const groups: { title: string; blurb: string; filter: (d: (typeof all)[number]) => boolean }[] = [
    { title: 'Swarm & Chaff', blurb: 'Cheap bodies in overwhelming numbers — the tide the line is built against.', filter: (d) => d.hp <= 30 && !d.summon && !d.siege },
    { title: 'Armored & Heavy', blurb: 'Slow, plated organisms that shrug off small-arms chip damage.', filter: (d) => d.hp > 30 && d.armor > 0 && !d.siege && !d.summon },
    { title: 'Fliers', blurb: 'Airborne strains that ignore ground obstacles on their approach.', filter: (d) => d.behavior.flying === true },
    { title: 'Support & Summoners', blurb: 'Healers, shield-bearers and brood-mothers — kill priority targets first.', filter: (d) => !!d.summon || !!d.auraRadius },
    { title: 'Artillery & Siege', blurb: 'Standoff bombardiers that shell the line from beyond most towers’ reach.', filter: (d) => !!d.siege },
    { title: 'Volatile', blurb: 'Suicide strains — bodies that ARE the weapon. Never let them arrive.', filter: (d) => !!d.explodeRadius },
  ];
  const used = new Set<string>();
  const section = (g: (typeof groups)[number]): string => {
    const rows = all.filter((d) => !used.has(d.kind) && g.filter(d));
    rows.forEach((d) => used.add(d.kind));
    if (rows.length === 0) return '';
    const tr = rows.map((d) => `
      <tr>
        <td><span class="swatch" style="background:${esc(d.color)}"></span>${esc(d.name)}</td>
        <td>${d.hp}</td><td>${d.armor > 0 ? d.armor : '—'}</td><td>${num(d.speed)}</td>
        <td>${d.bounty}</td><td>${d.damage}</td>
        <td>${[d.shieldHp ? 'shielded' : '', d.regenPerSec ? 'regenerating' : '', d.summon ? 'summoner' : '', d.auraRadius ? 'support aura' : '', d.siege ? 'artillery' : '', d.explodeRadius ? 'volatile' : '', d.behavior.flying ? 'flying' : '', d.behavior.burrowing ? 'burrowing' : ''].filter(Boolean).join(', ') || 'baseline'}</td>
      </tr>`).join('');
    return `<h2>${esc(g.title)}</h2><p>${esc(g.blurb)}</p>
      <div class="table-wrap"><table class="data">
      <thead><tr><th>Strain</th><th>HP</th><th>Armor</th><th>Speed</th><th>Biomass</th><th>Threat</th><th>Traits</th></tr></thead>
      <tbody>${tr}</tbody></table></div>`;
  };
  const html = groups.map(section).join('');
  const rest = all.filter((d) => !used.has(d.kind));
  const restHtml = rest.length
    ? section({ title: 'Specialists', blurb: 'Everything the taxonomy above cannot hold.', filter: (d) => rest.includes(d) })
    : '';
  return html + restHtml;
}

/** The Biome Encyclopedia — every ecosystem with its character, mods and hazard. */
export function biomeEncyclopedia(): string {
  return BIOMES.map((b) => {
    const m = b.mods;
    const mods: string[] = [];
    if (m.enemyHpMult !== 1) mods.push(`enemy HP ×${m.enemyHpMult}`);
    if (m.enemySpeedMult !== 1) mods.push(`enemy speed ×${m.enemySpeedMult}`);
    if (m.enemyDamageMult !== 1) mods.push(`enemy damage ×${m.enemyDamageMult}`);
    if (m.enemyArmorBonus > 0) mods.push(`+${m.enemyArmorBonus} armor`);
    if (m.bountyMult !== 1) mods.push(`biomass ×${m.bountyMult}`);
    if (m.towerFireRateMult !== 1) mods.push(`tower rate ×${m.towerFireRateMult}`);
    const hazard = m.hazard.period > 0
      ? `<p><b>Hazard — ${esc(m.hazard.name)}:</b> ${esc(m.hazard.desc)}</p>`
      : '';
    return `<section class="card" style="margin-bottom:16px">
      <div class="k">${esc(b.modifierName || 'Frontier')}</div>
      <h3>${esc(b.name)}</h3>
      <p>${mods.length ? esc(mods.join(' · ')) : 'A balanced frontier — the baseline the other ecosystems warp.'}</p>
      ${hazard}
    </section>`;
  }).join('');
}

/** The boss gallery — authored framework bosses + the battlefield-scale Mega organisms. */
export function bossGallery(): string {
  const bosses = Object.values(BOSS_DEFS).map((b) => `
    <div class="card"><div class="k">${esc(b.chassis)} chassis</div><h3>${esc(b.name)}</h3>
    <p>Threat ×${b.hpMult} organism${b.modifiers.length ? ` · ${esc(b.modifiers.join(', '))}` : ''}. ${b.phases.length} combat phase${b.phases.length === 1 ? '' : 's'}.</p></div>`).join('');
  const megas = Object.values(MEGA_BOSS_DEFS).map((m) => `
    <div class="card"><div class="k">MEGA ORGANISM</div><h3>${esc(m.name)}</h3>
    <p><i>${esc(m.title)}</i></p></div>`).join('');
  return `<h2>Framework Bosses</h2><p>Authored apex organisms that anchor campaign milestones and endless depths — each a chassis, a modifier loadout and a phase script.</p>
    <div class="card-grid">${bosses}</div>
    <h2>Mega Bosses</h2><p>Battlefield-scale raid organisms that arrive over the arena itself: weak-point surgery under a rotation of authored abilities, with their own composed hymn.</p>
    <div class="card-grid">${megas}</div>`;
}
