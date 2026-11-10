// LEFT panel — "what I've built this run" (HUD.md §6): the drafted gene cards
// grouped by category with stack counts, and the plain-language rollup of active
// run buffs. Reads only the throttled HudSnapshot (cards/buffs), never the sim.

import { useState } from 'react';
import { affectsOf } from './cardAffects';
import type { CardOption, HudSnapshot } from '../core/types';
import { COMBAT_CLASSES } from '../core/combatClass';
import { BOND, CLASS_BONDS, bondFxLine, bondTierFx } from '../core/classBonds';
import type { BondTier } from '../core/classBonds';
import { threatRungs } from '../core/threat';

type RunCommitment = { icon: string; name: string; blurb: string };

const ROMAN = ['', 'I', 'II', 'III'] as const;

/** CLASS BONDS (docs/CLASS-BONDS.md) — every class with a fielded unit: glyph, count toward the next
 *  tier, three tier pips, and expandable effects at the run's resolved bond level. */
function BondsSection({ bonds }: { bonds: NonNullable<HudSnapshot['bonds']> }): JSX.Element {
  return (
    <div className="side-sec bonds-strip" aria-label="Class bonds">
      <div className="side-k">Class Bonds</div>
      {bonds.length === 0 ? (
        <p className="side-empty">Field {BOND.thresholds[0]} units of one class to wake its bond.</p>
      ) : (
        <div className="bond-chips">
          {bonds.map((b) => {
            const cc = COMBAT_CLASSES[b.cls];
            const def = CLASS_BONDS[b.cls];
            const tier = b.tier as BondTier;
            const tip = tier > 0
              ? `${def.name} ${ROMAN[tier]} — ${bondFxLine(bondTierFx(b.cls, tier, b.level))}${b.next ? ` · ${b.next - b.count} more for tier ${ROMAN[tier + 1]}` : ''}`
              : `${def.name} — ${(b.next ?? 0) - b.count} more ${b.cls} unit${(b.next ?? 0) - b.count === 1 ? '' : 's'} to wake it`;
            return (
              <details className="bond-entry" key={b.cls} onKeyDown={(event) => {
                if (event.key !== 'Escape') event.stopPropagation();
              }}>
                <summary className={`bond-chip${tier > 0 ? ' is-on' : ''}`} style={{ ['--cc' as string]: cc.color }}
                  aria-label={`${b.cls} bond, tier ${tier} of 3, ${b.count} ${b.count === 1 ? 'unit' : 'units'} deployed. Effects and next tier`}>
                  <i className="bond-glyph" aria-hidden>{cc.glyph}</i>
                  <span className="bond-name">{b.cls}</span>
                  <span className="bond-count">{b.count}{b.next ? `/${b.next}` : ''}</span>
                  <span className="bond-pips" aria-hidden>
                    {[1, 2, 3].map((n) => <i key={n} className={n <= tier ? 'on' : ''} />)}
                  </span>
                </summary>
                <p className="bond-detail">{tip}</p>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Stack {
  opt: CardOption;
  count: number;
}

/** Group drafted cards by category, counting duplicates as stacks. */
function groupCards(cards: CardOption[]): { category: string; stacks: Stack[] }[] {
  const byCat = new Map<string, Map<string, Stack>>();
  for (const c of cards) {
    let g = byCat.get(c.category);
    if (!g) byCat.set(c.category, (g = new Map()));
    const s = g.get(c.id);
    if (s) s.count++;
    else g.set(c.id, { opt: c, count: 1 });
  }
  return [...byCat.entries()].map(([category, m]) => ({ category, stacks: [...m.values()] }));
}

export function BuildPanel({ hud, onCollapse, onOpenEvolution, doctrine = null, vows = [] }: {
  hud: HudSnapshot;
  onCollapse?: () => void;
  onOpenEvolution?: () => void;
  doctrine?: RunCommitment | null;
  vows?: RunCommitment[];
}): JSX.Element {
  const groups = groupCards(hud.cards);
  const hasCards = hud.cards.length > 0;
  // Collapsible sections — grouped, animated, no dead space (docs/HUD.md §left panel).
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const toggle = (k: string): void => setFolded((f) => ({ ...f, [k]: !f[k] }));
  const wavesLeft = Math.max(0, hud.totalWaves - Math.max(0, hud.wave));
  const hasConditions = !!doctrine || vows.length > 0 || hud.threat > 0 || hud.biome.id !== 'neutral' || !!hud.runHeadline || !!hud.runEvent;

  return (
    <aside className="side-panel build-panel" aria-label="Run build">
      <div className="side-head">
        <span>Run Build</span>
        {onCollapse && (
          <button className="panel-collapse" onClick={onCollapse} title="Hide panel" aria-label="Hide panel">
            «
          </button>
        )}
      </div>

      {hud.bonds && <BondsSection bonds={hud.bonds} />}

      <div className={`side-sec${folded.cards ? ' is-folded' : ''}`}>
        <button className="side-k side-fold" onClick={() => toggle('cards')} aria-expanded={!folded.cards}>
          Gene Cards{hasCards ? ` · ${hud.cards.length}` : ''}
          <i aria-hidden>{folded.cards ? '▸' : '▾'}</i>
        </button>
        {!folded.cards && (hasCards ? (
          <div className="card-groups">
            {groups.map((g) => (
              <div className="card-group" key={g.category}>
                <div className="card-cat">{g.category}</div>
                <div className="card-chips">
                  {g.stacks.map((s) => {
                    const aff = affectsOf(s.opt.subject);
                    return (
                      <span
                        key={s.opt.id}
                        className="card-chip tt"
                        data-rarity={s.opt.rarity}
                        tabIndex={0}
                      >
                        <span className="chip-dot" style={{ background: aff.color }} aria-hidden />
                        {s.opt.name}
                        {s.count > 1 && <b className="stack">×{s.count}</b>}
                        <span className="tt-bubble">{aff.label} · {s.opt.description}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="side-empty">Draft gene cards between waves to shape this run.</p>
        ))}
      </div>

      {/* Hero Combat Console — the in-run Biomass sink (docs/HERO-EVOLUTION.md §console). */}
      {onOpenEvolution && (
        <div className="side-sec">
          <button className="evo-open-btn" onClick={onOpenEvolution} title="Open the Hero Combat Console (E) — spend Biomass to evolve every champion for this run">
            <span className="evo-open-i" aria-hidden>🧬</span>
            <span className="evo-open-body">
              <span className="evo-open-l">Hero Console</span>
              <span className="evo-open-hint">Evolve heroes · E</span>
            </span>
            {hud.heroEvo.totalOwned > 0 ? (
              <span className="evo-open-count" title={`${hud.heroEvo.totalOwned} evolution levels active`}>▲{hud.heroEvo.totalOwned}</span>
            ) : (
              <span className="evo-open-chev" aria-hidden>▸</span>
            )}
          </button>
        </div>
      )}

      {hasConditions && (
        <details className="side-sec run-conditions" onKeyDown={(event) => {
          // Native disclosure/reading keys must not also trigger battlefield shortcuts.
          if (event.key !== 'Escape') event.stopPropagation();
        }}>
          <summary className="side-k">Run conditions</summary>
          <dl>
            {doctrine && <div><dt>{doctrine.icon} Doctrine · {doctrine.name}</dt><dd>{doctrine.blurb}</dd></div>}
            {vows.map((vow) => <div key={vow.name}><dt>{vow.icon} {vow.name}</dt><dd>{vow.blurb} Active for this Molt cycle.</dd></div>)}
            {hud.threat > 0 && <div><dt>Threat {hud.threat}</dt><dd>These ladder modifiers stack for this run.</dd></div>}
            {threatRungs(hud.threat).map((rung) => <div key={rung.level}><dt>{rung.icon} {rung.level}. {rung.name}</dt><dd>{rung.blurb}</dd></div>)}
            {hud.biome.id !== 'neutral' && <div><dt>Biome · {hud.biome.name}</dt><dd>{hud.biome.modifier || 'Current battlefield biome.'}{hud.biome.hazardActive ? ` · Active hazard: ${hud.biome.hazardName}` : ''}</dd></div>}
            {hud.runHeadline && <div><dt>Run identity</dt><dd>{hud.runHeadline}</dd></div>}
            {hud.runEvent && <div><dt>Current event · {hud.runEvent.name}</dt><dd>{hud.runEvent.desc}</dd></div>}
          </dl>
        </details>
      )}

      <div className={`side-sec${folded.fx ? ' is-folded' : ''}`}>
        <button className="side-k side-fold" onClick={() => toggle('fx')} aria-expanded={!folded.fx}>
          Active Effects{hud.buffs.length > 0 ? ` · ${hud.buffs.length}` : ''}
          <i aria-hidden>{folded.fx ? '▸' : '▾'}</i>
        </button>
        {!folded.fx && (hud.buffs.length > 0 ? (
          <div className="buff-chips">
            {hud.buffs.map((b) => (
              <span className="buff-chip" key={b}>
                {b}
              </span>
            ))}
          </div>
        ) : (
          <p className="side-empty">No active bonuses to show.</p>
        ))}
      </div>

      {/* Objectives — where this run is headed, always visible at a glance. */}
      <div className="side-sec side-obj">
        <div className="side-k">Objectives</div>
        <ul className="obj-list">
          <li className="obj-row">
            <i className="obj-dot" aria-hidden />
            {hud.endless ? `Hold the line · depth ${Math.max(1, hud.wave)}` : hud.bossRush ? `Fell the column · wave ${Math.max(1, hud.wave)}` : wavesLeft > 0 ? `Survive ${wavesLeft} more wave${wavesLeft === 1 ? '' : 's'}` : 'Final wave — finish it'}
          </li>
          {hud.anticipation.slice(0, 2).map((a) => (
            <li className="obj-row is-next" key={a}>
              <i className="obj-dot" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
