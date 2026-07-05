// Bio-Container opening ceremony — a fullscreen HATCHING, not a card pack (docs/LOOTBOX.md).
// The reward set is already decided (a deterministic ChestResult from the meta layer); this only
// CHOREOGRAPHS it, in four acts that stay diegetic to the bio-horror identity:
//
//   INCUBATE — a living egg breathes with an accelerating heartbeat; veins brighten, glowing
//              hairline cracks spread, and the light LEAKING through the cracks is the rarity
//              tell (epic+ content charges the whole membrane). Tap to force the hatch.
//   RUPTURE  — the shell tears apart: flash, spore burst, shockwave, a backdrop quake. Brief,
//              decisive, automatic.
//   EMERGE   — each reward is BORN: a wobbling specimen sac rises from the afterbirth, its
//              silhouette dimly visible inside, then bursts (membrane shreds fly) into the
//              reward face. Rarity paces the drama; epic+ gets beams + a tinted flash. Tap
//              opens/advances; Fast auto-deals; Skip All jumps to the harvest.
//   HARVEST  — the summary: the PRIZE SPECIMEN banner (best pull), a rarity tally, then the
//              categorized/merged reward ledger with the Power gain counted up. Never
//              auto-closes; Open More hatches the next container in place.
//
// Fullscreen by construction (portal + fixed backdrop). One caller (GeneticVault); one props
// shape serves both run caches and loot-queue boxes. The pull LIST is never collapsed
// (state/vaultReveal builds it); this file is presentation only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCountUp } from './components/useCountUp';
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

function PullFace({ pull }: { pull: PullView }): JSX.Element {
  return (
    <div className="vreveal-face">
      {pull.isNew && <div className="vreveal-new" aria-label="First discovery">✦ NEW DISCOVERY</div>}
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
        <span className="vreveal-summary-title">Harvest</span>
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
                  {r.isNew && <i className="vreveal-row-new">NEW</i>}
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
  onOpenMore?: () => void; // hatch the next container in place, without leaving the ceremony
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
  const name = title ?? (chests.length === 1 ? (CHESTS[chests[0].chestId]?.name ?? 'Bio-Container') : `${chests.length}× Bio-Containers`);
  const accent = color ?? (model.pulls[model.pulls.length - 1]?.color ?? 'var(--gold)');

  const [phase, setPhase] = useState<'incubate' | 'rupture' | 'emerge' | 'summary'>(model.count > 0 ? 'incubate' : 'summary');
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false); // the current sac has burst → the reward face shows
  const [fast, setFast] = useState(false); // auto-deal each sac after its reveal
  const pull = model.pulls[i];
  const incubMs = 1700 + tier * 350; // the egg holds longer when something big is inside

  // ── INCUBATE: an ACCELERATING heartbeat (audio synced to the pod's visual accelerando).
  // Tap hatches early; the rupture is automatic at full term.
  const hatch = useCallback(() => {
    setPhase((p) => (p === 'incubate' ? 'rupture' : p));
  }, []);
  useEffect(() => {
    if (phase !== 'incubate') return undefined;
    const t = setTimeout(hatch, incubMs);
    let beatDelay = 560;
    let beat: ReturnType<typeof setTimeout>;
    const thump = (): void => {
      audio.cue('heartbeat');
      beatDelay = Math.max(180, beatDelay * 0.84); // the accelerando
      beat = setTimeout(thump, beatDelay);
    };
    beat = setTimeout(thump, 220);
    return () => { clearTimeout(t); clearTimeout(beat); };
  }, [phase, incubMs, hatch]);

  // ── RUPTURE: brief and decisive — the crack lands here, then the first birth begins.
  useEffect(() => {
    if (phase !== 'rupture') return undefined;
    audio.cue('chest');
    const goo = setTimeout(() => audio.cue('dissolve'), 140);
    const t = setTimeout(() => setPhase('emerge'), 680);
    return () => { clearTimeout(goo); clearTimeout(t); };
  }, [phase]);

  // ── EMERGE: the sac bursts on its own after a rarity-paced wobble (a tap bursts it early).
  useEffect(() => {
    if (phase !== 'emerge' || open) return undefined;
    const pace = 700 + TIER.indexOf(pull?.rarity ?? 'common') * 260;
    const id = setTimeout(() => setOpen(true), pace);
    return () => clearTimeout(id);
  }, [phase, open, i, pull]);

  // Per-birth stinger: shards play their own cue; rarer pulls get the jackpot sting.
  useEffect(() => {
    if (phase !== 'emerge' || !open || !pull) return;
    const cue = pull.currency === 'heroShards' ? 'shard_hero'
      : pull.currency === 'towerShards' ? 'shard_tower'
      : TIER.indexOf(pull.rarity) >= 2 ? 'jackpot' : 'reveal';
    audio.cue(cue);
  }, [phase, open, i, pull]);

  const toSummary = useCallback(() => { setPhase('summary'); audio.cue('reveal'); }, []);
  // Fast: once burst, the next sac rises after a beat (still one birth at a time).
  useEffect(() => {
    if (!fast || phase !== 'emerge' || !open) return undefined;
    const id = setTimeout(() => {
      if (i < model.count - 1) { setI((n) => n + 1); setOpen(false); }
      else toSummary();
    }, 460);
    return () => clearTimeout(id);
  }, [fast, phase, open, i, model.count, toSummary]);
  const advance = useCallback((): void => {
    if (phase !== 'emerge') return;
    if (!open) { setOpen(true); return; } // first tap bursts the sac
    if (i < model.count - 1) { setI((n) => n + 1); setOpen(false); } // next birth
    else toSummary(); // last birth → the harvest
  }, [phase, open, i, model.count, toSummary]);

  const isLast = i >= model.count - 1;

  // The PRIZE SPECIMEN (harvest banner): the first pull at the ceremony's top rarity.
  const prize = useMemo(() => model.pulls.find((p) => p.rarity === model.topRarity) ?? model.pulls[0], [model]);
  const tally = useMemo(() => {
    const counts = new Map<LootRarity, { n: number; color: string }>();
    for (const p of model.pulls) {
      const cur = counts.get(p.rarity) ?? { n: 0, color: p.color };
      cur.n += 1;
      counts.set(p.rarity, cur);
    }
    return TIER.filter((r) => counts.has(r)).map((r) => ({ rarity: r, ...counts.get(r)! }));
  }, [model]);

  // Portal to <body> so the fixed, fullscreen backdrop escapes the Hub's `isolation: isolate`
  // stacking context — it must cover EVERYTHING (nav included) with nothing clipping it.
  return createPortal(
    <div
      className={`vreveal-backdrop ${isRare ? 'is-rare' : ''} ${phase === 'rupture' ? 'is-quake' : ''}`}
      style={{ ['--vr-accent' as string]: accent }}
      onClick={phase === 'emerge' ? advance : phase === 'incubate' ? hatch : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className={`vreveal hatch tier-${model.topRarity} phase-${phase}`} onClick={(e) => e.stopPropagation()}>
        {phase === 'incubate' ? (
          <div className={`hatch-stage t${tier}`} onClick={hatch} role="button" aria-label="Hatch now">
            <div className="hatch-pod" style={{ ['--inc' as string]: `${incubMs}ms` }} aria-hidden>
              <span className="hatch-membrane" />
              <span className="hatch-fetus" />
              <span className="hatch-veins" />
              <span className="hatch-bulge" />
              <span className="hatch-crack c1" />
              <span className="hatch-crack c2" />
              <span className="hatch-crack c3" />
              <span className="hatch-spores" />
              <span className="hatch-spores b" />
            </div>
            <div className="hatch-title" style={{ color: accent }}>{name}</div>
            <div className="vreveal-tap">INCUBATING — TAP TO HATCH</div>
          </div>
        ) : phase === 'rupture' ? (
          <div className="hatch-stage" aria-label="Hatching">
            <div className="hatch-rupture" aria-hidden>
              <span className="hatch-shell l" />
              <span className="hatch-shell r" />
              <span className="hatch-flash" />
              <span className="hatch-ring" />
              <span className="hatch-burst a" />
              <span className="hatch-burst b" />
            </div>
          </div>
        ) : phase === 'emerge' && pull ? (
          <>
            <div className="hatch-stage" onClick={advance}>
              <div className="hatch-floor" aria-hidden />
              {isRare && open && <div className="hatch-beams" aria-hidden />}
              {/* Key on the pull index so each birth RISES fresh (a clean new sac), instead of
                  reusing the element and un-bursting the previous reward. */}
              <div key={i} className={`hatch-sac tier-${pull.rarity} ${open ? 'is-open' : ''}`} style={{ ['--rw' as string]: pull.color }}>
                <span className="hatch-sac-skin" aria-hidden>
                  <span className="hatch-embryo">
                    {pull.currency ? <CurrencyIcon id={pull.currency} color={pull.color} size={40} /> : <span>{pull.glyph ?? '◆'}</span>}
                  </span>
                  <span className="hatch-cord" />
                </span>
                {open && (
                  <span className="hatch-pop" aria-hidden>
                    {[0, 1, 2, 3, 4, 5].map((k) => <i key={k} className="hatch-shred" style={{ ['--k' as string]: String(k) }} />)}
                    <i className="hatch-pop-ring" />
                  </span>
                )}
                <div className="hatch-face">
                  <PullFace pull={pull} />
                </div>
              </div>
              {!open && <div className="vreveal-tap">TAP TO BIRTH</div>}
            </div>

            {/* Bottom HUD: container identity + live birth progress */}
            <div className="vreveal-hud">
              <span className="vreveal-hud-name" style={{ color: accent }}>◈ {name}</span>
              <span className="vreveal-pullcount">Specimen {i + 1}/{model.count}</span>
              <span className="vreveal-pips" aria-hidden>
                {model.pulls.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'cur' : ''} />)}
              </span>
            </div>

            <div className="vreveal-actions" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="vreveal-btn primary vreveal-continue" onClick={advance}>
                {!open ? 'Open ▸' : isLast ? 'Harvest ▸' : 'Next ▸'}
              </button>
              {model.count > 1 && (
                <>
                  <button type="button" className={`vreveal-btn${fast ? ' on' : ''}`} onClick={() => setFast((v) => !v)} title="Auto-deal each specimen after its reveal">
                    Fast {fast ? '✓' : '▸▸'}
                  </button>
                  <button type="button" className="vreveal-btn vreveal-revealall" onClick={toSummary}>
                    Skip All ⏩
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {prize && (
              <div className={`hatch-prize tier-${prize.rarity}`} style={{ ['--rw' as string]: prize.color }}>
                <span className="hatch-prize-k">Prize specimen</span>
                <span className="hatch-prize-emblem" aria-hidden>
                  {prize.currency ? <CurrencyIcon id={prize.currency} color={prize.color} size={30} /> : <span>{prize.glyph ?? '◆'}</span>}
                </span>
                <span className="hatch-prize-name">{prize.name}</span>
                <span className="hatch-prize-r" style={{ color: prize.color }}>{rarityLabel(prize.rarity)}</span>
              </div>
            )}
            {tally.length > 1 && (
              <div className="hatch-tally" aria-label="Rarity tally">
                {tally.map((t) => (
                  <span className="hatch-tally-chip" key={t.rarity} style={{ ['--rw' as string]: t.color }}>
                    {t.n}× {rarityLabel(t.rarity)}
                  </span>
                ))}
              </div>
            )}
            <SummaryList sections={model.sections} totalPower={model.totalPower} />
            <div className="vreveal-hud summary">
              <span className="vreveal-hud-name" style={{ color: accent }}>◈ {name}</span>
              <span className="vreveal-pullcount">{model.count} specimen{model.count === 1 ? '' : 's'}</span>
            </div>
            <div className="vreveal-actions" onClick={(e) => e.stopPropagation()}>
              {onOpenMore && remaining > 0 ? (
                <>
                  <button type="button" className="vreveal-btn primary vreveal-openmore" onClick={onOpenMore}>
                    Hatch Another <span className="vreveal-btn-sub">({remaining} left)</span>
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
