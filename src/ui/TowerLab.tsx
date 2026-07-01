// Tower Lab — the COLLECTION of evolving organisms (not a list of upgrade cards). Each tower is a
// rich, scannable specimen card: a living portrait that grows with stars, its specialization /
// evolution / mastery / lifetime kills / signature genes / current stats at a glance, and a Mutate
// button that plays the star CEREMONY (StarCeremony). Data comes from towerLabModel; this file is
// presentation + the upgrade intent. Scales to dozens of towers (responsive grid).

import { useState } from 'react';
import { meta, towerProgress } from '../state/meta';
import { STAR, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { forksOf } from '../core/stars';
import type { TowerKind } from '../core/types';
import { ProgressBar } from './components/ProgressBar';
import { CurrencyIcon } from './components/CurrencyIcon';
import { TowerPortrait } from './TowerPortrait';
import { TowerCodex } from './TowerCodex';
import { PowerPreview } from './components/PowerScore';
import { AdaptationTree } from './components/AdaptationTree';
import { StarCeremony } from './StarCeremony';
import { ceremonyView, towerLabModel } from './towerLabModel';
import type { StepView } from './towerLabModel';

interface CeremonyState {
  kind: TowerKind;
  name: string;
  color: string;
  toStar: number;
  unlocked: StepView | null;
  next: StepView | null;
  milestoneStar: number | null;
}

/** Re-pickable specialization forks (loadout-level, applied next run) — collapsed by default. */
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

export function TowerLab(): JSX.Element {
  const save = meta.use();
  const prog = towerProgress(save);
  const curPower = meta.power().score; // for the "next star → new Power" preview
  const [ceremony, setCeremony] = useState<CeremonyState | null>(null);
  const [openForks, setOpenForks] = useState<TowerKind | null>(null);
  const [openAdapt, setOpenAdapt] = useState<TowerKind | null>(null); // open the Adaptation tree for a tower
  const [codexKind, setCodexKind] = useState<TowerKind | null>(null); // open the Evolution Codex for a tower

  const upgrade = (k: TowerKind, fromStar: number): void => {
    if (!meta.buyStar(k)) return;
    const toStar = fromStar + 1;
    const cv = ceremonyView(meta.get(), k, toStar);
    setCeremony({ kind: k, name: TOWER_DEFS[k].name, color: TOWER_DEFS[k].color, toStar, ...cv });
  };

  return (
    <div className="panel tl-panel">
      <div className="panel-title">Tower Lab</div>
      <div className="panel-sub">Your roster of living weapons. Spend Shards to mutate each one up the star path — every star is a transformation, not a number.</div>

      <div className="tl-grid">
        {TOWER_ORDER.map((k) => {
          const m = towerLabModel(save, k, prog[k]);
          return (
            <div className="tl-card" key={k} style={{ ['--tw' as string]: m.color }}>
              {/* identity row: living portrait (→ Evolution Codex) + name/class + star track */}
              <div className="tl-id">
                <button className="tl-portrait" onClick={() => setCodexKind(k)} title={`Open the ${m.name} Evolution Codex`}>
                  <TowerPortrait color={m.color} stars={m.stars} size={112} kind={m.kind} />
                  <span className="tl-portrait-lvl" style={{ color: m.color }}>◈{m.stars}</span>
                  <span className="tl-portrait-examine">⤢ Codex</span>
                </button>
                <div className="tl-id-body">
                  <div className="tl-name" style={{ color: m.color }}>{m.name}</div>
                  <div className="tl-class">{m.combatClass}{m.mastery.rank ? ` · ${m.mastery.rank}` : ''}</div>
                  <div className="tl-pips" aria-label={`${m.stars} of ${m.maxStars} stars`}>
                    {Array.from({ length: m.maxStars }, (_, i) => {
                      const isMs = m.milestones.some((ms) => ms.star === i + 1);
                      return (
                        <span
                          key={i}
                          className={`tl-pip${i < m.stars ? ' on' : ''}${isMs ? ' ms' : ''}`}
                          style={i < m.stars ? { color: m.color } : undefined}
                        >
                          ◈
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* what it IS — specialization + current evolution (scannable label/value) */}
              <div className="tl-facts">
                <div className="tl-fact"><span className="tl-k">Specialization</span><span className="tl-v">{m.specialization}</span></div>
                <div className="tl-fact"><span className="tl-k">Evolution</span><span className="tl-v">{m.currentEvolution}</span></div>
              </div>

              {/* how STRONG it is — stat chips */}
              <div className="tl-stats">
                {m.stats.map((s) => (
                  <span className="tl-stat" key={s.label}>
                    <span className="tl-stat-v" style={{ color: m.color }}>{s.value}</span>
                    <span className="tl-stat-k">{s.label}</span>
                  </span>
                ))}
              </div>

              {/* mastery + collectible flavor */}
              <div className="tl-mastery">
                <div className="tl-mline"><span>Mastery <b>Lv {m.mastery.level}</b></span><span className="tl-kills">{m.lifetimeKills.toLocaleString()} lifetime kills</span></div>
                <ProgressBar value={m.mastery.into} max={m.mastery.need} color={m.color} height={6} label={`${m.name} mastery`} />
              </div>

              {m.signatureGenes.length > 0 && (
                <div className="tl-genes">
                  <span className="tl-k">Genes</span>
                  <span className="tl-gene-chips">
                    {m.signatureGenes.slice(0, 3).map((g) => <span className="tl-gene" key={g}>{g}</span>)}
                  </span>
                </div>
              )}
              <div className="tl-fact tl-build"><span className="tl-k">Build</span><span className="tl-v">{m.buildPath}</span></div>

              {/* what they're WORKING TOWARD — next star + the upgrade action */}
              <div className="tl-next-wrap">
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
                          next={meta.previewPower((s) => ({ ...s, towerStars: { ...s.towerStars, [k]: (s.towerStars[k] ?? 0) + 1 } })).score}
                        />
                      </span>
                    )}
                    {m.nextAbility && m.nextAbility.star !== m.nextStep.star && (
                      <span className="tl-next-ability">Next ability · ◈{m.nextAbility.star} {m.nextAbility.name}</span>
                    )}
                    {/* Campaign Evolution Cap: show what to work toward — never just grey it out. */}
                    {m.capLocked && m.capUnlock && (
                      <div className="tl-cap">
                        <span className="tl-cap-req">🧬 Reach <b>Campaign Stage {m.capUnlock.stage}</b> to evolve to ◈{m.capUnlock.maxStar}</span>
                        <ProgressBar value={Math.min(m.campaignStage, m.capUnlock.stage)} max={m.capUnlock.stage} color={m.color} height={6} label="Campaign progress" />
                        <span className="tl-cap-prog">Campaign Stage {m.campaignStage} / {m.capUnlock.stage}</span>
                        {m.nextVisualMutation && (
                          <span className="tl-cap-vis">Upcoming mutation · <b>{m.nextVisualMutation.name}</b> at ◈{m.nextVisualMutation.at}</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="tl-next is-max" style={{ borderLeftColor: m.color }}>
                    <span className="tl-next-k" style={{ color: m.color }}>FULLY ASCENDED ◈{m.stars}</span>
                  </div>
                )}

                <div className="tl-actions">
                  <button
                    className={`primary tl-mutate${m.affordable ? ' is-afford' : ''}${m.capLocked ? ' is-locked' : ''}`}
                    disabled={m.maxed || !m.affordable}
                    onClick={() => upgrade(k, m.stars)}
                    title={m.capLocked && m.capUnlock ? `Locked until Campaign Stage ${m.capUnlock.stage}` : undefined}
                  >
                    {m.maxed ? 'MAX' : m.capLocked && m.capUnlock ? <>🔒 Stage {m.capUnlock.stage}</> : <>Mutate · {m.cost} <CurrencyIcon id="towerShards" color={m.color} size={13} title="" /></>}
                  </button>
                  <span className="tl-shards" title="Strain Samples">{m.shards} <CurrencyIcon id="towerShards" color={m.color} size={13} title="" /></span>
                </div>

                {forksOf(k).some((f) => f.star <= m.stars) && (
                  <>
                    <button className="tl-forks-toggle" onClick={() => setOpenForks(openForks === k ? null : k)}>
                      Specialization paths {openForks === k ? '▾' : '▸'}
                    </button>
                    {openForks === k && <ForkPaths kind={k} stars={m.stars} color={m.color} />}
                  </>
                )}

                {(() => {
                  const pts = meta.adaptation('tower', k).pointsAvailable;
                  return (
                    <>
                      <button className="tl-forks-toggle" onClick={() => setOpenAdapt(openAdapt === k ? null : k)}>
                        Adaptation {pts > 0 && <span className="tl-adapt-badge">{pts}</span>} {openAdapt === k ? '▾' : '▸'}
                      </button>
                      {openAdapt === k && <AdaptationTree subject="tower" unit={k} color={m.color} />}
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
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
