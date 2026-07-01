// Genetic Vault opening ceremony — a premium, fullscreen pack-reveal (docs/LOOTBOX.md).
// The reward set is already decided (a deterministic ChestResult from the meta layer); this only
// CHOREOGRAPHS it. A container's rolls are shown one-by-one — face-down card → flip → reward →
// Continue → next — with a live "Pull 2/5" HUD, exactly honoring the roll count (the pull list is
// never collapsed; see state/vaultReveal). "Reveal All" skips straight to the summary. The summary
// groups every drop into categories, MERGES duplicate shard/material pulls into one "×N" row, counts
// the Power Score gained from equipment up, and NEVER auto-closes — the player dismisses it.
//
// Fullscreen by construction: a fixed, blurred, darkened backdrop centers the card so nothing clips,
// at any viewport size. One caller (GeneticVault); one props shape serves both run caches and
// loot-queue boxes (the box rarity supplies the title/accent + ceremony magnitude).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChestResult } from '../state/lootbox';
import { buildReveal, rarityLabel } from '../state/vaultReveal';
import type { PullView, SummarySection } from '../state/vaultReveal';
import { CHESTS } from '../core/config';
import type { LootRarity } from '../core/config';
import { rarityRank } from '../core/loot';
import { formatPower } from '../core/power';
import { audio } from '../audio/sound';
import { CurrencyIcon } from './components/CurrencyIcon';
import { PowerDelta } from './components/PowerDelta';
import type { OwnedItem } from '../core/equipment';
import type { PowerCompare } from '../state/itemPower';

const TIER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'exotic'];

/** Ease-out count-up for the summary's headline Power total (0 → target over ~750ms). */
function useCountUp(target: number, ms = 750): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target <= 0) { setV(0); return undefined; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function PullFace({ pull }: { pull: PullView }): JSX.Element {
  return (
    <div className="vreveal-face">
      <div className="vreveal-face-rword" style={{ color: pull.color }}>{rarityLabel(pull.rarity)}</div>
      <div className="vreveal-emblem" style={{ ['--rw' as string]: pull.color }}>
        {pull.currency ? <CurrencyIcon id={pull.currency} color={pull.color} size={46} pickup /> : <span className="vreveal-glyph">{pull.glyph ?? '◆'}</span>}
      </div>
      <div className="vreveal-face-name">{pull.name}</div>
      <div className="vreveal-face-amt" style={{ color: pull.color }}>{pull.amountLabel}</div>
      {pull.power ? <div className="vreveal-face-power">+{formatPower(pull.power)} Power</div> : null}
      {pull.compare ? <div className="vreveal-face-cmp"><PowerDelta cmp={pull.compare} /></div> : null}
    </div>
  );
}

function SummaryList({ sections, totalPower }: { sections: SummarySection[]; totalPower: number }): JSX.Element {
  const power = useCountUp(totalPower);
  return (
    <div className="vreveal-summary">
      <div className="vreveal-summary-h">
        <span className="vreveal-summary-title">Rewards Collected</span>
        {totalPower > 0 && (
          <span className="vreveal-power-total" aria-live="polite">▲ +{formatPower(power)} Power</span>
        )}
      </div>
      <div className="vreveal-sections">
        {sections.map((sec) => (
          <div className="vreveal-section" key={sec.id}>
            <div className="vreveal-section-h">
              <span className="vreveal-section-title">{sec.title}</span>
              {sec.power > 0 && <span className="vreveal-section-power">+{formatPower(sec.power)} Power</span>}
            </div>
            <ul className="vreveal-rows">
              {sec.rows.map((r, i) => (
                <li className={`vreveal-row tier-${r.rarity}`} key={r.key} style={{ ['--rw' as string]: r.color, animationDelay: `${i * 55}ms` }}>
                  {r.currency ? (
                    <CurrencyIcon id={r.currency} color={r.color} size={22} className="vreveal-row-ic" />
                  ) : (
                    <span className="vreveal-row-glyph" style={{ background: r.color }}>{r.glyph ?? '◆'}</span>
                  )}
                  <span className="vreveal-row-name">{r.name}</span>
                  {r.count > 1 && <span className="vreveal-row-x">×{r.count}</span>}
                  {r.compare ? <PowerDelta cmp={r.compare} compact /> : r.power ? <span className="vreveal-row-power">+{formatPower(r.power)}</span> : null}
                  <span className="vreveal-row-amt" style={{ color: r.color }}>{r.amountLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VaultReveal({
  chest,
  title,
  color,
  onClose,
  onOpenMore,
  remaining = 0,
  compareEquip,
}: {
  chest: ChestResult | ChestResult[];
  title?: string; // overrides the chest name (loot-queue boxes pass their rarity name)
  color?: string; // accent (loot-queue box rarity color)
  onClose: () => void; // explicit dismissal — the ceremony NEVER auto-closes
  onOpenMore?: () => void; // crack the next container in place, without leaving the reveal
  remaining?: number; // containers still stockpiled → the "Open More (N)" CTA
  compareEquip?: (item: OwnedItem) => PowerCompare; // equipment ▲/▼/= vs the selected hero's gear
}): JSX.Element {
  const chests = useMemo(() => (Array.isArray(chest) ? chest : [chest]), [chest]);
  const model = useMemo(() => buildReveal(chests, compareEquip), [chests, compareEquip]);

  // Ceremony magnitude: the bigger of the best pull rarity and the box's registry rank.
  const itemTier = TIER.indexOf(model.topRarity);
  const boxTier = useMemo(() => chests.reduce((m, c) => Math.max(m, rarityRank(c.chestId)), -1), [chests]);
  const tier = Math.max(0, itemTier, boxTier);
  const isRare = tier >= 2;
  const name = title ?? (chests.length === 1 ? (CHESTS[chests[0].chestId]?.name ?? 'Reward Cache') : `${chests.length}× Caches`);
  const accent = color ?? (model.pulls[model.pulls.length - 1]?.color ?? 'var(--gold)');

  // 'pull' plays the cards one-by-one; 'summary' shows the merged totals. An empty container
  // (should never happen — rolls ≥ 3) skips straight to the summary.
  const [phase, setPhase] = useState<'pull' | 'summary'>(model.count > 0 ? 'pull' : 'summary');
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const pull = model.pulls[i];

  useEffect(() => { audio.cue('chest'); }, []); // the container cracks open on mount

  // Auto-flip the current card after a short beat (a tap flips it early). Pace scales with rarity.
  useEffect(() => {
    if (phase !== 'pull' || flipped) return undefined;
    const id = setTimeout(() => setFlipped(true), 460 + tier * 60);
    return () => clearTimeout(id);
  }, [phase, flipped, i, tier]);

  // Per-pull stinger on flip: shards play their own cue; rarer pulls get the jackpot sting.
  useEffect(() => {
    if (phase !== 'pull' || !flipped || !pull) return;
    const cue = pull.currency === 'heroShards' ? 'shard_hero'
      : pull.currency === 'towerShards' ? 'shard_tower'
      : TIER.indexOf(pull.rarity) >= 2 ? 'jackpot' : 'reveal';
    audio.cue(cue);
  }, [phase, flipped, i, pull]);

  const toSummary = useCallback(() => { setPhase('summary'); audio.cue('reveal'); }, []);
  const advance = useCallback((): void => {
    if (phase !== 'pull') return;
    if (!flipped) { setFlipped(true); return; } // first tap flips the face-down card
    if (i < model.count - 1) { setI((n) => n + 1); setFlipped(false); } // next pull
    else toSummary(); // last pull → the summary
  }, [phase, flipped, i, model.count, toSummary]);

  const isLast = i >= model.count - 1;

  // Portal to <body> so the fixed, fullscreen backdrop escapes the Hub's `isolation: isolate`
  // stacking context — it must cover EVERYTHING (nav included) with nothing clipping it.
  return createPortal(
    <div
      className={`vreveal-backdrop ${isRare ? 'is-rare' : ''}`}
      style={{ ['--vr-accent' as string]: accent }}
      onClick={phase === 'pull' ? advance : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className={`vreveal tier-${model.topRarity} phase-${phase}`} onClick={(e) => e.stopPropagation()}>
        {phase === 'pull' && pull ? (
          <>
            <div className="vreveal-ceremony" onClick={advance}>
              <div className="vreveal-glow" aria-hidden />
              {isRare && flipped && <div className="vreveal-beams" aria-hidden />}
              {/* Key on the pull index so each pull DEALS IN fresh face-down (clean flip forward),
                  instead of reusing the element and reverse-flipping the previous reward away. */}
              <div key={i} className={`vreveal-card ${flipped ? 'is-flipped' : ''}`}>
                <div className="vreveal-card-back" aria-hidden>
                  <div className="vreveal-card-sigil" />
                  <div className="vreveal-card-rword">{rarityLabel(pull.rarity)}</div>
                </div>
                <div className="vreveal-card-front"><PullFace pull={pull} /></div>
              </div>
              {!flipped && <div className="vreveal-tap">TAP TO REVEAL</div>}
            </div>

            {/* Bottom HUD: container identity + live pull progress */}
            <div className="vreveal-hud">
              <span className="vreveal-hud-name" style={{ color: accent }}>◈ {name}</span>
              <span className="vreveal-pullcount">Pull {i + 1}/{model.count}</span>
              <span className="vreveal-pips" aria-hidden>
                {model.pulls.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'cur' : ''} />)}
              </span>
            </div>

            <div className="vreveal-actions" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="vreveal-btn primary vreveal-continue" onClick={advance}>
                {!flipped ? 'Reveal ▸' : isLast ? 'See Rewards ▸' : 'Continue ▸'}
              </button>
              {model.count > 1 && (
                <button type="button" className="vreveal-btn vreveal-revealall" onClick={toSummary}>
                  Reveal All ⏩
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <SummaryList sections={model.sections} totalPower={model.totalPower} />
            <div className="vreveal-hud summary">
              <span className="vreveal-hud-name" style={{ color: accent }}>◈ {name}</span>
              <span className="vreveal-pullcount">{model.count} pull{model.count === 1 ? '' : 's'}</span>
            </div>
            <div className="vreveal-actions" onClick={(e) => e.stopPropagation()}>
              {onOpenMore && remaining > 0 ? (
                <>
                  <button type="button" className="vreveal-btn primary vreveal-openmore" onClick={onOpenMore}>
                    Open More <span className="vreveal-btn-sub">({remaining} left)</span>
                  </button>
                  <button type="button" className="vreveal-btn vreveal-return" onClick={onClose}>Return</button>
                </>
              ) : (
                <button type="button" className="vreveal-btn primary vreveal-collect" onClick={onClose}>Collect ▸</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
