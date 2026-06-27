// Prestige — MOLT panel (PROGRESSION.md §5.1). The "should I ascend?" decision: sacrifice
// banked Shards + core upgrades to mint Ascendant Cells, which permanently raise the global
// damage multiplier (the P bucket). Trophies (stars, mastery, gear, shards) are kept. Reads
// the reactive save store; the action goes through meta.molt.

import { meta } from '../state/meta';

export function PrestigePanel(): JSX.Element {
  meta.use(); // re-render when the save changes
  const p = meta.prestigeView();

  const onMolt = (): void => {
    if (!p.canMolt) return;
    if (confirm(`Molt for +${p.gain} Ascendant Cells?\n\nThis RESETS your banked Shards and core upgrades. Everything else — stars, mastery, gear, shards, loot — is kept.`)) {
      meta.molt();
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">Ascension · Molt</div>
      <div className="panel-sub">
        Sacrifice your banked Shards &amp; core upgrades to mint <b>Ascendant Cells</b> — a permanent,
        compounding global damage multiplier. Stars, mastery, gear and shard currencies are kept.
      </div>

      <div className="records" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="record">
          <div className="k">Global Mult</div>
          <div className="v" style={{ color: 'var(--viral)' }}>×{p.mult.toFixed(2)}</div>
        </div>
        <div className="record">
          <div className="k">Ascendant Cells</div>
          <div className="v">{p.cells}</div>
        </div>
        <div className="record">
          <div className="k">Molts</div>
          <div className="v">{p.molts}</div>
        </div>
      </div>

      <div className="reward" style={{ marginTop: 12 }}>
        Molt now mints <b style={{ color: 'var(--viral)' }}>+{p.gain}</b> Cell{p.gain === 1 ? '' : 's'}
        <span className="hud-sub"> · this cycle: {Math.floor(p.cycleShards)} shards earned</span>
      </div>

      <button className="primary" style={{ marginTop: 10 }} disabled={!p.canMolt} onClick={onMolt}>
        {p.canMolt ? `Molt (+${p.gain} Cells)` : 'Molt — earn more Shards first'}
      </button>
    </div>
  );
}
