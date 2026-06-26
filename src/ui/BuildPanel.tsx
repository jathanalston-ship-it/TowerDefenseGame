// LEFT panel — "what I've built this run" (HUD.md §6): the drafted gene cards
// grouped by category with stack counts, and the plain-language rollup of active
// run buffs. Reads only the throttled HudSnapshot (cards/buffs), never the sim.

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

export function BuildPanel({ hud, onCollapse }: { hud: HudSnapshot; onCollapse?: () => void }): JSX.Element {
  const groups = groupCards(hud.cards);
  const hasCards = hud.cards.length > 0;

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

      <div className="side-sec">
        <div className="side-k">Gene Cards{hasCards ? ` · ${hud.cards.length}` : ''}</div>
        {hasCards ? (
          <div className="card-groups">
            {groups.map((g) => (
              <div className="card-group" key={g.category}>
                <div className="card-cat">{g.category}</div>
                <div className="card-chips">
                  {g.stacks.map((s) => (
                    <span
                      key={s.opt.id}
                      className="card-chip tt"
                      data-rarity={s.opt.rarity}
                      tabIndex={0}
                    >
                      {s.opt.name}
                      {s.count > 1 && <b className="stack">×{s.count}</b>}
                      <span className="tt-bubble">{s.opt.description}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="side-empty">Draft gene cards between waves to shape this run.</p>
        )}
      </div>

      <div className="side-sec">
        <div className="side-k">Active Effects</div>
        {hud.buffs.length > 0 ? (
          <div className="buff-chips">
            {hud.buffs.map((b) => (
              <span className="buff-chip" key={b}>
                {b}
              </span>
            ))}
          </div>
        ) : (
          <p className="side-empty">No run modifiers yet.</p>
        )}
      </div>
    </aside>
  );
}
