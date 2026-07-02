// Tower Codex (docs/TOWER-CODEX.md §3) — the encyclopedia detail view. Selecting a tower opens this
// overlay: its CURRENT form (appearance, star level, branch, mastery, unlocked abilities) plus a
// preview of EVERY evolutionary stage (◈1/3/5/7/9) and BOTH branch specializations (Tier 1-5),
// switchable instantly and viewable WITHOUT owning the upgrades. Pure presentation over towerCodex().

import { useState } from 'react';
import { meta } from '../state/meta';
import { TowerPortrait } from './TowerPortrait';
import { STAR_PREVIEW_STAGES, towerCodex } from './towerCodexModel';
import type { TowerKind } from '../core/types';

type View = { kind: 'star'; star: number } | { kind: 'branch'; branchIdx: number; tier: number };

export function TowerCodex({ kind, onClose }: { kind: TowerKind; onClose: () => void }): JSX.Element {
  const save = meta.use();
  const cx = towerCodex(save, kind);
  // Default the preview to the player's current evolution (the next preview stage ≥ their stars).
  const [view, setView] = useState<View>({ kind: 'star', star: STAR_PREVIEW_STAGES.find((s) => s >= cx.stars) ?? 9 });

  const accent = cx.color;
  const star = view.kind === 'star' ? cx.stages.find((s) => s.star === view.star) ?? cx.stages[0] : null;
  const branch = view.kind === 'branch' ? cx.branches[view.branchIdx] : null;
  const tier = view.kind === 'branch' && branch ? branch.tiers.find((t) => t.tier === view.tier) ?? branch.tiers[0] : null;

  return (
    <div className="codex-backdrop" onClick={onClose}>
      <div className="codex" onClick={(e) => e.stopPropagation()} style={{ ['--accent' as string]: accent }}>
        <button className="codex-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="codex-eyebrow">Evolution Codex</div>
        <div className="codex-title">
          <span className="codex-name" style={{ color: accent }}>{cx.name}</span>
          <span className="class-badge" style={{ background: accent }}>{cx.combatClass}</span>
        </div>

        <div className="codex-body">
          {/* LEFT: the living preview portrait + what's on screen */}
          <div className="codex-stage">
            <div className="codex-portrait">
              {view.kind === 'star' ? (
                <TowerPortrait color={accent} stars={view.star} size={188} kind={cx.kind} />
              ) : (
                <TowerPortrait color={branch!.color} stars={0} branchId={branch!.id} tier={view.tier} size={188} />
              )}
              <span className="codex-portrait-tag" style={{ color: view.kind === 'branch' ? branch!.color : accent }}>
                {view.kind === 'star' ? `◈${view.star}` : `Tier ${view.tier}`}
              </span>
            </div>
            <div className="codex-detail">
              {view.kind === 'star' && star && (
                <>
                  <div className="codex-detail-head">
                    <span className="codex-detail-name">{star.name}</span>
                    <span className={`codex-tag is-${star.state}`}>
                      {star.state === 'owned' ? 'Owned' : star.state === 'reachable' ? 'Available' : 'Locked'}
                    </span>
                  </div>
                  {star.grantsAbility && <span className="codex-ability-flag" style={{ color: accent }}>✦ New ability</span>}
                  {star.desc && <p className="codex-detail-desc">{star.desc}</p>}
                  {star.state === 'locked' && star.unlockHint && (
                    <p className="codex-locked-hint">🔒 Evolution Tier locked — <b>{star.unlockHint}</b> to raise the Star Cap.</p>
                  )}
                </>
              )}
              {view.kind === 'branch' && branch && tier && (
                <>
                  <div className="codex-detail-head">
                    <span className="codex-detail-name" style={{ color: branch.color }}>{tier.name}</span>
                    <span className="codex-tag is-branch">Tier {tier.tier}</span>
                  </div>
                  <p className="codex-detail-theme">{branch.theme}</p>
                  <p className="codex-detail-desc">{tier.desc}</p>
                </>
              )}
            </div>
          </div>

          {/* RIGHT: the current form summary + the preview switchers */}
          <div className="codex-side">
            <div className="codex-current">
              <div className="codex-cur-row"><span>Star level</span><b style={{ color: accent }}>◈{cx.stars}<span className="codex-cur-cap"> / ◈{cx.starCap}</span></b></div>
              <div className="codex-cur-row"><span>Branch</span><b>{cx.currentBranch}</b></div>
              <div className="codex-cur-row"><span>Mastery</span><b>{cx.mastery.rank ? `${cx.mastery.rank} · ` : ''}Lv {cx.mastery.level}</b></div>
            </div>
            {cx.abilities.length > 0 && (
              <div className="codex-abilities">
                <div className="codex-side-k">Unlocked abilities</div>
                <div className="codex-ability-chips">
                  {cx.abilities.map((a) => <span className="codex-ability" key={a}>{a}</span>)}
                </div>
              </div>
            )}

            <div className="codex-side-k">Preview evolution</div>
            <div className="codex-tracks">
              <button className={`codex-track${view.kind === 'star' ? ' on' : ''}`} onClick={() => setView({ kind: 'star', star: cx.stages[0].star })}>Stars</button>
              {cx.branches.map((b, i) => (
                <button
                  key={b.id}
                  className={`codex-track${view.kind === 'branch' && view.branchIdx === i ? ' on' : ''}`}
                  style={{ ['--accent' as string]: b.color }}
                  onClick={() => setView({ kind: 'branch', branchIdx: i, tier: 1 })}
                >
                  {b.name}
                </button>
              ))}
            </div>

            <div className="codex-chips">
              {view.kind === 'star'
                ? cx.stages.map((s) => (
                    <button
                      key={s.star}
                      className={`codex-chip is-${s.state}${view.star === s.star ? ' on' : ''}`}
                      onClick={() => setView({ kind: 'star', star: s.star })}
                      title={s.name}
                    >
                      ◈{s.star}
                      {s.grantsAbility && <span className="codex-chip-dot" />}
                    </button>
                  ))
                : branch!.tiers.map((t) => (
                    <button
                      key={t.tier}
                      className={`codex-chip is-tier${view.kind === 'branch' && view.tier === t.tier ? ' on' : ''}`}
                      style={{ ['--accent' as string]: branch!.color }}
                      onClick={() => setView({ kind: 'branch', branchIdx: view.branchIdx, tier: t.tier })}
                      title={t.name}
                    >
                      T{t.tier}
                    </button>
                  ))}
            </div>
            <p className="codex-hint">Preview any stage — owning it isn’t required. Campaign milestones raise the Star Cap.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
