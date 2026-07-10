// PHENOTYPE LAB (docs/COSMETICS.md) — the cosmetics wardrobe. One row per tower and hero
// (registry-driven: new kinds appear automatically), each with a LIVE themed preview of the
// actual turret body, the Default look, every owned phenotype as an equip chip, and locked
// ones dimmed with their source (Cultivate / Contract / Nemesis). Cultivation rolls ONE
// random unowned common-pool phenotype for Gene Essence. Equipping is pure presentation.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { TowerKind } from '../core/types';
import {
  COSMETIC_RARITY_COLOR, CULTIVATE_COST, cosmeticById, cosmeticsForHero, cosmeticsForTower, cultivatePool,
} from '../core/cosmetics';
import type { CosmeticDef } from '../core/cosmetics';
import { drawTowerForm } from '../render/towerForms';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';
import { t, useLocale } from '../i18n';

/** A tiny live render of the ACTUAL turret body in the candidate color — the honest preview. */
function TowerPreview({ kind, color }: { kind: TowerKind; color: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#0a0e15';
    ctx.fillRect(0, 0, 64, 64);
    drawTowerForm(ctx, kind, 32, 34, 15, color, 1.5, 0, 1);
  }, [kind, color]);
  return <canvas ref={ref} width={64} height={64} className="pl-preview" aria-hidden />;
}

function SkinChips({ defs, equipped, onEquip }: {
  defs: CosmeticDef[];
  equipped: string | undefined;
  onEquip: (id: string | null) => void;
}): JSX.Element {
  const save = meta.use();
  const owned = new Set(save.cosmetics.owned);
  return (
    <div className="pl-chips">
      <button className={`pl-chip${equipped === undefined ? ' on' : ''}`} onClick={() => onEquip(null)}>
        {t('pheno.default')}
      </button>
      {defs.map((d) => {
        const have = owned.has(d.id);
        const rc = COSMETIC_RARITY_COLOR[d.rarity];
        return (
          <button
            key={d.id}
            className={`pl-chip${equipped === d.id ? ' on' : ''}${have ? '' : ' is-locked'}`}
            style={{ ['--pc' as string]: d.theme.primary, ['--rc' as string]: rc }}
            disabled={!have}
            onClick={() => onEquip(d.id)}
            title={have ? d.desc : `${d.desc} — ${t(d.source === 'contract' ? 'pheno.src.contract' : d.source === 'nemesis' ? 'pheno.src.nemesis' : 'pheno.src.cultivate')}`}
          >
            <i className="pl-swatch" aria-hidden />
            {d.name.split(' ')[0]}
            {!have && <span className="pl-lock" aria-hidden>🔒</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PhenotypeLab(): JSX.Element {
  useLocale();
  const save = meta.use();
  const [grown, setGrown] = useState<CosmeticDef | null>(null);
  const ownedCount = save.cosmetics.owned.length;
  const total = cultivatePool().length; // the rollable pool (exclusives shown on rows, counted separately)
  const cultivate = (): void => {
    const def = meta.cultivateCosmetic();
    if (def) {
      audio.cue('chest');
      setGrown(def);
      window.setTimeout(() => setGrown(null), 3500);
    }
  };
  const codex = meta.collection().categories.find((c) => c.id === 'towerSkins');

  return (
    <div className="panel pl-panel">
      <div className="panel-title">
        {t('pheno.title')}
        <span className="ga-wallet" title="Gene Essence"><CurrencyIcon id="geneEssence" size={14} title="" /> {save.geneEssence.toLocaleString()}</span>
      </div>
      <div className="panel-sub">{t('pheno.sub')}</div>

      <div className="pl-top">
        <button className="primary pl-cultivate" disabled={save.geneEssence < CULTIVATE_COST} onClick={cultivate}>
          {t('pheno.cultivate')} · <CurrencyIcon id="geneEssence" size={12} title="" /> {CULTIVATE_COST}
        </button>
        <span className="pl-count">{t('pheno.owned', { owned: ownedCount, total })}</span>
        {codex && codex.completion > 0 && (
          <span className="pl-bonus" title={t('pheno.bonus.tip')}>
            {codex.bonuses.map((b) => `${b.label} ${b.value}`).join(' · ')}
          </span>
        )}
      </div>
      {grown && (
        <div className="pl-grown" role="status" style={{ ['--pc' as string]: grown.theme.primary }}>
          ✷ {t('pheno.grown')} <b style={{ color: grown.theme.primary }}>{grown.name}</b>
        </div>
      )}

      <div className="pl-sec">{t('pheno.towers')}</div>
      {TOWER_ORDER.map((k) => {
        const defs = cosmeticsForTower(k);
        const equipped = save.cosmetics.towers[k];
        const theme = equipped ? cosmeticById(equipped)?.theme : undefined;
        return (
          <div className="pl-row" key={k}>
            <TowerPreview kind={k} color={theme?.primary ?? TOWER_DEFS[k].color} />
            <div className="pl-row-body">
              <div className="pl-name" style={{ color: TOWER_DEFS[k].color }}>{TOWER_DEFS[k].name}</div>
              <SkinChips defs={defs} equipped={equipped} onEquip={(id) => { if (meta.equipCosmetic({ kind: 'tower', tower: k }, id)) audio.cue('ui'); }} />
            </div>
          </div>
        );
      })}

      <div className="pl-sec">{t('pheno.heroes')}</div>
      {HERO_ORDER.map((h) => {
        const defs = cosmeticsForHero(h);
        const equipped = save.cosmetics.heroes[h];
        const theme = equipped ? cosmeticById(equipped)?.theme : undefined;
        return (
          <div className="pl-row" key={h}>
            <span className="pl-hero-swatch" style={{ background: theme?.primary ?? HERO_DEFS[h].color }} aria-hidden />
            <div className="pl-row-body">
              <div className="pl-name" style={{ color: HERO_DEFS[h].color }}>{HERO_DEFS[h].name}</div>
              <SkinChips defs={defs} equipped={equipped} onEquip={(id) => { if (meta.equipCosmetic({ kind: 'hero', hero: h }, id)) audio.cue('ui'); }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
