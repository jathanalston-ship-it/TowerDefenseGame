// Evolution HQ (docs/EVOLUTION-HQ.md) — the permanent-progression headquarters. A living-lab
// backdrop, a 9-stat account readout, the Genome Core upgrades grouped into category sections with
// rich cards, the Ascension (Molt + Ascendant Tree) block, and a Future-Locked teaser. Presentation
// only: reads the reactive save + meta selectors; purchases route through meta.buyUpgrade.

import { useEffect, useRef, useState } from 'react';
import { meta, metaModifiers, highestCampaignStage } from '../state/meta';
import { genomeSections, FUTURE_LOCKED } from '../state/evolutionHQ';
import type { GenomeSection, GenomeCardView } from '../state/evolutionHQ';
import { SLOTS } from '../core/config';
import { formatPower } from '../core/power';
import { ProgressBar } from './components/ProgressBar';
import { PowerDelta } from './components/PowerScore';
import { CurrencyIcon } from './components/CurrencyIcon';
import { PrestigePanel } from './PrestigePanel';

/** The living-lab backdrop — drifting cells + a rotating DNA helix. Pure decoration. */
function EvoBackdrop(): JSX.Element {
  return (
    <div className="evo-hq-bg" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => <span className="evo-cell" key={i} style={{ ['--i' as string]: i }} />)}
      <div className="evo-dna">
        {Array.from({ length: 14 }, (_, i) => <span className="evo-dna-rung" key={i} style={{ ['--r' as string]: i }} />)}
      </div>
    </div>
  );
}

function StatLine({ label, value, accent }: { label: string; value: string; accent?: string }): JSX.Element {
  return (
    <div className="evo-stat">
      <div className="evo-stat-v" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="evo-stat-k">{label}</div>
    </div>
  );
}

function GenomeCard({ card, curPower, onBuy, justBought }: {
  card: GenomeCardView; curPower: number; onBuy: (id: string) => void; justBought: boolean;
}): JSX.Element {
  const save = meta.use();
  const affordable = card.cost !== null && save.shards >= card.cost;
  const nextPower = card.completed ? curPower
    : meta.previewPower((s) => ({ ...s, upgrades: { ...s.upgrades, [card.id]: card.level + 1 } })).score;
  return (
    <div className={`evohq-card${card.completed ? ' is-complete' : ''}${justBought ? ' is-just-bought' : ''}`}>
      <div className="evo-card-h">
        <span className="evo-card-name">{card.name}</span>
        <span className="evo-card-lvl">{card.completed ? 'MAX' : `Lv ${card.level}/${card.maxLevel}`}</span>
      </div>
      <p className="evo-card-desc">{card.description}</p>
      <ProgressBar value={card.level} max={card.maxLevel} segments={card.maxLevel} height={6} color="var(--gold)" className="bar-upgrade" label={`${card.name} level`} />
      <div className="evo-card-eff">
        <span className="evo-eff-now">{card.effectNow}</span>
        {!card.completed && <><span className="evo-eff-arrow">→</span><span className="evo-eff-next">{card.effectNext}</span></>}
      </div>
      <div className="evo-card-foot">
        {nextPower !== curPower && !card.completed && (
          <span className="evo-card-power">Power <PowerDelta current={curPower} next={nextPower} /></span>
        )}
        <button
          className={`shop-buy evo-card-buy ${affordable ? 'is-afford' : ''}`}
          disabled={card.completed || !affordable}
          onClick={() => onBuy(card.id)}
        >
          {card.completed ? '✓ Complete' : <>{card.cost} <CurrencyIcon id="genomeCores" /></>}
        </button>
      </div>
    </div>
  );
}

function SectionBlock({ section, curPower, onBuy, justBought }: {
  section: GenomeSection; curPower: number; onBuy: (id: string) => void; justBought: string | null;
}): JSX.Element {
  return (
    <section className="evo-hq-section">
      <div className="evo-sec-head">
        <span className="evo-sec-icon" aria-hidden>{section.icon}</span>
        <div className="evo-sec-title-wrap">
          <div className="evo-sec-title">{section.title}</div>
          <div className="evo-sec-desc">{section.desc}</div>
        </div>
        <div className="evo-sec-prog">
          <div className="evo-sec-pct">{section.completionPct}%</div>
          <ProgressBar value={section.boughtLevels} max={section.totalLevels} height={5} color="var(--viral)" label={`${section.title} completion`} />
          <div className="evo-sec-meta">{section.boughtLevels}/{section.totalLevels} levels · <CurrencyIcon id="genomeCores" size={11} title="" /> {section.coresSpent} spent</div>
        </div>
      </div>
      <div className="evo-card-grid">
        {section.cards.map((c) => (
          <GenomeCard key={c.id} card={c} curPower={curPower} onBuy={onBuy} justBought={justBought === c.id} />
        ))}
      </div>
    </section>
  );
}

export function EvolutionHQ(): JSX.Element {
  const save = meta.use();
  const [justBought, setJustBought] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onBuy = (id: string): void => {
    if (!meta.buyUpgrade(id)) return;
    setJustBought(id); // brief purchase-feedback pulse
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustBought(null), 620);
  };

  const curPower = meta.power().score;
  const mm = metaModifiers(save);
  const sections = genomeSections(save);
  const prestige = meta.prestigeView();
  const towerCap = Math.min(SLOTS.permanentMax, SLOTS.initialUnlocked + mm.bonusSlots);
  const pct = (m: number): string => `×${m.toFixed(2)}`;

  return (
    <div className="evo-hq">
      <EvoBackdrop />
      <header className="evo-hq-head">
        <div className="evo-hq-eyebrow">✷ Permanent Progression</div>
        <h2 className="evo-hq-title">Evolution HQ</h2>
        <p className="evo-hq-sub">Sink Genome Cores into permanent mutations, then Molt to spend Ascendant Cells on levers that survive every reset.</p>
      </header>

      {/* Account statistics — the permanent state at a glance. */}
      <section className="evo-stats" aria-label="Permanent statistics">
        <StatLine label="Total Power" value={formatPower(curPower)} accent="var(--gold)" />
        <StatLine label="Permanent Damage" value={pct(mm.towerDamageMult)} />
        <StatLine label="Permanent Biomass" value={pct(mm.biomassMult)} />
        <StatLine label="Hero Strength" value={pct(mm.heroDamageMult)} />
        <StatLine label="Tower Capacity" value={`${towerCap}`} />
        <StatLine label="Prestige Multiplier" value={pct(prestige.mult)} accent="var(--viral)" />
        <StatLine label="Lifetime Genome Cores" value={`${save.lifetimeShards}`} />
        <StatLine label="Lifetime Ascendant Cells" value={`${save.prestige.lifetimeCells}`} accent="var(--viral)" />
        <StatLine label="Campaign Depth" value={`Stage ${highestCampaignStage(save)}`} />
      </section>

      {/* Genome Core sections — one per category. */}
      {sections.map((sec) => (
        <SectionBlock key={sec.category} section={sec} curPower={curPower} onBuy={onBuy} justBought={justBought} />
      ))}

      {/* Ascension — Molt gate + Ascendant Tree (the existing panel, one source of truth). */}
      <section className="evo-hq-section evo-ascension">
        <div className="evo-sec-head">
          <span className="evo-sec-icon" aria-hidden>✸</span>
          <div className="evo-sec-title-wrap">
            <div className="evo-sec-title">Ascension</div>
            <div className="evo-sec-desc">Sacrifice the Genome engine to mint Ascendant Cells — permanent power that never resets.</div>
          </div>
        </div>
        <PrestigePanel />
      </section>

      {/* Future Locked — the visible long horizon. */}
      <section className="evo-hq-section evo-future">
        <div className="evo-sec-head">
          <span className="evo-sec-icon is-locked" aria-hidden>🔒</span>
          <div className="evo-sec-title-wrap">
            <div className="evo-sec-title">Future Evolution</div>
            <div className="evo-sec-desc">Deeper ascension layers, coming as the organism matures.</div>
          </div>
        </div>
        <div className="evo-future-grid">
          {FUTURE_LOCKED.map((f) => (
            <div className="evo-future-card" key={f.name}>
              <div className="evo-future-name">🔒 {f.name}</div>
              <div className="evo-future-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
