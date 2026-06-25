import { meta, nextUpgradeCost, upgradeLevel } from '../state/meta';

export function MetaShop(): JSX.Element {
  const save = meta.use();
  return (
    <div className="panel">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Permanent Upgrades</div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 6 }}>
        Spend Shards. These multipliers persist across every run.
      </div>
      {meta.upgrades.map((u) => {
        const level = upgradeLevel(save, u.id);
        const cost = nextUpgradeCost(save, u);
        const maxed = cost === null;
        const affordable = cost !== null && save.shards >= cost;
        return (
          <div className="shop-item" key={u.id}>
            <div className="info">
              <div className="name">{u.name}</div>
              <div className="desc">{u.description}</div>
              <div className="pips">
                {Array.from({ length: u.maxLevel }, (_, i) => (
                  <span key={i} className={`pip ${i < level ? 'on' : ''}`} />
                ))}
              </div>
            </div>
            <button
              disabled={maxed || !affordable}
              onClick={() => meta.buyUpgrade(u.id)}
              style={{ minWidth: 96 }}
            >
              {maxed ? 'MAX' : `${cost} ◆`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
