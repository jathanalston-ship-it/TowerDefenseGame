// LEFT panel — "what I've built this run" (HUD.md §6): the drafted gene cards
// grouped by category with stack counts, and the plain-language rollup of active
// run buffs. Reads only the throttled HudSnapshot (cards/buffs), never the sim.

import { useState } from 'react';
import { affectsOf } from './cardAffects';
import type { CardOption, HudSnapshot } from '../core/types';

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

export function BuildPanel({ hud, onCollapse, onOpenEvolution }: { hud: HudSnapshot; onCollapse?: () => void; onOpenEvolution?: () => void }): JSX.Element {
  const groups = groupCards(hud.cards);
  const hasCards = hud.cards.length > 0;
  // Collapsible sections — grouped, animated, no dead space (docs/HUD.md §left panel).
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const toggle = (k: string): void => setFolded((f) => ({ ...f, [k]: !f[k] }));
  const wavesLeft = Math.max(0, hud.totalWaves - Math.max(0, hud.wave));

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
          <p className="side-empty">No run modifiers yet.</p>
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
