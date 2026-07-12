// Tower Lab — the biological engineering wing. A master–detail bench: the SPECIMEN RAIL
// (search/sort/filter/favorites — scales to a 100-tower roster) selects one organism for the
// SHOWCASE — a living mutation chamber (large animated portrait), its evolution track, next
// mutation (with Power preview + campaign gate), specialization paths, future evolution path,
// the full Mastery ledger, and the Adaptation tree. Data comes from towerLabModel; buying a
// star plays the StarCeremony. No functionality removed from the card era — re-homed.

import { useMemo, useState } from 'react';
import { meta, towerProgress } from '../state/meta';
import { audio } from '../audio/sound';
import { STAR, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { forksOf } from '../core/stars';
import type { TowerKind } from '../core/types';
import { ProgressBar } from './components/ProgressBar';
import { CurrencyIcon } from './components/CurrencyIcon';
import { TowerPortrait } from './TowerPortrait';
import { TowerCodex } from './TowerCodex';
import { PowerPreview } from './components/PowerScore';
import { StarCeremony } from './StarCeremony';
import { labPrefs, setLabPrefs } from '../state/prefs';
import { BestBuyStrip } from './components/BestBuyStrip';
import { LAB_SORTS, ceremonyView, futurePath, labRoster, masteryPanelModel, towerLabModel } from './towerLabModel';
import type { LabSort, StepView, TowerLabModel } from './towerLabModel';

interface CeremonyState {
  kind: TowerKind;
  name: string;
  color: string;
  toStar: number;
  unlocked: StepView | null;
  next: StepView | null;
  milestoneStar: number | null;
}

const num = (n: number): string => n.toLocaleString();

/** Re-pickable specialization forks (loadout-level, applied next run). */
function ForkPaths({ kind, stars, color }: { kind: TowerKind; stars: number; color: string }): JSX.Element | null {
  const save = meta.use();
  const reached = forksOf(kind).filter((f) => f.star <= stars);
  if (reached.length === 0) return null;
  return (
    <div className="tl-forks">
      {reached.map((f) => {
        const picked = save.towerForks[kind]?.[String(f.star)] ?? f.fork[0].id;
        return (
          <div className="tl-fork" key={f.star}>
            <span className="tl-fork-k" style={{ color }}>◈{f.star}</span>
            <div className="tl-fork-opts">
              {f.fork.map((o) => (
                <button
                  key={o.id}
                  className={`tl-fork-opt${picked === o.id ? ' on' : ''}`}
                  title={o.desc}
                  onClick={() => meta.setTowerFork(kind, f.star, o.id)}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The Mastery ledger — craft expertise as a first-class panel (docs/MASTERY.md). */
function MasteryPanel({ kind, color, contribution }: { kind: TowerKind; color: string; contribution: number }): JSX.Element {
  const save = meta.use();
  const m = useMemo(() => masteryPanelModel(save, kind), [save, kind]);
  return (
    <div className="tl2-block tl2-masterypanel">
      <div className="tl2-block-h">
        <span className="tl2-eyebrow">Mastery · Craft</span>
        <span className="tl2-rank" style={{ color }}>{m.rank}</span>
      </div>
      <div className="tl2-mlevel">
        <b style={{ color }}>Lv {m.level}</b>
        <span className="tl2-mxp">{num(Math.floor(m.into))} / {num(Math.ceil(m.need))} XP</span>
      </div>
      <ProgressBar value={m.into} max={m.need} color={color} height={8} label={`${TOWER_DEFS[kind].name} mastery`} />
      <div className="tl2-mgrid">
        <span className="tl2-mstat"><b>{num(m.lifetime.kills)}</b>lifetime kills</span>
        <span className="tl2-mstat"><b>{num(m.lifetime.damage)}</b>lifetime damage</span>
        <span className="tl2-mstat"><b>{num(m.lifetime.deployments)}</b>deployments</span>
        <span className="tl2-mstat"><b>{m.lifetime.bestWave || '—'}</b>best wave</span>
        <span className="tl2-mstat"><b>{m.lifetime.bestStrain > 1 ? ['I', 'II', 'III', 'IV', 'V'][m.lifetime.bestStrain - 1] : '—'}</b>deepest strain</span>
      </div>
      <div className="tl2-mbonus">
        <span>Permanent bonus <b style={{ color }}>+{m.bonusPct.toFixed(1)}% damage</b></span>
        <span>Power contribution <b className="tl2-gold">+{num(contribution)}</b></span>
      </div>
      <div className="tl2-mnext">
        Next unlock · <b>{m.next.name}</b> at Lv {m.next.at}
        <span className="tl2-mnext-kind">{m.next.kind}</span>
      </div>
      {m.milestones.length > 0 && (
        <div className="tl2-mstones">
          {m.milestones.map((ms) => (
            <span className={`tl2-mstone${ms.reached ? ' on' : ''}`} key={`${ms.at}-${ms.name}`} title={`${ms.name} — Mastery ${ms.at}`}>
              {ms.at} · {ms.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function TowerLab(): JSX.Element {
  const save = meta.use();
  const prog = towerProgress(save);
  const curPower = meta.power().score;
  const [ceremony, setCeremony] = useState<CeremonyState | null>(null);
  const [codexKind, setCodexKind] = useState<TowerKind | null>(null);
  const [prefs, setPrefs] = useState(labPrefs);
  const [query, setQuery] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [upOnly, setUpOnly] = useState(false);
  const [chamberFlash, setChamberFlash] = useState(0); // increments on a star buy → chamber pulse

  const models = useMemo(() => {
    const out = {} as Record<TowerKind, TowerLabModel>;
    for (const k of TOWER_ORDER) out[k] = towerLabModel(save, k, prog[k]);
    return out;
  }, [save, prog]);

  // Each tower's Power CONTRIBUTION: account Power minus a world where its stars + mastery
  // are zero (the real model — same engine the previews use). Memoized per save.
  const contribution = useMemo(() => {
    const out = {} as Record<TowerKind, number>;
    for (const k of TOWER_ORDER) {
      const without = meta.previewPower((s) => ({
        ...s,
        towerStars: { ...s.towerStars, [k]: 0 },
        towerMasteryXp: { ...s.towerMasteryXp, [k]: 0 },
      })).score;
      out[k] = Math.max(0, curPower - without);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, curPower]);

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);
  const roster = labRoster(models, { query, favoritesOnly: favOnly, upgradeableOnly: upOnly }, prefs.sort as LabSort, favorites, prefs.recents, (k) => contribution[k]);

  // Selection: last-inspected (pref) → first of the roster; never an empty showcase.
  const selected: TowerKind = (roster.includes(prefs.selected as TowerKind) ? (prefs.selected as TowerKind) : roster[0]) ?? TOWER_ORDER[0];
  const m = models[selected];
  const future = useMemo(() => futurePath(save, selected, m.stars), [save, selected, m.stars]);

  // Inspecting a tower acknowledges its NEW chip (recentsSeen) — a badge you can always clear.
  const select = (k: TowerKind): void =>
    setPrefs(setLabPrefs({ selected: k, recentsSeen: { ...labPrefs().recentsSeen, [k]: Date.now() } }));
  const toggleFav = (k: TowerKind): void => {
    const favs = favorites.has(k) ? prefs.favorites.filter((f) => f !== k) : [...prefs.favorites, k];
    setPrefs(setLabPrefs({ favorites: favs }));
  };

  const upgrade = (k: TowerKind, fromStar: number): void => {
    if (!meta.buyStar(k)) return;
    const toStar = fromStar + 1;
    const cv = ceremonyView(meta.get(), k, toStar);
    setCeremony({ kind: k, name: TOWER_DEFS[k].name, color: TOWER_DEFS[k].color, toStar, ...cv });
    setPrefs(setLabPrefs({ recents: { ...labPrefs().recents, [k]: Date.now() } }));
    setChamberFlash((n) => n + 1); // the chamber lighting reacts to the mutation
  };

  // PRIME ladder buy (docs/PRIME-STRAINS.md) — the same ceremony choreography as a star: full
  // pip track, the bought level revealed, the next level previewed (with its honest gain).
  const upgradePrime = (k: TowerKind): void => {
    if (!meta.buyTowerPrime(k)) return;
    const s = meta.get();
    const lvl = s.towerPrime[k] ?? 0;
    const p = towerLabModel(s, k, towerProgress(s)[k]).prime;
    setCeremony({
      kind: k, name: TOWER_DEFS[k].name, color: TOWER_DEFS[k].color, toStar: STAR.maxTowerStars,
      unlocked: { star: STAR.maxTowerStars, name: `Prime Strain L${lvl}`, desc: `+${p ? p.bonusPct.toFixed(1) : ''}% permanent damage — the strain deepens`, isFork: false, ascension: true },
      next: p ? { star: STAR.maxTowerStars, name: `Prime Strain L${lvl + 1}`, desc: `+${p.nextGainPct.toFixed(2)}% more · ${p.shards} Strain Samples${p.catalyst > 0 ? ` + ${p.catalyst} Catalyst` : ''}`, isFork: false, ascension: true } : null,
      milestoneStar: null,
    });
    setPrefs(setLabPrefs({ recents: { ...labPrefs().recents, [k]: Date.now() } }));
    setChamberFlash((n) => n + 1);
  };

  const upgradeableCount = TOWER_ORDER.filter((k) => models[k].affordable).length;
  const recentMs = 24 * 60 * 60 * 1000;

  return (
    <div className="panel tl-panel tl2">
      <div className="tl2-head">
        <div>
          <div className="panel-title">Tower Lab</div>
          <div className="panel-sub">The engineering wing. Select a specimen; spend Strain Samples to mutate it up the evolution path — every star is a transformation, not a number.</div>
        </div>
        {upgradeableCount > 0 && <span className="tl2-ready-badge">{upgradeableCount} ready to evolve</span>}
      </div>
      <BestBuyStrip surface="towers" />

      <div className="tl2-body">
        {/* ── The specimen rail — search / sort / filter, favorites lead ── */}
        <div className="tl2-rail">
          <input
            className="tl2-search"
            type="search"
            placeholder="Search specimens…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search towers"
          />
          <div className="tl2-tools">
            <select className="tl2-sort" value={prefs.sort} onChange={(e) => setPrefs(setLabPrefs({ sort: e.target.value }))} aria-label="Sort towers">
              {LAB_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button className={`tl2-chip${upOnly ? ' on' : ''}`} onClick={() => setUpOnly((v) => !v)} title="Only towers with an affordable next star">Upgradeable</button>
            <button className={`tl2-chip${favOnly ? ' on' : ''}`} onClick={() => setFavOnly((v) => !v)} title="Only favorites">★</button>
          </div>
          <div className="tl2-list" role="listbox" aria-label="Tower roster">
            {roster.map((k) => {
              const r = models[k];
              // NEW = upgraded since the player last LOOKED at it (and within the freshness
              // window) — selecting the tower dismisses it; it can never stick.
              const recent = Date.now() - (prefs.recents[k] ?? 0) < recentMs
                && (prefs.recents[k] ?? 0) > (prefs.recentsSeen[k] ?? 0)
                && k !== selected;
              return (
                <button
                  key={k}
                  className={`tl2-item${k === selected ? ' on' : ''}`}
                  style={{ ['--tw' as string]: r.color }}
                  onClick={() => select(k)}
                  role="option"
                  aria-selected={k === selected}
                >
                  <span className="tl2-item-portrait"><TowerPortrait color={r.color} stars={r.stars} size={52} kind={k} /></span>
                  <span className="tl2-item-body">
                    <span className="tl2-item-name" style={{ color: r.color }}>{r.name}{favorites.has(k) && <i className="tl2-item-fav">★</i>}</span>
                    <span className="tl2-item-sub">◈{r.stars} · Mastery {r.mastery.level}</span>
                  </span>
                  <span className="tl2-item-badges">
                    {recent && <i className="tl2-b tl2-b-recent" title="Recently upgraded">NEW</i>}
                    {r.affordable && <i className="tl2-b tl2-b-up" title="Next star affordable">▲</i>}
                    {r.locked && <i className="tl2-b tl2-b-lock" title={`Locked — synthesize for ${r.unlockCost} Strain Samples`}>🔒</i>}
                    {r.capLocked && !r.locked && <i className="tl2-b tl2-b-cap" title="Campaign-gated">🔒</i>}
                    {/* Adaptation pts only signal on SYNTHESIZED towers — a dormant tree is locked shut. */}
                    {!r.locked && meta.adaptation('tower', k).pointsAvailable > 0 && <i className="tl2-b tl2-b-pts" title="Adaptation points to spend">{meta.adaptation('tower', k).pointsAvailable}</i>}
                  </span>
                </button>
              );
            })}
            {roster.length === 0 && <div className="tl2-empty">No specimens match — clear the filters.</div>}
          </div>
        </div>

        {/* ── The showcase — one organism, everything it is and will become ── */}
        <div className="tl2-showcase" style={{ ['--tw' as string]: m.color }} key={selected}>
          <div className="tl2-hero">
            <div className={`tl2-chamber${chamberFlash % 2 ? ' flash-a' : ' flash-b'}`} data-flash={chamberFlash > 0 || undefined}>
              <TowerPortrait color={m.color} stars={m.stars} size={224} kind={selected} />
              <span className="tl2-chamber-lvl" style={{ color: m.color }}>◈{m.stars}</span>
              {/* DORMANT STRAIN: the chamber itself reads LOCKED, prerequisite in plain sight
                  (the lockbar below carries the Synthesize action). */}
              {m.locked && (
                <div className="tl2-chamber-locked" role="note" aria-label={`${m.name} is locked — synthesis prerequisites below`}>
                  <span className="tl2-chamber-locked-glyph" aria-hidden>🔒</span>
                  <span className="tl2-chamber-locked-title">LOCKED</span>
                  <span className="tl2-chamber-locked-req" data-met={m.canUnlock || undefined}>
                    {num(m.shards)} / {num(m.unlockCost)} <CurrencyIcon id="towerShards" color={m.color} size={12} title="Strain Samples" />
                  </span>
                </div>
              )}
              {m.nextVisualMutation && (
                <div className="tl2-next-form" title={`${m.nextVisualMutation.name} — ${m.nextVisualMutation.desc}`}>
                  <TowerPortrait color={m.color} stars={m.nextVisualMutation.at} size={64} kind={selected} />
                  <span>at ◈{m.nextVisualMutation.at}</span>
                </div>
              )}
            </div>
            <div className="tl2-id">
              <div className="tl2-name-row">
                <span className="tl2-name" style={{ color: m.color }}>{m.name}</span>
                <button className={`tl2-favbtn${favorites.has(selected) ? ' on' : ''}`} onClick={() => toggleFav(selected)} title="Favorite (leads the rail)">★</button>
                <button
                  className={`tl2-convbtn${save.favoriteTower === selected ? ' on' : ''}`}
                  disabled={m.locked}
                  onClick={() => { meta.setFavoriteTower(selected); }}
                  title={m.locked
                    ? 'Synthesize this tower first — locked organisms cannot anchor the conveyor'
                    : save.favoriteTower === selected
                      ? 'Your CONVEYOR FAVORITE — always deployable in every run (docs: Biomorph Conveyor)'
                      : 'Set as your CONVEYOR FAVORITE — the one tower always deployable; all others arrive via the Biomorph Conveyor'}
                >
                  {save.favoriteTower === selected ? '◉ Conveyor Favorite' : '○ Set Conveyor Favorite'}
                </button>
              </div>
              {m.locked && (
                <div className="tl2-lockbar" data-can={m.canUnlock || undefined}>
                  <span className="tl2-lockbar-txt">
                    🔒 DORMANT STRAIN — synthesize to add it to the Biomorph Conveyor
                  </span>
                  <span className="tl2-lockbar-progress">
                    {m.shards} / {m.unlockCost} <CurrencyIcon id="towerShards" color={m.color} size={13} title="Strain Samples" />
                  </span>
                  <button
                    className="tl2-unlockbtn"
                    disabled={!m.canUnlock}
                    onClick={() => {
                      if (meta.unlockTower(selected)) {
                        audio.cue('jackpot');
                        setChamberFlash((n) => n + 1); // the chamber celebrates the synthesis
                      }
                    }}
                    title={m.canUnlock ? `Spend ${m.unlockCost} Strain Samples to synthesize` : `Bank ${m.unlockCost} of this tower's Strain Samples (containers drop them) to synthesize`}
                  >
                    {m.canUnlock ? `Synthesize · ${m.unlockCost}` : `Requires ${m.unlockCost}`}
                  </button>
                </div>
              )}
              <div className="tl2-class">{m.combatClass}{m.mastery.rank ? ` · ${m.mastery.rank}` : ''}</div>
              <div className="tl-pips tl2-pips" aria-label={`${m.stars} of ${m.maxStars} stars`}>
                {Array.from({ length: m.maxStars }, (_, i) => {
                  const isMs = m.milestones.some((ms) => ms.star === i + 1);
                  return (
                    <span key={i} className={`tl-pip${i < m.stars ? ' on' : ''}${isMs ? ' ms' : ''}`} style={i < m.stars ? { color: m.color } : undefined}>◈</span>
                  );
                })}
              </div>
              <div className="tl-facts">
                <div className="tl-fact"><span className="tl-k">Specialization</span><span className="tl-v">{m.specialization}</span></div>
                <div className="tl-fact"><span className="tl-k">Evolution</span><span className="tl-v">{m.currentEvolution}</span></div>
                <div className="tl-fact"><span className="tl-k">Build</span><span className="tl-v">{m.buildPath}</span></div>
              </div>
              <div className="tl-stats">
                {m.stats.map((s) => (
                  <span className="tl-stat" key={s.label}>
                    <span className="tl-stat-v" style={{ color: m.color }}>{s.value}</span>
                    <span className="tl-stat-k">{s.label}</span>
                  </span>
                ))}
                <span className="tl-stat">
                  <span className="tl-stat-v tl2-gold">+{num(contribution[selected])}</span>
                  <span className="tl-stat-k">Power</span>
                </span>
              </div>
              <button className="tl2-codex" onClick={() => setCodexKind(selected)}>⤢ Evolution Codex — every stage &amp; both branches</button>
            </div>
          </div>

          {/* Next mutation + the action (campaign gate never just greys out) */}
          <div className="tl2-block tl2-nextblock">
            {m.nextStep ? (
              <div className={`tl-next${m.capLocked ? ' is-locked' : ''}`} style={{ borderLeftColor: m.color }}>
                <span className="tl-next-k" style={{ color: m.color }}>
                  {m.capLocked ? 'LOCKED' : 'NEXT'} ◈{m.nextStep.star} · {m.nextStep.name}{m.nextStep.isFork ? ' — choose a path' : ''}
                </span>
                {m.nextStep.desc && <span className="tl-next-desc">{m.nextStep.desc}</span>}
                {!m.capLocked && (
                  <span className="tl-next-power">
                    Power{' '}
                    <PowerPreview
                      current={curPower}
                      next={meta.previewPower((s) => ({ ...s, towerStars: { ...s.towerStars, [selected]: (s.towerStars[selected] ?? 0) + 1 } })).score}
                    />
                  </span>
                )}
                {m.nextAbility && m.nextAbility.star !== m.nextStep.star && (
                  <span className="tl-next-ability">Next ability · ◈{m.nextAbility.star} {m.nextAbility.name}</span>
                )}
                {m.capLocked && m.capUnlock && (
                  <div className="tl-cap">
                    <span className="tl-cap-req">🧬 Reach <b>Campaign Stage {m.capUnlock.stage}</b> to evolve to ◈{m.capUnlock.maxStar}</span>
                    <ProgressBar value={Math.min(m.campaignStage, m.capUnlock.stage)} max={m.capUnlock.stage} color={m.color} height={6} label="Campaign progress" />
                    <span className="tl-cap-prog">Campaign Stage {m.campaignStage} / {m.capUnlock.stage}</span>
                  </div>
                )}
              </div>
            ) : m.prime ? (
              /* PRIME STRAIN (docs/PRIME-STRAINS.md): the ★ ladder is finished — the infinite
                 ladder opens. The curve is stated honestly: each level adds LESS than the last. */
              <div className="tl-next is-max tl-prime" style={{ borderLeftColor: m.color }}>
                <span className="tl-next-k" style={{ color: m.color }}>PRIME STRAIN · L{m.prime.level}</span>
                <span className="tl-next-desc">
                  +{m.prime.bonusPct.toFixed(1)}% permanent damage banked · next level adds +{m.prime.nextGainPct.toFixed(2)}%
                  {' — '}each Prime level is worth a little less than the last, forever.
                </span>
                <span className="tl-next-power">
                  Power{' '}
                  <PowerPreview
                    current={curPower}
                    next={meta.previewPower((s) => ({ ...s, towerPrime: { ...s.towerPrime, [selected]: (s.towerPrime[selected] ?? 0) + 1 } })).score}
                  />
                </span>
                {m.prime.catalyst > 0 && (
                  <span className="tl-prime-cat" title="Deep Prime levels also consume Catalyst">
                    ✷ Requires {m.prime.catalyst} Catalyst ({m.prime.catalystHave} owned)
                  </span>
                )}
              </div>
            ) : null}
            <div className="tl-actions">
              {m.prime ? (
                <button
                  className={`primary tl-mutate${m.prime.affordable ? ' is-afford' : ''}`}
                  disabled={!m.prime.affordable}
                  onClick={() => { if (!m.locked) upgradePrime(selected); }}
                  title={m.prime.catalyst > 0 ? `${m.prime.shards} Strain Samples + ${m.prime.catalyst} Catalyst` : `${m.prime.shards} Strain Samples`}
                >
                  Prime L{m.prime.level + 1} · {m.prime.shards} <CurrencyIcon id="towerShards" color={m.color} size={13} title="" />{m.prime.catalyst > 0 ? <> + {m.prime.catalyst} ✷</> : null}
                </button>
              ) : (
                <button
                  className={`primary tl-mutate${m.affordable ? ' is-afford' : ''}${m.capLocked ? ' is-locked' : ''}`}
                  disabled={m.maxed || !m.affordable}
                  onClick={() => { if (!m.locked) upgrade(selected, m.stars); }}
                  title={m.locked ? 'Synthesize this tower first' : m.capLocked && m.capUnlock ? `Locked until Campaign Stage ${m.capUnlock.stage}` : undefined}
                >
                  {m.locked ? '🔒 Dormant' : m.maxed ? 'MAX' : m.capLocked && m.capUnlock ? <>🔒 Stage {m.capUnlock.stage}</> : <>Mutate · {m.cost} <CurrencyIcon id="towerShards" color={m.color} size={13} title="" /></>}
                </button>
              )}
              <span className="tl-shards" title="Strain Samples">{m.shards} <CurrencyIcon id="towerShards" color={m.color} size={13} title="" /></span>
            </div>
            {!m.prime && !m.locked && (
              <span className="tl-prime-tease">◈{m.maxStars} opens the PRIME ladder — infinite levels, ever-diminishing gains.</span>
            )}
          </div>

          {/* Specialization paths — both branches, re-pickable */}
          {forksOf(selected).some((f) => f.star <= m.stars) && (
            <div className="tl2-block">
              <div className="tl2-block-h"><span className="tl2-eyebrow">Specialization paths</span></div>
              <ForkPaths kind={selected} stars={m.stars} color={m.color} />
            </div>
          )}

          {/* The future path — every remaining evolution, both fork options readable */}
          {future.length > 0 && (
            <div className="tl2-block">
              <div className="tl2-block-h"><span className="tl2-eyebrow">Future evolutions</span></div>
              <div className="tl2-future">
                {future.map((f) => (
                  <div className={`tl2-fstep${f.star <= m.evolutionCap ? '' : ' gated'}`} key={f.star} title={f.desc}>
                    <span className="tl2-fstar" style={{ color: m.color }}>◈{f.star}</span>
                    <span className="tl2-fname">{f.name}{f.forkAlt ? <i> or {f.forkAlt}</i> : null}</span>
                    {f.star > m.evolutionCap && <span className="tl2-fgate">stage-gated</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature genes — the collection thread for this organism */}
          {m.signatureGenes.length > 0 && (
            <div className="tl2-block">
              <div className="tl2-block-h"><span className="tl2-eyebrow">Signature genes</span></div>
              <span className="tl-gene-chips">
                {m.signatureGenes.map((g) => <span className="tl-gene" key={g}>{g}</span>)}
              </span>
            </div>
          )}

          <MasteryPanel kind={selected} color={m.color} contribution={contribution[selected]} />

          <div className="tl2-block">
            <p className="tl-adapt-moved">☣ Antigen specialization lives in the <b>Adaptation Chamber</b> (Progression wing) — every strain and champion tree in one place, with a suggested-next advisor.</p>
          </div>
        </div>
      </div>

      {ceremony && (
        <StarCeremony
          name={ceremony.name}
          color={ceremony.color}
          kind={ceremony.kind}
          toStar={ceremony.toStar}
          maxStars={STAR.maxTowerStars}
          unlocked={ceremony.unlocked}
          next={ceremony.next}
          milestoneStar={ceremony.milestoneStar}
          onClose={() => setCeremony(null)}
        />
      )}

      {codexKind && <TowerCodex kind={codexKind} onClose={() => setCodexKind(null)} />}
    </div>
  );
}
