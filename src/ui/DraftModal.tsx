// Gene Card draft — pick 1 of 3 between waves. Doubles as the WAVE-CLEARED beat:
// it leads with a celebratory eyebrow + fanfare so finishing a wave feels earned,
// then gets out of the way fast (rarity color, a flagged best pick, number-key
// drafting). Data-driven over CardOption, so it scales to hundreds of cards.
//
// READABILITY (docs/CARDS.md §language): primary text is the standardized digit-free
// effect language (CardOption.lines) with color-coded bold keywords; the exact numbers
// live in a DETAIL EXPANSION — hover a card (short delay) or hold Shift on desktop,
// long-press on touch. Hierarchy: name → artwork → effect → keywords → tags → rarity.

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { audio } from '../audio/sound';
import { autoGenePref } from '../state/prefs';
import { affectsOf } from './cardAffects';
import { GeneCardArt } from './components/GeneCardArt';
import { EFFECT_CATEGORIES, FIELD_VOCAB, foldEffects } from '../core/effectLanguage';
import type { EffectLine } from '../core/effectLanguage';
import { effectsPower } from '../core/power';
import type { CardEffect } from '../core/cards';
import { cardRegistry, draftPickIndex, isRuleChangingCard } from '../core/cards';
import { DRAFT_FIT } from '../core/config';
import type { CardOption } from '../core/types';
import { RarityFx, rfxClass } from './components/RarityFx';

// Higher = rarer. Unknown tiers sort as 0, so new rarities slot in by adding a key.
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, exotic: 5 };

// Auto Gene Selection: seconds the recommended card is offered before it auto-drafts.
const AUTO_SECONDS = 10;

// Ignore picks for a beat after the modal opens, so a click/keypress already in flight as a
// wave clears can't blow through the draft. Covers the card entry animation (card-in 0.32s).
const DRAFT_ARM_MS = 260;

// Detail expansion gestures: hover dwell (desktop) and long-press (touch).
const DETAIL_HOVER_MS = 550;
const DETAIL_HOLD_MS = 450;

// The PICK MOMENT (docs/GAME-FEEL.md §draft): a committed card flares in its rarity colour while
// the others dissolve, THEN the draft resolves — a decision should land, not blink away.
const PICK_COMMIT_MS = 350;

/** One generated effect line: pre + colored bold keyword + post. The first line is the
 *  primary effect (bigger); drawback lines read as warnings. Tier drives bloom strength. */
function FxLine({ l, primary }: { l: EffectLine; primary: boolean }): JSX.Element {
  const cat = EFFECT_CATEGORIES[l.cat];
  return (
    <span className={`fx-line${primary ? ' fx-primary' : ''}${l.good ? '' : ' fx-bad'}`}>
      {l.pre}
      {l.keyword && (
        <b className={`fx-kw${l.tier >= 5 ? ' fx-kw-hi' : ''}`} style={{ color: cat.color }}>
          <i className="fx-kw-g" aria-hidden>{cat.glyph}</i>
          {l.keyword}
        </b>
      )}
      {l.post}
    </span>
  );
}

const fmt = (x: number): string => String(+x.toFixed(2));

function fieldLabel(field: string): string {
  const v = FIELD_VOCAB[field as keyof typeof FIELD_VOCAB];
  if (!v) return field;
  return 'kw' in v ? v.kw : v.exactNoun;
}

/** Live comparison rows: the run's drafted Gene-stack value for each of the option's scalar
 *  fields, before → after this pick (×-multipliers compound, bonuses sum). Capped for space. */
function comparisonRows(o: CardOption, chosenFx: readonly CardEffect[]): { label: string; before: string; after: string }[] {
  const rows: { label: string; before: string; after: string }[] = [];
  const cur = foldEffects(chosenFx);
  for (const e of foldEffects(o.effects)) {
    if (rows.length >= 3) break;
    if (e.op === 'mul') {
      const c = cur.find((x) => x.op === 'mul' && x.field === e.field);
      const b = c && c.op === 'mul' ? c.value : 1;
      rows.push({ label: fieldLabel(e.field), before: `×${fmt(b)}`, after: `×${fmt(b * e.value)}` });
    } else if (e.op === 'add') {
      const c = cur.find((x) => x.op === 'add' && x.field === e.field);
      const b = c && c.op === 'add' ? c.value : 0;
      const v = FIELD_VOCAB[e.field];
      const pct = !v || v.mode === 'frac'; // fractions read as %; counts/flats as raw units
      rows.push(pct
        ? { label: fieldLabel(e.field), before: `+${Math.round(b * 100)}%`, after: `+${Math.round((b + e.value) * 100)}%` }
        : { label: fieldLabel(e.field), before: `+${fmt(b)}`, after: `+${fmt(b + e.value)}` });
    }
  }
  return rows;
}

/** The exact-numbers expansion: per-effect precise values (category glyph + color), the live
 *  before→after comparison vs the run's drafted stack, the Power diff, and the technical line. */
function CardDetail({ o, chosen }: { o: CardOption; chosen?: CardOption[] }): JSX.Element {
  const chosenFx = chosen ? chosen.flatMap((c) => c.effects) : [];
  const rows = comparisonRows(o, chosenFx);
  const pBefore = effectsPower(chosenFx);
  const pAfter = effectsPower([...chosenFx, ...o.effects]);
  return (
    <span className="card-detail" role="note" aria-label={`${o.name} exact values`}>
      <span className="card-detail-k">◆ EXACT VALUES</span>
      {o.lines.map((l, i) => {
        const cat = EFFECT_CATEGORIES[l.cat];
        return (
          <span key={i} className={`card-detail-row${l.good ? '' : ' fx-bad'}`}>
            <i style={{ color: cat.color }}>{cat.glyph}</i>
            <span>{l.exact}</span>
          </span>
        );
      })}
      {rows.length > 0 && (
        <>
          <span className="card-detail-k">◆ YOUR GENE STACK</span>
          {rows.map((r, i) => (
            <span key={i} className="card-detail-row card-detail-cmp">
              <span className="cmp-label">{r.label}</span>
              <span className="cmp-vals">{r.before} <i>→</i> <b>{r.after}</b></span>
            </span>
          ))}
        </>
      )}
      <span className="card-detail-power">
        {pAfter > pBefore
          ? <>Gene-stack Power <b>+{Math.round((pBefore - 1) * 100)}% → +{Math.round((pAfter - 1) * 100)}%</b></>
          : 'No Power Score impact — instant value'}
      </span>
      <span className="card-detail-tech">{o.description}</span>
    </span>
  );
}

export function DraftModal({
  options,
  clearedWave,
  onPick,
  forceManual = false,
  rerollCost = -1,
  biomass = 0,
  onReroll,
  chosen,
  kind = 'wave',
  owedAfter = 0,
}: {
  options: CardOption[];
  clearedWave?: number;
  /** Why this draft opened (docs/CARDS.md): a cleared wave, the run's OPENING draft, or a SPLICE. */
  kind?: 'wave' | 'opening' | 'splice';
  /** EARLY CALL: drafts still owed after this one (called-over waves' cards, dealt back to back). */
  owedAfter?: number;
  onPick: (id: string) => void;
  /** Tutorial: the draft lesson must be a confirmed player choice — never the auto countdown. */
  forceManual?: boolean;
  /** §reroll: biomass price of the draft's ONE re-deal; -1 hides the button (used / tutorial). */
  rerollCost?: number;
  biomass?: number;
  onReroll?: () => void;
  /** The run's already-drafted cards — powers the live before→after comparison + synergy chips. */
  chosen?: CardOption[];
}): JSX.Element {
  // Synergy callouts fire ONLY when meaningful: ≥2 drafted cards already share the category.
  const catCount = new Map<string, number>();
  for (const c of chosen ?? []) catCount.set(c.category, (catCount.get(c.category) ?? 0) + 1);
  // ◆PICK (docs/CARDS.md §fit): the option that best FITS this run — fit × Power gain (G1: the old
  // highest-rarity pick matched the strongest option only 46 % of the time). Auto Gene drafts it.
  const best = draftPickIndex(options);

  // Auto Gene Selection (opt-in, persisted): a visible countdown that auto-drafts the
  // recommended card unless the player picks first. Fixed for the life of this draft.
  const auto = useRef(!forceManual && autoGenePref()).current;
  const [remaining, setRemaining] = useState(auto ? AUTO_SECONDS : 0);

  // Detail expansion state. Hover dwell + Shift are NON-blocking (a click still drafts);
  // a touch long-press BLOCKS the release-click and the next tap dismisses before picking —
  // inspecting on mobile must never accidentally spend the draft.
  const [hoverDetail, setHoverDetail] = useState<string | null>(null);
  const [heldDetail, setHeldDetail] = useState<string | null>(null);
  const [detailAll, setDetailAll] = useState(false);
  const hoverTimer = useRef(0);
  const holdTimer = useRef(0);
  const commitTimer = useRef(0);
  const suppressClick = useRef(false);
  // Pointer INTENT: the modal mounts under a cursor that never moved, and the browser still fires
  // pointerenter there — that must not tick the hover cue or drop the opaque detail sheet over the
  // card being revealed. Hover affordances arm only after a REAL pointer move.
  const ptrHome = useRef<{ x: number; y: number } | null>(null);
  const ptrMoved = useRef(false);
  const hoverArmed = useRef<string | null>(null); // the card whose hover (cue + dwell) has fired
  const [committed, setCommitted] = useState<string | null>(null);

  // Exactly one selection ever fires (manual OR auto). getSnapshot() hands us a fresh
  // options array / onPick closure every ~80ms, so handlers read the latest values via
  // refs and the timer runs from a single mount effect — depending on those identities
  // would restart the countdown forever.
  const picked = useRef(false);
  const armed = useRef(false); // input ignored until the open settles (anti click-through)
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const recIdRef = useRef(options[best].id);
  recIdRef.current = options[best].id;

  const pick = (id: string): void => {
    if (!armed.current || picked.current) return; // ignore pre-arm clicks; one pick only
    picked.current = true;
    window.clearTimeout(hoverTimer.current);
    setHoverDetail(null);
    setHeldDetail(null);
    setDetailAll(false);
    setCommitted(id);
    // The commit voice: a thunk + a riser that grows with rarity ('@tier' depth, sound.ts).
    const rarity = options.find((o) => o.id === id)?.rarity ?? 'common';
    audio.cue(`draftPick@${1 + (RARITY_RANK[rarity] ?? 0)}`);
    commitTimer.current = window.setTimeout(() => onPickRef.current(id), PICK_COMMIT_MS);
  };

  /** True once the pointer has genuinely moved inside the modal (not a mount under a still cursor). */
  const realMove = (e: ReactPointerEvent): boolean => {
    if (ptrMoved.current) return true;
    if (e.movementX !== 0 || e.movementY !== 0) return (ptrMoved.current = true);
    const home = ptrHome.current;
    if (!home) { ptrHome.current = { x: e.clientX, y: e.clientY }; return false; }
    if (Math.abs(e.clientX - home.x) + Math.abs(e.clientY - home.y) > 3) ptrMoved.current = true;
    return ptrMoved.current;
  };
  /** Hover a card: the faint hover tick + (mouse) the exact-values dwell. Once per entry. */
  const armHover = (id: string, mouse: boolean): void => {
    if (hoverArmed.current === id || picked.current) return;
    hoverArmed.current = id;
    audio.cue('hover');
    if (mouse) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => setHoverDetail(id), DETAIL_HOVER_MS);
    }
  };

  // The input-arm beat. The wave-cleared `clear` fanfare no longer plays here: it lands ON the last
  // kill (render/lastKill.ts, docs/SIGNATURE-MOMENTS.md §1) — one fanfare per wave.
  useEffect(() => {
    const id = window.setTimeout(() => { armed.current = true; }, DRAFT_ARM_MS);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(commitTimer.current);
    };
  }, []);

  // Countdown → auto-pick the recommended card. A manual pick unmounts the modal, whose
  // cleanup clears the interval — i.e. selecting "immediately cancels the timer".
  useEffect(() => {
    if (!auto) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, AUTO_SECONDS - (performance.now() - start) / 1000);
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        pick(recIdRef.current);
      }
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Shift') { setDetailAll(true); return; } // hold to peek exact values
      if (e.repeat) return;
      if (e.key >= '1' && e.key <= String(options.length)) {
        pick(options[Number(e.key) - 1].id);
      } else if (e.key === 'Enter') {
        pick(recIdRef.current);
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Shift') setDetailAll(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  return (
    <div className={`overlay${committed ? ' is-committing' : ''}`}>
      <div className="draft-head">
        {kind === 'opening'
          ? <div className="wave-cleared">◆ OPENING DRAFT ◆</div>
          : kind === 'splice'
            ? <div className="wave-cleared draft-splice-eyebrow">◆ SPLICE · EXTRA DRAFT ◆</div>
            : clearedWave ? <div className="wave-cleared">◆ WAVE {clearedWave} CLEARED ◆{owedAfter > 0 && <span className="draft-owed"> +{owedAfter} more owed — waves you called early</span>}</div> : null}
        <h2>{kind === 'opening' ? 'CHOOSE YOUR OPENING GENE' : 'DRAFT A GENE CARD'}</h2>
        <p className="draft-sub">
          {kind === 'opening' ? 'Pick the gene this run builds around — ' : 'Powers this run only — '}press <kbd>1</kbd>–<kbd>{options.length}</kbd> or <kbd>Enter</kbd> for the pick.
          Hold <kbd>Shift</kbd> (or long-press) for exact numbers.
        </p>
        {auto && (
          <div className="draft-auto" role="timer">
            <span className="draft-auto-k">◆ AUTO-DRAFT</span>
            <span className="draft-auto-bar">
              <span className="draft-auto-fill" style={{ width: `${(remaining / AUTO_SECONDS) * 100}%` }} />
            </span>
            <span className="draft-auto-n">{Math.ceil(remaining)}s</span>
            <span className="draft-auto-hint">pick any card to override</span>
          </div>
        )}
      </div>
      <div className="cards">
        {options.map((o, i) => {
          const aff = affectsOf(o.subject);
          const detailOpen = !committed && (detailAll || hoverDetail === o.id || heldDetail === o.id);
          const fate = committed === null ? '' : committed === o.id ? ' is-chosen' : ' is-dismissed';
          return (
          <button
            key={o.id}
            className={`card r-${o.rarity} ${rfxClass(o.rarity)}${i === best ? ' is-rec' : ''}${auto && i === best ? ' auto-target' : ''}${fate}`}
            style={committed ? undefined : ({ animationDelay: `${i * 70}ms`, '--i': i } as CSSProperties)}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'touch' && realMove(e)) armHover(o.id, e.pointerType === 'mouse');
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== 'touch' && realMove(e)) armHover(o.id, e.pointerType === 'mouse');
            }}
            onPointerLeave={(e) => {
              if (hoverArmed.current === o.id) hoverArmed.current = null;
              if (e.pointerType === 'mouse') {
                window.clearTimeout(hoverTimer.current);
                setHoverDetail((cur) => (cur === o.id ? null : cur));
              }
              window.clearTimeout(holdTimer.current);
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== 'mouse') {
                window.clearTimeout(holdTimer.current);
                holdTimer.current = window.setTimeout(() => {
                  suppressClick.current = true; // the release of this hold must not draft
                  setHeldDetail(o.id);
                }, DETAIL_HOLD_MS);
              }
            }}
            onPointerUp={() => window.clearTimeout(holdTimer.current)}
            onPointerCancel={() => window.clearTimeout(holdTimer.current)}
            onClick={() => {
              if (suppressClick.current) { suppressClick.current = false; return; }
              if (heldDetail === o.id) { setHeldDetail(null); return; } // first tap closes the inspect
              pick(o.id);
            }}
          >
            {/* Rarity FX (docs/GAME-FEEL.md §draft-sheen): the shared rarity language — glow, sweep, edge,
                motes, crown per tier (ui/components/RarityFx + index.css "RARITY FX"). Decorative only. */}
            <RarityFx rarity={o.rarity} />
            <span className="card-hotkey">{i + 1}</span>
            <span className="card-top">
              <span className="card-rarity">{o.rarity}</span>
              {i === best && <span className="card-rec" title="Best fit for this run — Power gain weighed by how much of your damage it touches">◆ PICK</span>}
            </span>
            <span className="card-name">{o.name}</span>
            {/* Artwork + "what it affects": tower icon+color+name, or HERO / GLOBAL /
                ECONOMY / HIVE. The synergy tag rides along, muted. */}
            <span className="card-art-row">
              <span className="card-art"><GeneCardArt id={o.id} accent={aff.color} rarity={o.rarity} size={52} /></span>
              <span className="card-art-side">
                <span className="card-affects" style={{ color: aff.color }}>
                  {aff.icon}
                  <span className="card-affects-name">{aff.label}</span>
                </span>
                <span className="card-syn">{o.category}</span>
                {/* RULE genes (docs/CARDS.md §rules) change HOW the run plays — badge them (derived from the ops). */}
                {cardRegistry.get(o.id) && isRuleChangingCard(cardRegistry.get(o.id)!) && <span className="card-rule" title="Rule gene — changes how the run plays, not just a number">⚙ RULE</span>}
              </span>
            </span>
            <span className="card-fx">
              {o.lines.map((l, k) => <FxLine key={k} l={l} primary={k === 0} />)}
            </span>
            {/* DRAFT FIT (docs/CARDS.md §fit): name a card whose subject barely matters to this run. */}
            {o.fit !== undefined && o.fit < DRAFT_FIT.offBuild && (
              <span className="card-offbuild" title="Its subject deals little of this run's damage — or your Biomass bank already overflows">◇ Off-build for this run</span>
            )}
            {(catCount.get(o.category) ?? 0) >= 2 && (
              <span className="card-pair">◈ Pairs with your {o.category} build ×{catCount.get(o.category)}</span>
            )}
            <span className="card-pick">DRAFT</span>
            {detailOpen && <CardDetail o={o} chosen={chosen} />}
          </button>
          );
        })}
      </div>
      {rerollCost >= 0 && onReroll && (
        <button
          className="draft-reroll"
          disabled={biomass < rerollCost || committed !== null}
          title={biomass < rerollCost ? `Needs ${rerollCost} Biomass` : 'Pay Biomass for a fresh deal of 3 — once per draft'}
          onClick={() => { onReroll(); audio.cue('ui'); }}
        >
          ↻ Reroll the deal · <b>{rerollCost}</b> Biomass <i>once per draft</i>
        </button>
      )}
      <div className="hint">Gene Cards reset when you extract or fall.</div>
    </div>
  );
}
