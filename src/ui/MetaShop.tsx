import { meta, nextUpgradeCost, upgradeLevel } from '../state/meta';
import { ProgressBar } from './components/ProgressBar';
import { Icon } from './components/Icon';

export function MetaShop(): JSX.Element {
  const save = meta.use();
  return (
    <div className="panel">
      <div className="panel-title">Permanent Upgrades</div>
      <div className="panel-sub">Spend Shards. These multipliers persist across every run.</div>
      <div className="shop-list">
        {meta.upgrades.map((u) => {
          const level = upgradeLevel(save, u.id);
          const cost = nextUpgradeCost(save, u);
          const maxed = cost === null;
          const affordable = cost !== null && save.shards >= cost;
          return (
            <div className={`shop-item ${maxed ? 'is-maxed' : ''}`} key={u.id}>
              <div className="info">
                <div className="name">
                  {u.name} <span className="lvl">Lv {level}/{u.maxLevel}</span>
                </div>
                <div className="desc">{u.description}</div>
                <ProgressBar
                  value={level}
                  max={u.maxLevel}
                  color="var(--gold)"
                  height={6}
                  segments={u.maxLevel}
                  className="bar-upgrade"
                  label={`${u.name} level`}
                />
              </div>
              <button
                className={`shop-buy ${affordable ? 'is-afford' : ''} ${maxed ? '' : 'btn-ico'}`}
                disabled={maxed || !affordable}
                onClick={() => meta.buyUpgrade(u.id)}
              >
                {maxed ? 'MAX' : (
                  <>
                    {cost} <Icon name="diamond" size={11} />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
