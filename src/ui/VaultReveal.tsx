// Bio-Container opening ceremony — a fullscreen HATCHING, not a card pack (docs/LOOTBOX.md
// §opening). The reward set is already decided (a deterministic ChestResult from the meta
// layer); this only CHOREOGRAPHS it, in four acts that stay diegetic to the bio-horror identity:
//
//   INCUBATE — a living egg SQUEEZES on every audible heartbeat (WAAPI per thump, so sight
//              and sound never drift), harder as the accelerando peaks; veins brighten,
//              cracks spread, and the light LEAKING through them is the rarity tell. In the
//              last half-second the egg goes DEAD STILL — then gives. Tap to force the hatch.
//   RUPTURE  — the shell tears apart: flash (the whole room lights up), shell shrapnel,
//              falling goo, spore burst, shockwave, a backdrop quake. Brief, automatic.
//   CLUTCH   — every reward materializes AT ONCE as a face-down specimen in one grid (the
//              clutch). The player flips each by hand — a 3D membrane flip whose speed,
//              light and particles scale with the pull's rarity — or arms the Reveal all
//              cascade (a remembered "Skip animations" device pref makes it instant). Legendary+ pulls and NEW strand recoveries INTERRUPT the flow with
//              a fullscreen celebration (zoom, heartbeat, archive progress). Stockpiles
//              page in clutches of 12 — only the active page mounts (100× stays cheap).
//   HARVEST  — the summary: the PRIZE SPECIMEN banner (best pull), a rarity tally, the
//              categorized/merged ledger (New Discoveries lead) with the Power gain counted
//              up, and Replay Highlights. Never auto-closes; Open More hatches in place.
//
// Fullscreen by construction (portal + fixed backdrop). One caller (GeneticVault); one props
// shape serves both run caches and loot-queue boxes. All flip RULES live in the state layer
// (state/vaultReveal revealReduce — unit-tested); this file owns only pacing + presentation.

import { useEffect, useMemo, useReducer, useState } from 'react';
import { useCallback, useRef } from 'react';
import { useCountUp } from './components/useCountUp';
import { createPortal } from 'react-dom';
import type { ChestResult } from '../state/lootbox';
import {
  buildReveal, buildSpecimens, initialRevealState, nextFaceDown, rarityColor, rarityLabel,
  revealDone, revealGrid, revealHighlights, revealReduce,
} from '../state/vaultReveal';
import type { PullView, RevealAction, RevealSessionState, SpecimenView, SummarySection } from '../state/vaultReveal';
import { CHESTS } from '../core/config';
import { MULLIGAN_MARK } from '../core/mulligan';
import type { LootRarity } from '../core/config';
import { rarityRank } from '../core/loot';
import { formatPower } from '../core/power';
import { cardRegistry } from '../core/cards';
import { archiveCompletion } from '../core/geneDiscovery';
import { meta } from '../state/meta';
import { visibleChests } from '../state/rewardVisibility';
import { audio } from '../audio/sound';
import { setVaultSkipAnimsPref, vaultSkipAnimsPref } from '../state/prefs';
import { CurrencyIcon } from './components/CurrencyIcon';
import { PowerDelta } from './components/PowerDelta';
import { RarityFx, rfxClass } from './components/RarityFx';
import type { OwnedItem } from '../core/equipment';
import type { PowerCompare } from '../state/itemPower';

const TIER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'exotic'];

function PullFace({ pull }: { pull: PullView }): JSX.Element {
  // Mulligan piece discoveries (⊛) wear a UNIQUE ceremony (docs/MULLIGANS.md §reveal):
  // the sigil grafts in with a wriggle while tendril rings radiate from the emblem.
  const isMulligan = pull.glyph === MULLIGAN_MARK;
  return (
    <div className={`vreveal-face${isMulligan ? ' is-mulligan' : ''}`}>
      {pull.isNew && <div className="vreveal-new" aria-label="First discovery">✦ NEW DISCOVERY</div>}
      {/* the rarity WORD speaks the rarity's colour (the one map); the emblem + amount keep the reward's own */}
      <div className="vreveal-face-rword" style={{ color: rarityColor(pull.rarity) }}>{rarityLabel(pull.rarity)}</div>
      <div className="vreveal-emblem" style={{ ['--rw' as string]: pull.color }}>
        {isMulligan && <span className="vreveal-tendrils" aria-hidden><i /><i /><i /></span>}
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

/** The flow-interrupting celebration (docs/LOOTBOX.md §opening): a legendary pull's zoom
 *  moment, or a NEW strand recovery's archive card. Also serves Replay Highlights. */
function InterruptOverlay({ sp, onAck, replay }: {
  sp: SpecimenView;
  onAck: () => void;
  replay?: { i: number; n: number; onPrev: () => void; onNext: () => void };
}): JSX.Element {
  const isDiscovery = sp.interrupt === 'discovery';
  // Archive progress AFTER this open (the save already applied) — the celebration's context line.
  const archive = useMemo(() => {
    if (!isDiscovery) return null;
    const ids = meta.discoveredGeneIds();
    return { have: ids.length, total: cardRegistry.ids().length, pct: Math.round(archiveCompletion(new Set(ids)) * 100) };
  }, [isDiscovery]);
  const def = isDiscovery && sp.pull.cardId ? cardRegistry.get(sp.pull.cardId) : undefined;
  return (
    <div className={`vintr ${isDiscovery ? 'is-discovery' : 'is-legendary'}`} style={{ ['--rw' as string]: isDiscovery ? sp.pull.color : rarityColor(sp.pull.rarity) }} onClick={onAck} role="dialog" aria-modal="true" aria-label={isDiscovery ? 'New discovery' : 'Legendary specimen'}>
      <span className="vintr-rays" aria-hidden />
      <div className={`vintr-card${isDiscovery ? '' : ` ${rfxClass(sp.pull.rarity)}`}`} onClick={(e) => e.stopPropagation()}>
        {!isDiscovery && <RarityFx rarity={sp.pull.rarity} flash />}
        <div className="vintr-k">{isDiscovery ? '🧬 NEW STRAND RECOVERED' : sp.tier >= 3 ? '☣ APEX SPECIMEN CONTAINED' : '◈ PRIZE SPECIMEN'}</div>
        <div className="vintr-zoom">
          <PullFace pull={sp.pull} />
        </div>
        {isDiscovery && def && <div className="vintr-flavor">{def.description}</div>}
        {isDiscovery && archive && (
          <div className="vintr-archive">
            Archive {archive.have}/{archive.total} · <b>{archive.pct}%</b> complete
            <span className="vintr-power">▲ +Collection Power</span>
          </div>
        )}
        <div className="vintr-actions">
          {replay && <button type="button" className="vreveal-btn" onClick={replay.onPrev} disabled={replay.i === 0}>‹ Prev</button>}
          <button type="button" className="vreveal-btn primary" onClick={onAck}>
            {replay ? `Close (${replay.i + 1}/${replay.n})` : 'Continue ▸'}
          </button>
          {replay && <button type="button" className="vreveal-btn" onClick={replay.onNext} disabled={replay.i >= replay.n - 1}>Next ›</button>}
        </div>
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
  // Player-facing gate (state/rewardVisibility.ts): pulls whose system hasn't revealed yet
  // banked silently — the ceremony shows only what the player can already use.
  const chests = useMemo(() => visibleChests(meta.get(), Array.isArray(chest) ? chest : [chest]), [chest]);
  const model = useMemo(() => buildReveal(chests, compareEquip), [chests, compareEquip]);
  const specimens = useMemo(() => buildSpecimens(model), [model]);
  const grid = useMemo(() => revealGrid(model.count), [model.count]);
  // The session opens with the player's remembered "Skip animations" choice (device pref).
  const [st, dispatch] = useReducer(
    (s: RevealSessionState, a: RevealAction) => revealReduce(specimens, s, a),
    model.count,
    (count: number): RevealSessionState => ({ ...initialRevealState(count), skipAnims: vaultSkipAnimsPref() }),
  );
  const toggleSkipAnims = (): void => {
    setVaultSkipAnimsPref(!st.skipAnims);
    dispatch({ kind: 'skipAnims' });
  };

  // Ceremony magnitude: the bigger of the best pull rarity and the box's registry rank.
  const itemTier = TIER.indexOf(model.topRarity);
  const boxTier = useMemo(() => chests.reduce((m, c) => Math.max(m, rarityRank(c.chestId)), -1), [chests]);
  const tier = Math.max(0, itemTier, boxTier);
  const isRare = tier >= 2;
  const name = title ?? (chests.length === 1 ? (CHESTS[chests[0].chestId]?.name ?? 'Bio-Container') : `${chests.length}× Bio-Containers`);
  const accent = color ?? (model.pulls[model.pulls.length - 1]?.color ?? 'var(--gold)');

  const [phase, setPhase] = useState<'incubate' | 'rupture' | 'clutch' | 'summary'>(model.count > 0 ? 'incubate' : 'summary');
  const [replayI, setReplayI] = useState<number | null>(null); // Replay Highlights cursor (summary)
  const [beat, setBeat] = useState(0); // heartbeat counter — keys one visible pulse per audible thump
  const [still, setStill] = useState(false); // the DEAD-STILL beat right before the shell gives
  const podRef = useRef<HTMLDivElement | null>(null);
  const incubMs = 1700 + tier * 350; // the egg holds longer when something big is inside

  // ── INCUBATE: an ACCELERATING heartbeat (audio synced to the pod's visual accelerando).
  // Tap hatches early; the rupture is automatic at full term.
  const hatch = useCallback(() => {
    setPhase((p) => (p === 'incubate' ? 'rupture' : p));
  }, []);
  useEffect(() => {
    if (phase !== 'incubate') return undefined;
    setStill(false);
    const t = setTimeout(hatch, incubMs);
    const stillAt = incubMs - 460;
    const stillT = setTimeout(() => setStill(true), stillAt);
    const t0 = performance.now();
    const noMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let beatDelay = 560;
    let beatT: ReturnType<typeof setTimeout>;
    const thump = (): void => {
      audio.cue('heartbeat');
      setBeat((b) => b + 1);
      if (!noMotion) {
        const k = (560 - beatDelay) / (560 - 180); // 0 → 1 as the accelerando peaks
        const s = 0.028 + 0.055 * k; // the contraction grows with the rate
        podRef.current?.animate(
          [
            { transform: 'scale(1, 1)' },
            { transform: `scale(${1 + s}, ${1 - s * 0.55})`, offset: 0.32 },
            { transform: 'scale(1, 1)' },
          ],
          { duration: Math.min(260, beatDelay * 0.8), easing: 'ease-out' },
        );
      }
      beatDelay = Math.max(180, beatDelay * 0.84); // the accelerando
      if (performance.now() - t0 + beatDelay < stillAt) beatT = setTimeout(thump, beatDelay);
    };
    beatT = setTimeout(thump, 220);
    return () => { clearTimeout(t); clearTimeout(stillT); clearTimeout(beatT); };
  }, [phase, incubMs, hatch]);

  // ── RUPTURE: brief and decisive — the crack lands here, then the clutch materializes.
  useEffect(() => {
    if (phase !== 'rupture') return undefined;
    audio.cue('chest');
    const goo = setTimeout(() => audio.cue('dissolve'), 140);
    const t = setTimeout(() => setPhase('clutch'), 680);
    return () => { clearTimeout(goo); clearTimeout(t); };
  }, [phase]);

  // ── CLUTCH: flip audio — the per-rarity membrane turn ('flip@N' deepens with tier), the
  // shard ear-language on top. One effect watches the flip ORDER so manual taps and the
  // cascade sound identical (docs/LOOTBOX.md §opening).
  const flips = st.order.length;
  useEffect(() => {
    if (phase !== 'clutch' || flips === 0) return undefined;
    const sp = specimens[st.order[flips - 1]];
    if (!sp) return undefined;
    audio.cue(`flip@${sp.tier + 1}`);
    const cue = sp.pull.currency === 'heroShards' ? 'shard_hero'
      : sp.pull.currency === 'towerShards' ? 'shard_tower' : null;
    const sting = cue ? setTimeout(() => audio.cue(cue), 90) : null;
    return () => { if (sting) clearTimeout(sting); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flips, phase]);

  // The celebration's own voice: a legendary interrupt gets the double heartbeat under the
  // zoom, then 'jackpot' (which carries the 'legendary' musical stinger); a NEW strand lands
  // with 'strandFound' (which carries the 'discovery' motif).
  useEffect(() => {
    if (st.interrupt === null) return undefined;
    const sp = specimens[st.interrupt];
    if (sp?.interrupt === 'legendary') {
      audio.cue('heartbeat');
      const t1 = setTimeout(() => audio.cue('heartbeat'), 430);
      const t2 = setTimeout(() => audio.cue('jackpot'), 820);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    audio.cue('strandFound');
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.interrupt]);

  // ── The Reveal All cascade: flips the next face-down specimen (jumping pages when needed)
  // while armed and unheld. Timing lives HERE — the reducer only enforces the rules.
  useEffect(() => {
    if (phase !== 'clutch' || !st.revealAll || st.interrupt !== null) return undefined;
    const nxt = nextFaceDown(st);
    if (nxt < 0) return undefined;
    // Skip Anims + Reveal All = "just show me the harvest": everything up in one dispatch —
    // a 100× stockpile must never make the skip path a 30-second page crawl.
    if (st.skipAnims) { dispatch({ kind: 'flipAll' }); return undefined; }
    const page = Math.floor(nxt / grid.pageSize);
    if (page !== st.page) {
      const id = setTimeout(() => dispatch({ kind: 'page', to: page }), 650);
      return () => clearTimeout(id);
    }
    const pace = 340; // ms between cascade flips
    const id = setTimeout(() => dispatch({ kind: 'flip', index: nxt }), pace);
    return () => clearTimeout(id);
  }, [phase, st, grid.pageSize]);

  // A held celebration auto-continues ONLY while the cascade is armed (hands-free by choice);
  // manual flips always wait for the player's tap.
  useEffect(() => {
    if (st.interrupt === null || !st.revealAll) return undefined;
    const sp = specimens[st.interrupt];
    const id = setTimeout(() => dispatch({ kind: 'ack' }), sp?.interrupt === 'discovery' ? 2600 : 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.interrupt, st.revealAll]);

  // Everything up → the harvest (after a settle beat; instant under Skip Anims).
  const done = model.count > 0 && revealDone(st);
  useEffect(() => {
    if (phase !== 'clutch' || !done || st.interrupt !== null) return undefined;
    const id = setTimeout(() => { setPhase('summary'); audio.cue('reveal'); }, st.skipAnims ? 160 : 900);
    return () => clearTimeout(id);
  }, [phase, done, st.interrupt, st.skipAnims]);

  const isNoMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pageStart = st.page * grid.pageSize;
  const pageEnd = Math.min(model.count, pageStart + grid.pageSize);
  const pageSpecimens = specimens.slice(pageStart, pageEnd);
  const pageFlipped = pageSpecimens.filter((sp) => st.flipped[sp.index]).length;

  // The PRIZE SPECIMEN (harvest banner): the first pull at the ceremony's top rarity.
  const prize = useMemo(() => model.pulls.find((p) => p.rarity === model.topRarity) ?? model.pulls[0], [model]);
  const tally = useMemo(() => {
    const counts = new Map<LootRarity, { n: number; color: string }>();
    for (const p of model.pulls) {
      const cur = counts.get(p.rarity) ?? { n: 0, color: rarityColor(p.rarity) };
      cur.n += 1;
      counts.set(p.rarity, cur);
    }
    return TIER.filter((r) => counts.has(r)).map((r) => ({ rarity: r, ...counts.get(r)! }));
  }, [model]);
  const highlights = useMemo(() => revealHighlights(specimens, st), [specimens, st]);

  const heldSpecimen = st.interrupt !== null ? specimens[st.interrupt] : null;
  const replaySpecimen = replayI !== null ? highlights[replayI] : null;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const scope = dialog.querySelector<HTMLElement>('.vintr') ?? dialog;
    const active = document.activeElement;
    // Flipped specimens become disabled; phase changes remove their controls. Keep a
    // valid current choice, otherwise move to the active ceremony's next safe action.
    if (active instanceof HTMLElement && scope.contains(active) && active !== dialog &&
      !active.matches(':disabled') && !active.closest('.vreveal[aria-hidden="true"]')) return;
    const preferred = scope.querySelector<HTMLElement>(
      '.vintr-actions .primary, .vreveal-collect, .vreveal-return, .hatch-stage[role="button"]',
    );
    (preferred ?? scope.querySelector<HTMLElement>('button:not(:disabled)') ?? dialog).focus();
  }, [phase, st.page, flips, st.interrupt, replayI]);

  // Portal to <body> so the fixed, fullscreen backdrop escapes the Hub's `isolation: isolate`
  // stacking context — it must cover EVERYTHING (nav included) with nothing clipping it.
  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className={`vreveal-backdrop ${isRare ? 'is-rare' : ''} ${phase === 'rupture' ? 'is-quake' : ''}${heldSpecimen && !isNoMotion ? ' is-warp is-shine' : ''}`}
      style={{ ['--vr-accent' as string]: accent, ['--shine' as string]: heldSpecimen?.pull.color ?? accent }}
      onClick={phase === 'incubate' ? hatch : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} — ${phase === 'summary' ? 'Harvest' : 'Opening'}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          if (heldSpecimen) dispatch({ kind: 'ack' });
          else if (replaySpecimen) setReplayI(null);
          else if (phase === 'summary') onClose();
        } else if (e.key === 'Tab') {
          const scope = e.currentTarget.querySelector<HTMLElement>('.vintr') ?? e.currentTarget;
          const controls = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), [role="button"][tabindex="0"]'));
          const first = controls[0], last = controls[controls.length - 1];
          if (!first) { e.preventDefault(); e.currentTarget.focus(); }
          else if (!scope.contains(document.activeElement) || document.activeElement === e.currentTarget) {
            e.preventDefault(); (e.shiftKey ? last : first).focus();
          } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
      }}
    >
      {/* Sibling of the modal shell so the RUPTURE lights the whole room, not just the box
          (the shell scrolls/clips its own content — fullscreen FX can't live inside it). */}
      {phase === 'rupture' && <span className="hatch-worldflash" aria-hidden />}
      {/* The living ROOM: drifting spore strata + a slow accent fog — every act breathes in
          the same atmosphere; rare+ ceremonies stand in a god-ray column from the first beat. */}
      <span className="hatch-atmo" aria-hidden><i className="a" /><i className="b" />{isRare && <i className="rays" />}</span>
      <div className={`vreveal hatch tier-${model.topRarity} phase-${phase}`} aria-hidden={heldSpecimen || replaySpecimen ? true : undefined} onClick={(e) => e.stopPropagation()}>
        {phase === 'incubate' ? (
          <div className={`hatch-stage t${tier}${still ? ' is-still' : ''}`} onClick={hatch} role="button" tabIndex={0} aria-label="Hatch now"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); hatch(); } }}>
            <div ref={podRef} className="hatch-pod" style={{ ['--inc' as string]: `${incubMs}ms` }} aria-hidden>
              <span className="hatch-membrane" />
              <span className="hatch-fetus" />
              <span className="hatch-veins" />
              <span className="hatch-bulge" />
              <span className="hatch-crack c1" />
              <span className="hatch-crack c2" />
              <span className="hatch-crack c3" />
              <span className="hatch-spores" />
              <span className="hatch-spores b" />
              {/* one echo ring per heartbeat — the key remounts it so each thump replays it */}
              {beat > 0 && !still && <span key={beat} className="hatch-pulse" />}
              {/* …and an INNER flash on the same thump — the occupant kicks the light */}
              {beat > 0 && !still && <span key={`g${beat}`} className="hatch-glowbeat" />}
            </div>
            <span className="hatch-drips" aria-hidden><i /><i /><i /></span>
            <span className="hatch-shadow" aria-hidden />
            <div className="hatch-title" style={{ color: accent }}>{name}</div>
            <div className="vreveal-tap">{still ? '…' : 'INCUBATING — TAP TO HATCH'}</div>
          </div>
        ) : phase === 'rupture' ? (
          <div className="hatch-stage" aria-label="Hatching">
            <div className="hatch-rupture" aria-hidden>
              <span className="hatch-shell l" />
              <span className="hatch-shell r" />
              <span className="hatch-flash" />
              <span className="hatch-ring" />
              <span className="hatch-ring r2" />
              <span className="hatch-burst a" />
              <span className="hatch-burst b" />
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => (
                <i key={k} className={`hatch-bit${k % 2 ? ' s' : ''}`} style={{ ['--k' as string]: String(k) }} />
              ))}
              {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
                <i key={`e${k}`} className="hatch-ember" style={{ ['--k' as string]: String(k) }} />
              ))}
              {[0, 1, 2, 3, 4].map((k) => (
                <i key={`g${k}`} className="hatch-goo" style={{ ['--k' as string]: String(k) }} />
              ))}
            </div>
          </div>
        ) : phase === 'clutch' ? (
          <>
            <div className="hatch-stage vclutch-stage">
              <div className="hatch-floor" aria-hidden />
              {/* The clutch: ONLY the active page mounts (12 tiles max — 100× stays cheap). */}
              <div
                className={`vclutch${st.skipAnims || isNoMotion ? ' no-anim' : ''}`}
                style={{ ['--vcols' as string]: String(grid.cols), ['--vcols-n' as string]: String(grid.colsNarrow) }}
                role="group"
                aria-label={`Specimen clutch — ${pageFlipped} of ${pageSpecimens.length} revealed`}
              >
                {pageSpecimens.map((sp) => {
                  const up = st.flipped[sp.index];
                  return (
                    <button
                      type="button"
                      key={sp.index}
                      className={`vspec t${sp.tier}${up ? ' is-up' : ''}`}
                      style={{ ['--rw' as string]: sp.pull.color, ['--d' as string]: `${(sp.index - pageStart) * 45}ms` }}
                      onClick={() => dispatch({ kind: 'flip', index: sp.index })}
                      disabled={up}
                      aria-label={up ? `${sp.pull.name} — ${sp.pull.amountLabel}` : 'Face-down specimen — tap to flip'}
                    >
                      <span className="vspec-inner">
                        <span className="vspec-back" aria-hidden>
                          <i className="vspec-vein a" /><i className="vspec-vein b" /><i className="vspec-eye" />
                        </span>
                        <span className={`vspec-front${up ? ` ${rfxClass(sp.pull.rarity)}` : ''}`} style={up ? { ['--rr' as string]: rarityColor(sp.pull.rarity) } : undefined}>
                          {up && <RarityFx rarity={sp.pull.rarity} crown={false} flash={!st.skipAnims} />}
                          <PullFace pull={sp.pull} />
                          {up && sp.tier >= 2 && !st.skipAnims && (
                            <span className="vspec-sparks" aria-hidden><i /><i /><i /><i /><i /><i /></span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {grid.pages > 1 && (
                <div className="vclutch-pager" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="vreveal-btn" onClick={() => dispatch({ kind: 'page', to: st.page - 1 })} disabled={st.page === 0} aria-label="Previous clutch">‹</button>
                  <span className="vclutch-pageno">Clutch {st.page + 1}/{grid.pages}</span>
                  <button type="button" className="vreveal-btn" onClick={() => dispatch({ kind: 'page', to: st.page + 1 })} disabled={st.page >= grid.pages - 1} aria-label="Next clutch">›</button>
                </div>
              )}
            </div>

            {/* Bottom HUD: container identity + live flip progress */}
            <div className="vreveal-hud">
              <span className="vreveal-hud-name" style={{ color: accent }}>◈ {name}</span>
              <span className="vreveal-pullcount">Revealed {flips}/{model.count}</span>
              {model.count <= 24 && (
                <span className="vreveal-pips" aria-hidden>
                  {specimens.map((sp) => <i key={sp.index} className={st.flipped[sp.index] ? 'done' : ''} />)}
                </span>
              )}
            </div>

            <div className="vreveal-actions" onClick={(e) => e.stopPropagation()}>
              {done ? (
                <button type="button" className="vreveal-btn primary vreveal-continue" onClick={() => { setPhase('summary'); audio.cue('reveal'); }}>
                  Harvest ▸
                </button>
              ) : (
                <>
                  {/* ONE reveal action (+ the remembered skip toggle): Reveal all cascades the
                      clutch — or, with Skip animations on, lands every specimen at once. */}
                  <button type="button" className={`vreveal-btn primary${st.revealAll ? ' on' : ''}`} onClick={() => dispatch({ kind: 'revealAll' })}>
                    {st.revealAll ? '⏸ Flip individually' : 'Reveal all ▸'}
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={st.skipAnims}
                    className={`vreveal-skiptoggle${st.skipAnims ? ' on' : ''}`}
                    onClick={toggleSkipAnims}
                    title="Instant flips — celebrations wait for the summary. Remembered on this device."
                  >
                    <i aria-hidden />Skip animations
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {prize && (
              <div className={`hatch-prize tier-${prize.rarity} ${rfxClass(prize.rarity)}`} style={{ ['--rw' as string]: prize.color }}>
                <RarityFx rarity={prize.rarity} crown={false} flash />
                <span className="hatch-prize-k">Prize specimen</span>
                <span className="hatch-prize-crown" aria-hidden>
                  <i className="hatch-prize-halo" />
                  <span className="hatch-prize-emblem">
                    {prize.currency ? <CurrencyIcon id={prize.currency} color={prize.color} size={34} /> : <span>{prize.glyph ?? '◆'}</span>}
                  </span>
                </span>
                <span className="hatch-prize-name">{prize.name}</span>
                <span className="hatch-prize-r rfx-chip">{rarityLabel(prize.rarity)}</span>
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
              {highlights.length > 0 && (
                <button type="button" className="vreveal-btn vreveal-replay" onClick={() => setReplayI(0)}>
                  ↺ Replay Highlights ({highlights.length})
                </button>
              )}
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
      {/* The flow-interrupting celebrations (and their summary replays) sit ABOVE everything. */}
      {heldSpecimen && phase === 'clutch' && (
        <InterruptOverlay sp={heldSpecimen} onAck={() => dispatch({ kind: 'ack' })} />
      )}
      {replaySpecimen && phase === 'summary' && (
        <InterruptOverlay
          sp={replaySpecimen}
          onAck={() => setReplayI(null)}
          replay={{
            i: replayI ?? 0,
            n: highlights.length,
            onPrev: () => setReplayI((v) => Math.max(0, (v ?? 0) - 1)),
            onNext: () => setReplayI((v) => Math.min(highlights.length - 1, (v ?? 0) + 1)),
          }}
        />
      )}
    </div>,
    document.body,
  );
}
