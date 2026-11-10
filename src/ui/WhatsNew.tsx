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

import { useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
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

/** One focus session across queued cards; each new card receives its own dismiss focus. */
function useUnlockDialog(stage: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = stage !== undefined;
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [visible]);
  useEffect(() => { if (stage !== undefined) ref.current?.querySelector<HTMLButtonElement>('[data-unlock-dismiss]')?.focus(); }, [stage]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      ref.current?.querySelector<HTMLButtonElement>('[data-unlock-dismiss]')?.click();
      return;
    }
    if (e.key !== 'Tab') return;
    const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  return { ref, onKeyDown };
}

export function WhatsNew(): JSX.Element | null {
  const save = meta.use(); // re-render as the archive changes
  const queue = meta.whatsNew();
  const m = queue.length > 0 ? queue[0] : null;
  const batch = queue.length >= WHATS_NEW_SUMMARY_AT;
  const dialog = useUnlockDialog(batch ? 'batch' : m?.id);
  // The unlock fanfare — once per card as it takes the stage (id-keyed, so the next card re-fires;
  // a summary card is one stage, one cue).
  useEffect(() => { if (m) audio.cue('unlock'); }, [batch ? 'batch' : m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  if (batch) {
    // Specimens bank silently until their screen reveals (WardrobeReveal's gate) — never list them early.
    const specimens = featureRevealed(save, 'specimens')
      ? save.wardrobe.pendingReveal.map(wardrobeItem).filter((d): d is WardrobeItemDef => d !== undefined)
      : [];
    return <UnlockSummary queue={queue} specimens={specimens} dialog={dialog} />;
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

  return (
    <div {...dialog} key={m.id} className="whatsnew" role="dialog" aria-modal="true" aria-label={`New system unlocked: ${m.title}`} onClick={close}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card" onClick={(e) => e.stopPropagation()}>
        <div className="wn-badge">✦ NEW SYSTEM UNLOCKED ✦</div>
        <h2 className="wn-title">{m.title}</h2>
        <div className="wn-summary">{m.summary}</div>
        {text?.media && <div className="wn-media" aria-hidden>▶ {text.media}</div>}
        {text && (
          <div className="wn-rows" role="region" aria-label="About this system" tabIndex={0}>
            <div className="wn-row"><span className="wn-k">What</span><span className="wn-v">{text.what}</span></div>
            <div className="wn-row"><span className="wn-k">Why</span><span className="wn-v">{text.why}</span></div>
            <div className="wn-row"><span className="wn-k">Where</span><span className="wn-v">{text.where}</span></div>
            <div className="wn-row"><span className="wn-k">Next</span><span className="wn-v">{text.next}</span></div>
          </div>
        )}
        <div className="wn-actions">
          {m.nav && <button className="primary wn-go" onClick={open}>{guide ? 'Show me ▸' : 'Open it now ▸'}</button>}
          <button data-unlock-dismiss className={m.nav ? 'wn-later' : 'primary wn-go'} onClick={close}>
            Got it{queue.length > 1 ? ` · ${queue.length - 1} more` : ''} ▸
          </button>
        </div>
        <div className="wn-foot">Archived in Help — revisit any time.</div>
      </div>
    </div>
  );
}

/** The batch card: every newly available system on one calm list, one dismiss. Dismissing (or
 *  opening any row) archives the WHOLE batch into Help and banks the folded specimens' reveals —
 *  they wait, unclaimed, in the Specimen Vault (nothing is granted or lost here). */
function UnlockSummary({ queue, specimens, dialog }: { queue: MechanicDef[]; specimens: WardrobeItemDef[]; dialog: ReturnType<typeof useUnlockDialog> }): JSX.Element {
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
    <div {...dialog} className="whatsnew" role="dialog" aria-modal="true" aria-label={`${rows.length} new systems unlocked`}>
      <div className="evo-rays" aria-hidden />
      <div className="wn-card wn-batch-card">
        <div className="wn-badge">✦ {rows.length} NEW SYSTEMS UNLOCKED ✦</div>
        <h2 className="wn-title wn-batch-title">Your hive is growing</h2>
        <div className="wn-summary">Each one is ready when you are — open any now, or explore later.</div>
        <ul className="wn-batch" aria-label="Newly available systems" tabIndex={0}>
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
          <button data-unlock-dismiss className="primary wn-go" onClick={settle}>Got it ▸</button>
        </div>
        <div className="wn-foot">Full briefings are archived in Help — revisit any time.</div>
      </div>
    </div>
  );
}
