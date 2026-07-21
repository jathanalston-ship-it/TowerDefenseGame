// ADAPTATION CHAMBER (docs/ADAPTATION.md §screen) — the Antigen specialization layer's own
// wing. Relocated out of the Tower Lab fold + Hero Hall section (2026-07): adaptation is an
// ACCOUNT-WIDE spending decision ("who gets my scarce Antigen?"), so it gets one page where
// every tree lives. Three bands: the ADVISOR (exact best-gain next picks across the whole
// roster — one-tap adapt or jump-to-tree), the ROSTER rail (every unlocked strain + champion
// with its free-Antigen badge and form stage), and the selected unit's full AdaptationTree
// (reused untouched — inspector, gates, respec and all).

import { useMemo, useState } from 'react';
import { meta } from '../state/meta';
import { adaptableUnits, adaptationPicks } from '../state/adaptationAdvisor';
import { ADAPT_BRANCH_META } from '../core/adaptation';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import type { HeroKind, TowerKind } from '../core/types';
import { AdaptationTree } from './components/AdaptationTree';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';

interface UnitRef { subject: 'tower' | 'hero'; unit: string }

function unitDef(u: UnitRef): { name: string; color: string } {
  const def = u.subject === 'tower' ? TOWER_DEFS[u.unit as TowerKind] : HERO_DEFS[u.unit as HeroKind];
  return { name: def?.name ?? u.unit, color: def?.color ?? 'var(--text)' };
}

export function AdaptationChamber(): JSX.Element {
  const save = meta.use();
  const units = useMemo(() => adaptableUnits(save), [save]);
  const picks = useMemo(() => adaptationPicks(save, 6), [save]);
  const totalFree = units.reduce((n, u) => n + u.free, 0);
  const readyUnits = units.filter((u) => u.free > 0).length;

  const [sel, setSel] = useState<UnitRef | null>(null);
  // Default focus: the advisor's best pick, else the first unit holding points, else the first unit.
  const active: UnitRef | null = sel
    ?? (picks[0] ? { subject: picks[0].subject, unit: picks[0].unit } : null)
    ?? (units.find((u) => u.free > 0) ?? units[0] ?? null);
  const activeDef = active ? unitDef(active) : null;

  const adopt = (subject: 'tower' | 'hero', unit: string, nodeId: string): void => {
    if (meta.spendAdaptation(subject, unit, nodeId)) audio.cue('ui');
    setSel({ subject, unit }); // land on the tree that just changed
  };

  const towers = units.filter((u) => u.subject === 'tower');
  const heroes = units.filter((u) => u.subject === 'hero');

  return (
    <div className="adc" data-guide="adapt-root">
      {/* ── MASTHEAD ── */}
      <div className="adc-mast">
        <div>
          <div className="panel-title">Adaptation Chamber</div>
          <div className="panel-sub">
            Spend Antigen to rewrite how a strain or champion BEHAVES — permanent branch picks,
            either/or forks, battlefield form stages. Antigen flows from Mastery Ranks, campaign
            depth, rare container Traces and achievements; it is scarce by design.
          </div>
        </div>
        <div className="adc-mast-chips">
          <span className={`adc-wallet${totalFree > 0 ? ' is-live' : ''}`}>
            <CurrencyIcon id="antigen" size={16} title="" /> {totalFree} free
          </span>
          {readyUnits > 0 && <span className="adc-ready">{readyUnits} unit{readyUnits === 1 ? '' : 's'} ready</span>}
        </div>
      </div>

      {/* ── ADVISOR — the optimized next picks, account-wide ── */}
      {picks.length > 0 && (
        <section className="adc-advisor" data-guide="adapt-advisor" aria-label="Suggested adaptations">
          <div className="adc-h">Suggested Next — exact Power gain per pick</div>
          <div className="adc-picks">
            {picks.map((p) => {
              const bm = ADAPT_BRANCH_META[p.branch];
              return (
                <div className="adc-pick" key={`${p.subject}:${p.unit}:${p.nodeId}`} style={{ ['--pc' as string]: p.color }}>
                  <span className="adc-pick-unit" style={{ color: p.color }}>{p.unitName}</span>
                  <span className="adc-pick-node" title={p.desc}>
                    <i style={{ color: bm.color }} aria-hidden>{bm.icon}</i> {p.nodeName}
                    <small>T{p.tier}</small>
                  </span>
                  <span className={`adc-pick-gain${p.powerDelta === 0 ? ' is-beh' : ''}`}>
                    {p.powerDelta > 0 ? `▲ +${p.powerDelta.toLocaleString()} Power` : 'behavioral rewrite'}
                  </span>
                  <span className="adc-pick-btns">
                    <button className="primary adc-pick-adopt" onClick={() => adopt(p.subject, p.unit, p.nodeId)}>
                      Adapt · 1 <CurrencyIcon id="antigen" size={12} title="" />
                    </button>
                    <button className="adc-pick-view" onClick={() => setSel({ subject: p.subject, unit: p.unit })}>
                      View tree
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── ROSTER — every unlocked unit, free points on the chip ── */}
      <section className="adc-roster" aria-label="Adaptable roster">
        {[{ label: 'Strains', list: towers }, { label: 'Champions', list: heroes }].map(({ label, list }) => (
          list.length > 0 && (
            <div className="adc-group" key={label}>
              <div className="adc-group-h">{label}</div>
              <div className="adc-chips" role="tablist" aria-label={label}>
                {list.map((u) => {
                  const d = unitDef(u);
                  const on = active?.subject === u.subject && active.unit === u.unit;
                  return (
                    <button
                      key={`${u.subject}:${u.unit}`}
                      role="tab"
                      aria-selected={on}
                      className={`adc-chip${on ? ' on' : ''}`}
                      style={{ ['--uc' as string]: d.color }}
                      onClick={() => setSel({ subject: u.subject, unit: u.unit })}
                    >
                      <i className="adc-chip-dot" aria-hidden />
                      {d.name}
                      {u.free > 0 && <b className="adc-chip-free">{u.free}</b>}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ))}
        <p className="adc-note">Dormant strains adapt once synthesized in the Tower Lab; new champions join as they unlock.</p>
      </section>

      {/* ── THE TREE — the selected unit's full lab (inspector, gates, respec) ── */}
      {active && activeDef ? (
        <section className="adc-tree" aria-label={`${activeDef.name} adaptation tree`}>
          <div className="adc-tree-h" style={{ color: activeDef.color }}>
            {activeDef.name} — {active.subject === 'tower' ? 'strain' : 'champion'} tree
          </div>
          <AdaptationTree key={`${active.subject}:${active.unit}`} subject={active.subject} unit={active.unit} color={activeDef.color} />
        </section>
      ) : (
        <p className="adc-note">Synthesize a tower or unlock a champion to open its adaptation tree.</p>
      )}
    </div>
  );
}
