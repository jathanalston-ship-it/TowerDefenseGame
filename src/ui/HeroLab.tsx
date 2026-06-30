// Hero Lab — a CHAMPION SELECT, not a spreadsheet. A scrollable roster rail (future-proof for
// 30+ heroes) frames ONE focused hero at a time: a large animated portrait, identity + role,
// stars, mastery, current loadout, specialization, lifetime ownership stats, and future unlocks.
// Reads the reactive save; selection/purchases go through meta. Equipment management lives in the
// Armory (EquipmentPanel) below — this page shows the loadout and points there.

import { useState } from 'react';
import { masteryProgress, meta } from '../state/meta';
import { heroDetail } from '../state/heroView';
import { HERO_DEFS, HERO_ORDER } from '../core/config';
import { heroIdentity } from '../core/heroIdentity';
import type { HeroKind } from '../core/types';
import { masteryRank } from '../core/mastery';
import { HeroPortrait } from './components/HeroPortrait';
import { ProgressBar } from './components/ProgressBar';
import { CurrencyIcon } from './components/CurrencyIcon';

const RARITY_VAR: Record<string, string> = {
  common: 'var(--r-common)', rare: 'var(--r-rare)', epic: 'var(--r-epic)',
  legendary: 'var(--r-legendary)', exotic: 'var(--viral)',
};

function Section({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="hsec">
      <div className="hsec-h" style={accent ? { color: accent } : undefined}>{title}</div>
      {children}
    </div>
  );
}

export function HeroLab(): JSX.Element {
  const save = meta.use();
  // Which hero's page is OPEN (focus) — independent of which is FIELDED. Defaults to fielded.
  const [focus, setFocus] = useState<HeroKind>(save.selectedHero);
  const d = heroDetail(save, focus);
  const id = heroIdentity(focus); // the data-driven identity layer (docs/HERO-FRAMEWORK.md)
  const c = d.def.color;

  return (
    <div className="panel herolab">
      {/* ── Roster rail: compact, scrollable, one row per hero (scales to 30+) ── */}
      <div className="hero-roster" role="tablist" aria-label="Hero roster">
        <div className="hero-roster-h">Roster <span className="hr-count">{HERO_ORDER.length}</span></div>
        {HERO_ORDER.map((k) => {
          const def = HERO_DEFS[k];
          const stars = save.heroStars[k] ?? 0;
          const rank = masteryRank(masteryProgress(save.heroMasteryXp[k] ?? 0).level);
          const fielded = save.selectedHero === k;
          const active = focus === k;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={active}
              className={`roster-card ${active ? 'is-active' : ''}`}
              style={active ? ({ ['--hc' as string]: def.color, borderColor: def.color }) : undefined}
              onClick={() => setFocus(k)}
            >
              <HeroPortrait def={def} size={44} />
              <span className="rc-body">
                <span className="rc-name" style={{ color: def.color }}>{def.name}</span>
                <span className="rc-sub">{def.combatClass} · {stars}★{rank > 0 ? ` · R${rank}` : ''}</span>
              </span>
              {fielded && <span className="rc-deployed" title="Currently fielded">●</span>}
            </button>
          );
        })}
      </div>

      {/* ── Focused hero page ── */}
      <div className="hero-page" style={{ ['--hc' as string]: c }}>
        <div className="hero-banner">
          <HeroPortrait def={d.def} size={184} rank={d.mastery.rank} />
          <div className="hero-id">
            <div className="hero-epithet">{d.lore.title}</div>
            <h2 className="hero-name" style={{ color: c }}>{d.def.name}</h2>
            <div className="hero-tags">
              <span className="class-badge" style={{ background: c }}>{d.def.combatClass}</span>
              <span className="hero-role-tag">{d.lore.roleLabel}</span>
              <span className="hero-spec-tag">{d.lore.specialization}</span>
            </div>
            <p className="hero-tagline">{d.lore.tagline}</p>
            <button
              className={`primary hero-field ${d.fielded ? 'is-fielded' : ''}`}
              disabled={d.fielded}
              onClick={() => meta.setSelectedHero(focus)}
            >
              {d.fielded ? '● Deployed' : 'Field this Hero'}
            </button>
          </div>
        </div>

        {/* Quick stat strip — Power Rating is the one legible "am I stronger?" number */}
        <div className="hero-strip">
          <div className="hstat is-power"><span className="hstat-v" style={{ color: c }}>{d.powerRating}</span><span className="hstat-k">Power Rating</span></div>
          <div className="hstat"><span className="hstat-v">{d.mastery.level}</span><span className="hstat-k">Mastery Lv</span></div>
          <div className="hstat"><span className="hstat-v" style={{ color: c }}>{d.stars}/{d.maxStars}</span><span className="hstat-k">Stars</span></div>
          <div className="hstat"><span className="hstat-v">⚙ {d.equipScore}</span><span className="hstat-k">Equipment Score</span></div>
          <div className="hstat"><span className="hstat-v">{d.kills.toLocaleString()}</span><span className="hstat-k">Lifetime Kills</span></div>
          <div className="hstat"><span className="hstat-v">{d.runs}</span><span className="hstat-k">Runs Fielded</span></div>
        </div>

        <div className="hero-sections">
          {/* Combat Role */}
          <Section title="Combat Role" accent={c}>
            <div className="hsec-role">{d.lore.roleLabel}</div>
            <p className="hsec-desc">{d.lore.roleDesc}</p>
            <div className="hsec-ability">
              <span className="ab-name" style={{ color: c }}>⚡ {d.def.ability.name}</span>
              <span className="ab-cd">{d.def.ability.cooldown}s cooldown</span>
            </div>
            <p className="hsec-desc">{d.def.ability.blurb}</p>
            <div className="kv-row"><span>Vitality</span><b>{d.def.maxHp} HP</b></div>
            <div className="kv-row"><span>Mobility</span><b>{d.def.speed} spd</b></div>
            {d.def.attackDamage > 0
              ? <div className="kv-row"><span>Strike</span><b>{d.def.attackDamage} dmg</b></div>
              : <div className="kv-row"><span>Support</span><b>field / utility</b></div>}
          </Section>

          {/* Hero Identity — the data-driven kit (docs/HERO-FRAMEWORK.md): passive · active · trait · scaling */}
          <Section title="Hero Identity" accent={c}>
            <div className="hkit">
              <div className="hkit-row"><span className="hkit-tag" style={{ borderColor: c, color: c }}>Passive</span><span className="hkit-body"><b>{id.passive.name}</b> — {id.passive.desc}</span></div>
              <div className="hkit-row"><span className="hkit-tag" style={{ borderColor: c, color: c }}>Active</span><span className="hkit-body"><b>{d.def.ability.name}</b> — {d.def.ability.blurb}</span></div>
              <div className="hkit-row"><span className="hkit-tag" style={{ borderColor: c, color: c }}>Trait</span><span className="hkit-body"><b>{id.trait.name}</b> — {id.trait.desc}</span></div>
              <div className="hkit-row"><span className="hkit-tag" style={{ borderColor: c, color: c }}>Scaling</span><span className="hkit-body"><b>{id.scaling.name}</b> — {id.scaling.desc}</span></div>
            </div>
            <div className="hsw">
              <div className="hsw-col">
                <span className="hsw-h is-str">Strengths</span>
                {id.strengths.map((s) => <span className="hsw-item" key={s}>+ {s}</span>)}
              </div>
              <div className="hsw-col">
                <span className="hsw-h is-weak">Weaknesses</span>
                {id.weaknesses.map((w) => <span className="hsw-item" key={w}>− {w}</span>)}
              </div>
            </div>
          </Section>

          {/* Stars */}
          <Section title="Star Progression" accent={c}>
            <div className="pips big" aria-label={`${d.stars} of ${d.maxStars} stars`}>
              {Array.from({ length: d.maxStars }, (_, i) => (
                <span key={i} className={`pip ${i < d.stars ? 'on' : ''}`} style={i < d.stars ? { color: c } : undefined}>★</span>
              ))}
            </div>
            <div className="kv-row"><span>Damage</span><b style={{ color: c }}>+{d.dmgPct}%</b></div>
            {d.cdPct > 0 && <div className="kv-row"><span>Ability cooldown</span><b style={{ color: c }}>-{d.cdPct}%</b></div>}
            <button
              className={`shop-buy wide ${d.canBuyStar ? 'is-afford' : ''}`}
              disabled={d.nextStarCost === null || !d.canBuyStar}
              onClick={() => meta.buyHeroStar(focus)}
            >
              {d.nextStarCost === null ? 'MAX STARS' : <>Add Star · {d.nextStarCost} <CurrencyIcon id="heroShards" color={c} size={13} title="" /> (have {d.shards})</>}
            </button>
          </Section>

          {/* Mastery */}
          <Section title="Mastery" accent={c}>
            <div className="kv-row">
              <span>Rank</span>
              <b style={{ color: c }}>{d.mastery.rankTitle}</b>
            </div>
            <div className="hsec-bar">
              <ProgressBar value={d.mastery.into} max={d.mastery.need} color={c} height={8} label={`${d.def.name} mastery`} />
              <span className="hsec-bar-k">Lv {d.mastery.level} · {Math.round(d.mastery.into)}/{Math.round(d.mastery.need)} XP</span>
              <span className="hsec-next" style={{ color: c }}>→ next rank {d.mastery.nextRankTitle} at Lv {d.mastery.nextRankLevel}</span>
            </div>
            {d.perks.length > 0 ? (
              d.perks.map((p) => (
                <div className="hperk" key={p.name}><b style={{ color: c }}>{p.name}</b> — {p.desc}</div>
              ))
            ) : (
              <p className="hsec-desc">Mastery rises forever as this hero fights — ranks and perks unlock with use.</p>
            )}
          </Section>

          {/* Current Loadout */}
          <Section title="Current Loadout" accent={c}>
            <div className="hero-loadout">
              {d.loadout.map((l) => (
                <div className="hl-slot" key={l.slot}>
                  <span className="hl-k">{l.label}</span>
                  {l.name ? (
                    <span className="hl-item" style={{ color: l.rarity ? RARITY_VAR[l.rarity] : undefined }}>{l.name}</span>
                  ) : (
                    <span className="hl-empty">— empty —</span>
                  )}
                </div>
              ))}
            </div>
            <div className="kv-row"><span>Favorite gear</span><b>{d.favoriteEquip ?? '—'}</b></div>
            <p className="hsec-hint">Equip & craft gear in the Armory below ↓</p>
          </Section>

          {/* Specialization */}
          <Section title="Specialization" accent={c}>
            <div className="hsec-role" style={{ color: c }}>{d.lore.specialization}</div>
            <p className="hsec-desc">
              {d.def.combatClass} discipline — this hero's build leans into its {d.lore.roleLabel.toLowerCase()} identity through stars, mastery, and gear.
            </p>
          </Section>

          {/* Future unlocks */}
          <Section title="Future Progress" accent={c}>
            {d.nextUnlocks.map((u, i) => (
              <div className="hunlock" key={i}>
                <span className="hu-kind" style={{ borderColor: c, color: c }}>{u.kind}</span>
                <span className="hu-body">
                  <span className="hu-label">{u.label}</span>
                  <span className="hu-detail">{u.detail}</span>
                </span>
              </div>
            ))}
            <p className="hsec-hint">One more run pushes every one of these forward.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
