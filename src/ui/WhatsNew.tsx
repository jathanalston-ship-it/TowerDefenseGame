// "What's New?" (docs/HELP.md, docs/PROGRESSION-GATING.md §presentation) — when a permanent
// mechanic first unlocks, a concise, celebratory intro: what it is, why it matters, where to find
// it, and what it enables next. Never dumps the player into the feature — but offers the door:
// the CTA routes straight to the mechanic's hub screen via the nav bus. Each card lands with the
// unlock fanfare. On dismiss it's archived into the Help wiki (revisitable, never re-announces).
// Queued: unlocks that land together show one at a time. Rendered on the menu only.
// When the mechanic has a Guided Unlock (docs/GUIDED-UNLOCKS.md), the CTA reads "Show me ▸" and
// the guideBus arms the anchored walkthrough right after navigation — card, door, guide: one chain.
// BATCHING (docs/GUIDED-UNLOCKS.md §batching): WHATS_NEW_SUMMARY_AT+ queued announcements collapse
// into ONE summary card — glyph · name · one line · "Open" per system, one dismiss — and any cosmetic
// specimens that landed in the same breath fold into it instead of queuing their own ceremonies.
// Since the first-hour PACING (docs/PROGRESSION-GATING.md §announcements) meta.whatsNew() hands at most
// ANNOUNCE.perBeat (2) cards per finished run, so the summary is the valve for a raised budget, not the
// norm: a first run now teaches two systems in full instead of listing eleven.

import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { navBus } from '../state/navBus';
import { guideBus, guideFor } from '../state/guidedUnlocks';
import { WHATS_NEW_SUMMARY_AT, unlockSummaryRows } from '../state/mechanics';
import type { MechanicDef } from '../state/mechanics';
import { MECHANIC_TEXT } from '../state/mechanicsText';
import { WARDROBE_RARITY_COLOR, wardrobeItem, wardrobeKind } from '../core/wardrobe';
import type { WardrobeItemDef } from '../core/wardrobe';
import { featureRevealed, isOpenNav } from '../state/unlocks';
import './WhatsNew.css';

export function WhatsNew(): JSX.Element | null {
  const save = meta.use(); // re-render as the archive changes
  const queue = meta.whatsNew();
  const m = queue.length > 0 ? queue[0] : null;
  const batch = queue.length >= WHATS_NEW_SUMMARY_AT;
  // The unlock fanfare — once per card as it takes the stage (id-keyed, so the next card re-fires;
  // a summary card is one stage, one cue).
  useEffect(() => { if (m) audio.cue('unlock'); }, [batch ? 'batch' : m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  if (batch) {
    // Specimens bank silently until their screen reveals (WardrobeReveal's gate) — never list them early.
    const specimens = featureRevealed(save, 'specimens')
      ? save.wardrobe.pendingReveal.map(wardrobeItem).filter((d): d is WardrobeItemDef => d !== undefined)
      : [];
    return <UnlockSummary queue={queue} specimens={specimens} />;
  }
  const guide = guideFor(m.id);
  const text = MECHANIC_TEXT[m.id];
  const close = (): void => meta.archiveMechanics([m.id]); // persist → re-render drops this card, shows the next
  const open = (): void => {
    const nav = m.nav;
    const id = m.id;
    close();
    if (nav) {
      navBus.go(nav);
      if (guide) guideBus.start(id);
    }
  };

  // LESS TO READ (2026-11-11 playtest — "whole paragraphs most people won't read"): the card is the
  // system's glyph, its name and ONE line; the full what / why / where / next briefing folds behind
  // "Details" (and lives on in Help) for the players who want it.
  const glyph = unlockSummaryRows([m], save)[0]?.glyph ?? '✦';
  return (
    <div className="whatsnew" role="dialog" aria-label="New System Unlocked" onClick={close}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card wn-solo" onClick={(e) => e.stopPropagation()}>
        <div className="wn-badge">✦ NEW SYSTEM UNLOCKED ✦</div>
        <div className="wn-medallion" aria-hidden>{glyph}</div>
        <h2 className="wn-title">{m.title}</h2>
        <div className="wn-summary">{m.summary}</div>
        {text && (
          <details className="wn-more">
            <summary>Details</summary>
            <div className="wn-rows">
              <div className="wn-row"><span className="wn-k">What</span><span className="wn-v">{text.what}</span></div>
              <div className="wn-row"><span className="wn-k">Why</span><span className="wn-v">{text.why}</span></div>
              <div className="wn-row"><span className="wn-k">Where</span><span className="wn-v">{text.where}</span></div>
              <div className="wn-row"><span className="wn-k">Next</span><span className="wn-v">{text.next}</span></div>
            </div>
          </details>
        )}
        <div className="wn-actions">
          {m.nav && <button className="primary wn-go" onClick={open}>{guide ? 'Show me ▸' : 'Open it now ▸'}</button>}
          <button className={m.nav ? 'wn-later' : 'primary wn-go'} onClick={close}>
            Got it{queue.length > 1 ? ` · ${queue.length - 1} more` : ''} ▸
          </button>
        </div>
        <div className="wn-foot">Always in Help.</div>
      </div>
    </div>
  );
}

/** The batch card: every newly available system on one calm list, one dismiss. Dismissing (or
 *  opening any row) archives the WHOLE batch into Help and banks the folded specimens' reveals —
 *  they wait, unclaimed, in the Specimen Vault (nothing is granted or lost here). */
function UnlockSummary({ queue, specimens }: { queue: MechanicDef[]; specimens: WardrobeItemDef[] }): JSX.Element {
  const rows = unlockSummaryRows(queue, meta.get());
  const settle = (): void => {
    if (specimens.length > 0) meta.takeWardrobeReveals(); // folded here — no separate ceremonies
    meta.archiveMechanics(queue.map((q) => q.id));
  };
  const go = (nav: string, id?: string): void => {
    settle();
    navBus.go(nav);
    if (id && guideFor(id)) guideBus.start(id);
  };
  const vaultOpen = specimens.length > 0 && isOpenNav(meta.get(), 'specimens');
  return (
    <div className="whatsnew" role="dialog" aria-label={`${rows.length} new systems unlocked`}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card wn-batch-card">
        <div className="wn-badge">✦ {rows.length} NEW SYSTEMS UNLOCKED ✦</div>
        <h2 className="wn-title wn-batch-title">Your hive is growing</h2>
        <div className="wn-summary">Each one is ready when you are — open any now, or explore later.</div>
        <ul className="wn-batch" aria-label="Newly available systems">
          {rows.map((r) => (
            <li className="wn-batch-row" key={r.id}>
              <span className="wn-batch-glyph" aria-hidden>{r.glyph}</span>
              <span className="wn-batch-text">
                <b>{r.title}</b>
                <span>{r.line}</span>
              </span>
              {r.nav && (
                <button type="button" className="wn-batch-open" onClick={() => go(r.nav!, r.id)} aria-label={`Open ${r.title}`}>
                  Open ▸
                </button>
              )}
            </li>
          ))}
        </ul>
        {specimens.length > 0 && (
          <div className="wn-batch-specimens">
            <span className="wn-batch-k">Also acquired</span>
            <span className="wn-batch-spec-list">
              {specimens.map((d) => (
                <i key={d.id} style={{ ['--rc' as string]: WARDROBE_RARITY_COLOR[d.rarity] } as CSSProperties}>
                  {d.payload.glyph ?? wardrobeKind(d.kind).icon} {d.name}
                </i>
              ))}
            </span>
            {vaultOpen && <button type="button" className="wn-batch-open" onClick={() => go('specimens')}>Claim ▸</button>}
          </div>
        )}
        <div className="wn-actions">
          <button className="primary wn-go" onClick={settle} autoFocus>Got it ▸</button>
        </div>
        <div className="wn-foot">Full briefings are archived in Help — revisit any time.</div>
      </div>
    </div>
  );
}
