// Prestige — MOLT panel (PROGRESSION.md §5.1). The "should I ascend?" decision: sacrifice
// banked Genome Cores + core upgrades to mint Ascendant Cells, which permanently raise the global
// damage multiplier (the P bucket). Trophies (stars, mastery, gear, shards) are kept. Reads
// the reactive save store; the action goes through meta.molt.

import { meta } from '../state/meta';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';

export function PrestigePanel(): JSX.Element {
  meta.use(); // re-render when the save changes
  const p = meta.prestigeView();

  const onMolt = (): void => {
    if (!p.canMolt) return;
    if (confirm(`Molt for +${p.gain} Ascendant Cells?\n\nThis RESETS your banked ${ACCOUNT_CURRENCY.name} and core upgrades. Everything else — stars, mastery, gear, shards, loot — is kept.`)) {
      meta.molt();
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">Ascension · Molt</div>
      <div className="panel-sub">
        Sacrifice your banked {ACCOUNT_CURRENCY.name} &amp; core upgrades to mint <b>Ascendant Cells</b> — a permanent,
        compounding global damage multiplier. Stars, mastery, gear and shard currencies are kept.
      </div>

      <div className="records" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="record">
          <div className="k">Global Mult</div>
          <div className="v" style={{ color: 'var(--viral)' }}>×{p.mult.toFixed(2)}</div>
        </div>
        <div className="record">
          <div className="k">Ascendant Cells</div>
          <div className="v" style={{ color: 'var(--viral)' }}><CurrencyIcon id="ascendantCells" size={15} title="" /> {p.cells}</div>
        </div>
        <div className="record">
          <div className="k">Molts</div>
          <div className="v">{p.molts}</div>
        </div>
      </div>

      <div className="reward" style={{ marginTop: 12 }}>
        Molt now mints <b style={{ color: 'var(--viral)' }}>+{p.gain}</b> Cell{p.gain === 1 ? '' : 's'}
        <span className="hud-sub"> · this cycle: {Math.floor(p.cycleShards)} {ACCOUNT_CURRENCY.name} earned</span>
      </div>

      <button className="primary" style={{ marginTop: 10 }} disabled={!p.canMolt} onClick={onMolt}>
        {p.canMolt ? `Molt (+${p.gain} Cells)` : `Molt — earn more ${ACCOUNT_CURRENCY.name} first`}
      </button>

      {(() => {
        // Ascendant Tree: spend Cells on permanent economy nodes (kept across every Molt).
        const tree = meta.ascendantNodes();
        return (
          <div className="ascendant-tree">
            <div className="mp-codex-h">Ascendant Tree · {tree.cells} <CurrencyIcon id="ascendantCells" size={13} title="" /> cells</div>
            {tree.nodes.map((n) => (
              <div className="lab-evo" key={n.id} style={{ borderLeftColor: 'var(--viral)' }}>
                <div className="asc-node-head">
                  <span>
                    <b style={{ color: 'var(--viral)' }}>{n.name}</b>
                    <span className="hud-sub"> · Lv {n.level}/{n.maxLevel}</span>
                  </span>
                  <button
                    className={`shop-buy ${n.affordable ? 'is-afford' : ''}`}
                    disabled={n.cost === null || !n.affordable}
                    onClick={() => meta.buyAscendantNode(n.id)}
                  >
                    {n.cost === null ? 'MAX' : <>{n.cost} <CurrencyIcon id="ascendantCells" size={12} title="" /></>}
                  </button>
                </div>
                <span className="lab-evo-desc">{n.desc}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
