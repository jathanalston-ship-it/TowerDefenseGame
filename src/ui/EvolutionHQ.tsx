// Evolution HQ (docs/EVOLUTION-HQ.md) — the permanent-progression headquarters. A living-lab
// backdrop, a Genome Cores treasury banner, SectionNav chips + folds (one per section), a 10-stat account
// readout, the Genome Core upgrades grouped into category sections with rich cards — each
// section capped catalog + ONE uncapped RUNAWAY sink card (§runaway: √level returns, geometric
// cost, hold-to-repeat buying) — the Ascension (Molt + Ascendant Tree) block, and a
// Future-Locked teaser. Presentation only: reads the reactive save + meta selectors; purchases
// route through meta.buyUpgrade.

import { useEffect, useMemo, useRef, useState } from 'react';
import { meta, metaModifiers, highestCampaignStage } from '../state/meta';
import { telemetry } from '../net/telemetry';
import { genomeSections, genomeRebuildPlan, FUTURE_LOCKED } from '../state/evolutionHQ';
import type { GenomeSection, GenomeCardView, GenomeRebuildPlan } from '../state/evolutionHQ';
import { Popup } from './components/Popup';
import { audio } from '../audio/sound';
import { organizeList, toggleIn } from '../state/listOrg';
import type { ListOrgSpec, ListOrgState } from '../state/listOrg';
import { listOrgPrefs, setListOrgPrefs } from '../state/prefs';
import { ListControls } from './components/ListControls';
import { SLOTS } from '../core/config';
import { formatPower } from '../core/power';
import { ProgressBar } from './components/ProgressBar';
import { PowerPreview } from './components/PowerScore';
import { CurrencyIcon } from './components/CurrencyIcon';
import { usePressRepeat } from './components/usePressRepeat';
import { SectionNav } from './components/SectionNav';
import { PrestigePanel } from './PrestigePanel';
import { BestBuyStrip } from './components/BestBuyStrip';
import './EvolutionHQ.css';

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
  card: GenomeCardView; curPower: number; onBuy: (id: string) => boolean; justBought: boolean;
}): JSX.Element {
  const save = meta.use();
  const affordable = card.cost !== null && save.shards >= card.cost;
  // Hold-to-buy (QOL): the Runaway card's press-repeat, now on every fixed tier — the loop
  // stops itself at the cap or an unaffordable step (buyUpgrade's boolean).
  const hold = usePressRepeat(() => onBuy(card.id));
  const nextPower = card.completed ? curPower
    : meta.previewPower((s) => ({ ...s, upgrades: { ...s.upgrades, [card.id]: card.level + 1 } })).score;
  return (
    <div className={`evohq-card${card.completed ? ' is-complete' : ''}${card.locked ? ' is-locked' : ''}${justBought ? ' is-just-bought' : ''}`}>
      <div className="evo-card-h">
        <span className="evo-card-name">{card.locked ? '🔒 ' : ''}{card.name}</span>
        <span className="evo-card-lvl">{card.completed ? 'MAX' : `Lv ${card.level}/${card.maxLevel}`}</span>
      </div>
      <p className="evo-card-desc">{card.description}</p>
      {card.locked && <p className="evo-card-gate">🔒 {card.unlockNote}</p>}
      <ProgressBar value={card.level} max={card.maxLevel} segments={card.maxLevel} height={6} color="var(--gold)" className="bar-upgrade" label={`${card.name} level`} />
      <div className="evo-card-eff">
        <span className="evo-eff-now">{card.effectNow}</span>
        {!card.completed && <><span className="evo-eff-arrow">→</span><span className="evo-eff-next">{card.effectNext}</span></>}
      </div>
      <div className="evo-card-foot">
        {nextPower !== curPower && !card.completed && (
          <span className="evo-card-power">Power <PowerPreview current={curPower} next={nextPower} /></span>
        )}
        <button
          className={`shop-buy evo-card-buy ${affordable && !card.locked ? 'is-afford' : ''}`}
          disabled={card.completed || !affordable || card.locked}
          {...hold}
          title={card.locked ? card.unlockNote : 'Hold to buy repeatedly'}
        >
          {card.completed ? '✓ Complete' : card.locked ? 'Locked' : <>{card.cost} <CurrencyIcon id="genomeCores" /></>}
        </button>
      </div>
    </div>
  );
}

/** The RUNAWAY sink card — uncapped, √level returns, geometric cost. Hold the buy button to
 *  chain purchases (usePressRepeat); the decade bar gives level rhythm without a fake cap. */
function RunawayCard({ card, curPower, onBuy, justBought }: {
  card: GenomeCardView; curPower: number; onBuy: (id: string) => boolean; justBought: boolean;
}): JSX.Element {
  const save = meta.use();
  const affordable = card.cost !== null && save.shards >= card.cost;
  const nextPower = meta.previewPower((s) => ({ ...s, upgrades: { ...s.upgrades, [card.id]: card.level + 1 } })).score;
  const hold = usePressRepeat(() => onBuy(card.id));
  return (
    <div className={`evohq-card is-runaway${justBought ? ' is-just-bought' : ''}`}>
      <div className="evo-card-h">
        <span className="evo-run-badge" aria-hidden>∞</span>
        <span className="evo-card-name">{card.name}</span>
        <span className="evo-card-lvl">Lv {card.level}</span>
      </div>
      <p className="evo-card-desc">{card.description}</p>
      <ProgressBar value={card.level % 10} max={10} segments={10} height={6} color="var(--viral)" className="bar-upgrade" label={`${card.name} level (decade)`} />
      <div className="evo-card-eff">
        <span className="evo-eff-now">{card.effectNow}</span>
        <span className="evo-eff-arrow">→</span>
        <span className="evo-eff-next">{card.effectNext}</span>
        <span className="evo-run-sunk" title="Genome Cores sunk into this mutation">{card.spent.toLocaleString()} <CurrencyIcon id="genomeCores" size={11} title="" /> sunk</span>
      </div>
      <div className="evo-card-foot">
        {nextPower !== curPower && (
          <span className="evo-card-power">Power <PowerPreview current={curPower} next={nextPower} /></span>
        )}
        <button
          className={`shop-buy evo-card-buy evo-run-buy ${affordable ? 'is-afford' : ''}`}
          disabled={!affordable}
          title="Hold to buy repeatedly"
          {...hold}
        >
          {card.cost?.toLocaleString()} <CurrencyIcon id="genomeCores" />
        </button>
      </div>
    </div>
  );
}

/** One Genome category's cards — a SectionNav section body (the section header carries the
 *  category's icon, title, description and completion; one header, every layout profile). */
function SectionGrid({ section, curPower, onBuyRunaway, justBought }: {
  section: GenomeSection; curPower: number;
  onBuyRunaway: (id: string) => boolean; justBought: string | null;
}): JSX.Element {
  return (
    <div className="evo-card-grid">
      {section.cards.map((c) => (
        c.infinite
          ? <RunawayCard key={c.id} card={c} curPower={curPower} onBuy={onBuyRunaway} justBought={justBought === c.id} />
          : <GenomeCard key={c.id} card={c} curPower={curPower} onBuy={onBuyRunaway} justBought={justBought === c.id} />
      ))}
    </div>
  );
}

/** ONE-TAP GENOME REBUILD (docs/EVOLUTION-HQ.md §rebuild) — after a Molt, spend the treasury
 *  along the Best Value ranking in one confirmed plan instead of 20–50 manual re-buys. The
 *  confirm lists every level and the exact Power after (the apply's own builder — preview ==
 *  outcome); a drifted save refuses and re-plans. Post-Molt only: the first cycle teaches buying. */
function GenomeRebuild(): JSX.Element | null {
  const save = meta.use();
  // Cheap gate (no Power scoring): any unlocked, unmaxed upgrade the treasury covers right now.
  const canAfford = useMemo(() => genomeSections(save).some((sec) => sec.cards.some((c) => !c.completed && !c.locked && c.cost !== null && c.cost <= save.shards)), [save]);
  const [plan, setPlan] = useState<GenomeRebuildPlan | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (save.prestige.molts < 1 || (!canAfford && !plan && !note)) return null;
  const open = (): void => { audio.cue('ui'); setNote(null); setPlan(genomeRebuildPlan(meta.get())); };
  const confirm = (): void => {
    if (!plan) return;
    const before = meta.get().shards;
    if (meta.applyGenomeRebuild(plan.steps)) {
      telemetry.flowSpend('cores:upgrade', before - meta.get().shards); // same spend fold as a manual buy
      audio.cue('power');
      setNote(`Rebuilt ${plan.steps.length} level${plan.steps.length === 1 ? '' : 's'} · Power ${formatPower(plan.powerBefore)} → ${formatPower(plan.powerAfter)}`);
      setPlan(null);
    } else {
      setPlan(genomeRebuildPlan(meta.get())); // the save moved under the dialog — show the fresh plan
    }
  };
  return (
    <>
      {canAfford && (
        <button type="button" className="evo-rebuild" onClick={open} title="Spend your Genome Cores along the Best Value ranking — you confirm the plan first">
          ⟳ Rebuild by Best Value
        </button>
      )}
      {note && <span className="evo-rebuild-note" role="status">{note}</span>}
      {plan && (
        <Popup>
          <div className="evo-rebuild-veil" role="dialog" aria-label="Genome rebuild plan" onClick={() => setPlan(null)}>
            <div className="evo-rebuild-card" onClick={(e) => e.stopPropagation()}>
              <div className="evo-rebuild-k">⟳ GENOME REBUILD — BEST VALUE</div>
              {plan.steps.length === 0 ? (
                <p className="evo-rebuild-empty">Nothing affordable adds Power right now — bank more Genome Cores.</p>
              ) : (
                <>
                  <div className="evo-rebuild-sum">
                    <b>{plan.steps.length}</b> level{plan.steps.length === 1 ? '' : 's'} · <CurrencyIcon id="genomeCores" size={13} title="" /> {plan.cores.toLocaleString()} of {save.shards.toLocaleString()}
                    <span className="evo-rebuild-power">Power {formatPower(plan.powerBefore)} → <b>{formatPower(plan.powerAfter)}</b></span>
                  </div>
                  <ul className="evo-rebuild-rows">
                    {plan.rows.map((r) => (
                      <li key={r.id}><span>{r.name}</span><span>L{r.from} → L{r.to}</span><span>{r.cores.toLocaleString()}</span></li>
                    ))}
                  </ul>
                </>
              )}
              <div className="evo-rebuild-actions">
                <button type="button" onClick={() => setPlan(null)}>Cancel</button>
                {plan.steps.length > 0 && <button type="button" className="primary" onClick={confirm}>Confirm rebuild</button>}
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

export function EvolutionHQ(): JSX.Element {
  const save = meta.use();
  const [justBought, setJustBought] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // EVERY buy button holds-to-repeat now (QOL) — the loop needs the success signal back
  // (false stops the hold at a cap or an unaffordable step).
  const onBuyRunaway = (id: string): boolean => {
    const before = meta.get().shards;
    if (!meta.buyUpgrade(id)) return false;
    telemetry.flowSpend('cores:upgrade', before - meta.get().shards); // spend fold (docs/ANALYTICS.md §economy)
    setJustBought(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustBought(null), 620);
    return true;
  };

  const curPower = meta.power().score;
  const mm = metaModifiers(save);
  // ── Board organization (state/listOrg — docs/UI-STANDARDS.md §lists): the catalog only
  // grows (1000-upgrade target). Search + chips filter CARDS inside every category; a
  // category with nothing left disappears from the board AND the jump rail.
  const [boardQuery, setBoardQuery] = useState('');
  const [boardPrefs, setBoardPrefs] = useState(() => listOrgPrefs('evolution'));
  const boardFilters = useMemo(() => ([
    { id: 'affordable', label: 'Affordable now', title: 'Only upgrades you can buy this second', test: (c: GenomeCardView) => !c.completed && !c.locked && c.cost !== null && c.cost <= save.shards },
    { id: 'hidemax', label: 'Hide maxed', test: (c: GenomeCardView) => !c.completed },
  ]), [save.shards]);
  const activeFilters = boardPrefs.filters ?? [];
  const sections = useMemo(() => {
    const spec: ListOrgSpec<GenomeCardView> = {
      searchText: (c) => `${c.name} ${c.description}`,
      sorts: [{ id: 'default', label: 'Authored order', by: () => 0, dir: 'asc' }],
      filters: boardFilters,
    };
    const state: ListOrgState = { query: boardQuery, sort: 'default', filters: activeFilters, group: null, collapsed: [] };
    return genomeSections(save)
      .map((sec) => ({ ...sec, cards: organizeList(sec.cards, spec, state).rows }))
      .filter((sec) => sec.cards.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, boardQuery, activeFilters, boardFilters]);
  const prestige = meta.prestigeView();
  const towerCap = Math.min(SLOTS.permanentMax, SLOTS.initialUnlocked + mm.bonusSlots);
  const runawayLevels = sections.reduce((a, s) => a + s.endlessLevels, 0);
  const firstAffordable = sections.find((sec) => sec.cards.some((c) => !c.completed && !c.locked && c.cost !== null && c.cost <= save.shards))?.category;
  const pct = (m: number): string => `×${m.toFixed(2)}`;

  return (
    <div className="evo-hq">
      <EvoBackdrop />
      <header className="evo-hq-head">
        <div className="evo-hq-eyebrow">✷ Permanent Progression</div>
        <h2 className="evo-hq-title">Evolution HQ</h2>
        <p className="evo-hq-sub">Sink Genome Cores into permanent mutations, then Molt to spend Ascendant Cells on levers that survive every reset.</p>
      </header>
      <BestBuyStrip surface="evolution" />

      {/* The treasury — every purchase decision needs its budget in view. */}
      <section className="evo-treasury" data-guide="evo-treasury" aria-label="Genome Core treasury">
        <span className="evo-treasury-bal"><CurrencyIcon id="genomeCores" size={20} /> {save.shards.toLocaleString()}</span>
        <span className="evo-treasury-k">Genome Cores</span>
        <span className="evo-treasury-life">{save.lifetimeShards.toLocaleString()} lifetime</span>
        {runawayLevels > 0 && <span className="evo-treasury-run" title="Runaway mutation levels across all categories">∞ {runawayLevels} Runaway</span>}
        <GenomeRebuild />
      </section>

      {/* Board organization — find one upgrade among 1000 (docs/UI-STANDARDS.md §lists). */}
      <ListControls
        search={{ value: boardQuery, onChange: setBoardQuery, placeholder: 'Search upgrades…', label: 'Search Genome Core upgrades' }}
        chips={boardFilters.map((f) => ({
          id: f.id, label: f.label, title: f.title,
          on: activeFilters.includes(f.id),
          onToggle: () => setBoardPrefs(setListOrgPrefs('evolution', { filters: toggleIn(activeFilters, f.id) })),
        }))}
      />
      {sections.length === 0 && <div className="tl2-empty">No upgrades match — clear the search or filters.</div>}

      {/* The HQ is long: ONE SectionNav (components/SectionNav — sticky chips + folds remembered
          per device) replaces the old jump rail and the portrait-only folds. By default only the
          FIRST category holding something affordable opens (the reason you came — the rest read
          as a table of contents with their %); searching opens all. */}
      <SectionNav
        screen="evolution"
        label="Evolution HQ sections"
        forceOpen={boardQuery.trim() !== ''}
        sections={[
          { id: 'stats', icon: '◑', title: 'Account stats', hint: 'Your permanent multipliers at a glance.', count: formatPower(curPower), defaultOpen: false, render: () => (
            <section className="evo-stats" aria-label="Permanent statistics">
              <StatLine label="Total Power" value={formatPower(curPower)} accent="var(--gold)" />
              <StatLine label="Permanent Damage" value={pct(mm.towerDamageMult)} />
              <StatLine label="Permanent Biomass" value={pct(mm.biomassMult)} />
              <StatLine label="Hero Strength" value={pct(mm.heroDamageMult)} />
              <StatLine label="Tower Capacity" value={`${towerCap}`} />
              <StatLine label="Prestige Multiplier" value={pct(prestige.mult)} accent="var(--viral)" />
              <StatLine label="Runaway Levels" value={`∞ ${runawayLevels}`} accent="var(--viral)" />
              <StatLine label="Lifetime Genome Cores" value={`${save.lifetimeShards}`} />
              <StatLine label="Lifetime Ascendant Cells" value={`${save.prestige.lifetimeCells}`} accent="var(--viral)" />
              <StatLine label="Campaign Depth" value={`Stage ${highestCampaignStage(save)}`} />
            </section>
          ) },
          // Genome Core sections — one per category (capped catalog + the Runaway sink).
          ...sections.map((sec) => ({
            id: sec.category, icon: sec.icon, title: sec.title, hint: sec.desc,
            count: `${sec.completionPct}%${sec.endlessLevels > 0 ? ` · ∞${sec.endlessLevels}` : ''}`,
            meta: (
              <>
                <ProgressBar value={sec.boughtLevels} max={sec.totalLevels} height={5} color="var(--viral)" label={`${sec.title} completion`} />
                <span className="evo-sec-meta">{sec.boughtLevels}/{sec.totalLevels} levels · <CurrencyIcon id="genomeCores" size={11} title="" /> {sec.coresSpent.toLocaleString()} spent</span>
              </>
            ),
            defaultOpen: sec.category === firstAffordable,
            render: () => <SectionGrid section={sec} curPower={curPower} onBuyRunaway={onBuyRunaway} justBought={justBought} />,
          })),
          // Ascension — Molt gate + Ascendant Tree (the existing panel, one source of truth).
          { id: 'ascension', icon: '✸', title: 'Ascension', hint: 'Sacrifice the Genome engine to mint Ascendant Cells — permanent power that never resets.',
            count: `×${prestige.mult.toFixed(2)}`, defaultOpen: prestige.canMolt || prestige.cells > 0, render: () => <PrestigePanel /> },
          // Future Locked — the visible long horizon.
          { id: 'future', icon: '🔒', title: 'Future Evolution', hint: 'Deeper ascension layers, coming as the organism matures.', defaultOpen: false, render: () => (
            <div className="evo-future-grid">
              {FUTURE_LOCKED.map((f) => (
                <div className="evo-future-card" key={f.name}>
                  <div className="evo-future-name">🔒 {f.name}</div>
                  <div className="evo-future-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          ) },
        ]}
      />
    </div>
  );
}
