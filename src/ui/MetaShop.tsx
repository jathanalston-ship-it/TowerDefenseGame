import { meta, nextUpgradeCost, upgradeLevel } from '../state/meta';
import type { UpgradeDef } from '../core/config';
import type { Currency } from '../core/types';
import type { SaveData } from '../save/saveStore';
import { ProgressBar } from './components/ProgressBar';
import { Icon } from './components/Icon';

const CURRENCY_LABEL: Record<Currency, string> = { shards: 'Shards', essence: 'Essence', components: 'Components' };

const TRACKS: { key: 'core' | 'mastery' | 'equipment'; title: string; sub: string; currency: Currency }[] = [
  { key: 'core', title: 'Core Upgrades', sub: 'Raw power — bought with Shards (Stage & Classic).', currency: 'shards' },
  { key: 'mastery', title: 'Mastery', sub: 'Tempo & utility — bought with Essence (Endless).', currency: 'essence' },
  { key: 'equipment', title: 'Equipment', sub: 'Defensive relics — bought with Components (Stage clears).', currency: 'components' },
];

function ShopItem({ u, save }: { u: UpgradeDef; save: SaveData }): JSX.Element {
  const level = upgradeLevel(save, u.id);
  const cost = nextUpgradeCost(save, u);
  const maxed = cost === null;
  const affordable = cost !== null && save[u.currency] >= cost;
  return (
    <div className={`shop-item ${maxed ? 'is-maxed' : ''}`}>
      <div className="info">
        <div className="name">
          {u.name} <span className="lvl">Lv {level}/{u.maxLevel}</span>
        </div>
        <div className="desc">{u.description}</div>
        <ProgressBar value={level} max={u.maxLevel} color="var(--gold)" height={6} segments={u.maxLevel} label={`${u.name} level`} />
      </div>
      <button
        className={`shop-buy ${affordable ? 'is-afford' : ''} ${maxed ? '' : 'btn-ico'}`}
        disabled={maxed || !affordable}
        onClick={() => meta.buyUpgrade(u.id)}
      >
        {maxed ? 'MAX' : (<>{cost} <Icon name="diamond" size={11} /></>)}
      </button>
    </div>
  );
}

export function MetaShop(): JSX.Element {
  const save = meta.use();
  return (
    <>
      {TRACKS.map((tr) => (
        <div className="panel" key={tr.key}>
          <div className="panel-title">
            {tr.title}
            <span className="track-bal">{save[tr.currency]} {CURRENCY_LABEL[tr.currency]}</span>
          </div>
          <div className="panel-sub">{tr.sub}</div>
          <div className="shop-list">
            {meta.tracks[tr.key].map((u) => (
              <ShopItem key={u.id} u={u} save={save} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
