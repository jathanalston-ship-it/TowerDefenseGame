// TutorialOverlay — the orchestrator (docs/TUTORIAL.md §4). Reads the tutorial session store, and
// for the active checkpoint renders the reusable primitives driven by its (optional) cue: spotlight
// + arrow + callout on the target, an objective tracker, a continue prompt, and Pause/Skip. With no
// cue (placeholder lessons) it falls back to a centered callout of the checkpoint title — so the
// whole flow is demonstrable before any lesson content is authored. Fixed full-screen; the dim
// panels focus interaction while the spotlight hole passes clicks to the highlighted element.
//
// Presentation (the cinematic handoff): the first checkpoint opens under a letterboxed COLD-OPEN
// banner — the film's RELAY 7 voice establishing the trial — then the lessons run as typed uplink
// transmissions (Typewriter) with a soft `tut_step` blip on every completed checkpoint.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { audio } from '../../audio/sound';
import { tutorial } from '../../state/tutorial';
import { meta } from '../../state/meta';
import { currentCheckpoint } from '../../core/tutorial';
import { useTargetRect } from './useTargetRect';
import { Callout, CameraFocus, ContinuePrompt, ObjectiveTracker, Spotlight, TutorialArrow, Typewriter, overlaps } from './primitives';

const OPEN_MS = 3400; // the cold-open banner's hold (tap dismisses sooner)

export function TutorialOverlay(): JSX.Element | null {
  const session = tutorial.use();
  const milestone = tutorial.useMilestone();
  const cp = session ? currentCheckpoint(session.progress, session.def) : null;
  const cue = cp?.cue;

  // Hooks are unconditional (selectors are null when idle → the hook returns null).
  const spotlightRect = useTargetRect(cue?.spotlight);
  const arrowRect = useTargetRect(cue?.arrow?.target);
  const calloutRect = useTargetRect(cue?.callout?.target);
  const avoidRect = useTargetRect(cue?.callout?.avoid); // the region this lesson must never cover
  // What the Pause/Skip controls must never sit on (desktop seat — see ctlStyle below).
  const podRect = useTargetRect(session ? '[data-tut="ability"]' : null);
  const bubbleRect = useTargetRect(session ? '.tut-callout' : null);
  const pillRect = useTargetRect(session ? '.tut-objective' : null);
  const [ctlEl, setCtlEl] = useState<HTMLDivElement | null>(null); // callback ref: (re)mounts re-arm the observer
  const [ctlSize, setCtlSize] = useState({ w: 200, h: 34 });
  useEffect(() => {
    if (!ctlEl) return undefined;
    const read = (): void => setCtlSize((d) => (d.w === ctlEl.offsetWidth && d.h === ctlEl.offsetHeight ? d : { w: ctlEl.offsetWidth, h: ctlEl.offsetHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(ctlEl);
    return () => ro.disconnect();
  }, [ctlEl]);

  const paused = session?.progress.status === 'paused';
  // The Skip confirm (open ⇔ non-null): what a Skip would forfeit right now.
  const [skipCost, setSkipCost] = useState<ReturnType<typeof meta.pendingOnboardingReward>>(null);
  const advanceKind = cp?.advance.kind;
  const advanceMs = cp && cp.advance.kind === 'timed' ? cp.advance.ms : 0;

  // The cinematic COLD OPEN — shown once per session start, before lesson 1's callout.
  const [openDone, setOpenDone] = useState(false);
  useEffect(() => {
    if (!session) { setOpenDone(false); return undefined; } // re-arm for the next session
    if (openDone || session.progress.checkpoint > 0) { setOpenDone(true); return undefined; }
    const t = setTimeout(() => setOpenDone(true), OPEN_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- armed once per session start
  }, [session === null]);

  // A soft uplink blip each time a checkpoint COMPLETES (the cursor moves forward — never on retry).
  const lastCpRef = useRef(0);
  useEffect(() => {
    const at = session?.progress.checkpoint ?? 0;
    if (session && at > lastCpRef.current) audio.cue('tut_step');
    lastCpRef.current = session ? at : 0;
  }, [session, session?.progress.checkpoint]);

  // `timed` checkpoints auto-advance (re-armed on checkpoint change + retry attempt).
  useEffect(() => {
    if (!session || paused || advanceKind !== 'timed') return;
    const t = setTimeout(() => tutorial.advance(), advanceMs);
    return () => clearTimeout(t);
  }, [session, cp?.id, advanceKind, advanceMs, paused, session?.progress.attempt]);

  // ADAPTIVE REACHABILITY (docs/RESPONSIVE-DESIGN.md §tutorial): on small layouts the run column
  // scrolls, so a step's target can start below the fold. Every checkpoint AUTO-SCROLLS its primary
  // target into view (nested scroll containers included), and re-asserts shortly after in case the
  // target mounted late or a panel transition moved it. A tutorial must never point at nothing.
  // `cue.focus` joins the fallback chain so a step whose surface mounts mid-step (the Gene-Card
  // draft opens only when its wave settles) still gets brought into view — the late-mount window
  // is generous for exactly that case.
  const targetSel = cue?.arrow?.target ?? cue?.callout?.target ?? cue?.spotlight ?? cue?.focus ?? null;
  useEffect(() => {
    if (!targetSel) return;
    let tries = 0;
    const bring = (): void => {
      const el = document.querySelector(targetSel);
      if (!el) { if (++tries < 60) t = window.setTimeout(bring, 400); return; } // late-mounting target (draft opens at wave end)
      const r = el.getBoundingClientRect();
      const out = r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth;
      if (out) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      if (++tries < 3) t = window.setTimeout(bring, 700); // re-assert after transitions settle
    };
    let t = window.setTimeout(bring, 60);
    return () => clearTimeout(t);
  }, [targetSel, cp?.id]);

  if (!session || !cp) return null;

  // ── The letterboxed cold open: RELAY 7 hands the film to the trial ──
  if (!openDone) {
    return (
      <div className="tut-overlay">
        <div className="tut-cine-open" onClick={() => setOpenDone(true)}>
          <div className="tut-cine-bar tut-cine-bar-top" aria-hidden />
          <div className="tut-cine-bar tut-cine-bar-bot" aria-hidden />
          <div className="tut-cine-copy">
            <div className="tut-cine-eyebrow">DEEP CRUST RELAY 7 · UPLINK ESTABLISHED</div>
            <div className="tut-cine-title">TRIAL ONE — HOLD THE LINE</div>
            <div className="tut-cine-sub">The Core will guide your growth. Listen.</div>
          </div>
        </div>
      </div>
    );
  }

  // DESKTOP CONTROL SEAT (onboarding pass 2026-11): the bottom-right corner sat ON the hero
  // ability button at 1366×768 (a click on "Apex Leap" paused the trial). Measured, not assumed:
  // the controls take the first seat that clears the ability pod, the lesson bubble, its arrow
  // and its spotlight — just above the pod (right-aligned), else under the objective pill —
  // falling back to the CSS corner only when the pod isn't mounted. Phones keep the CSS strip.
  const vwNow = typeof window !== 'undefined' ? window.innerWidth : 1280;
  let ctlStyle: CSSProperties | undefined;
  if (vwNow > 700 && podRect) {
    const blockers = [podRect, bubbleRect, arrowRect, spotlightRect].filter((r): r is DOMRect => r !== null);
    const free = (x: number, y: number): boolean => y >= 8 && !blockers.some((r) => overlaps(x, y, ctlSize.w, ctlSize.h, r));
    const seats: [number, number][] = [
      [podRect.right - ctlSize.w, podRect.top - 10 - ctlSize.h],
      [18, (pillRect?.bottom ?? 152) + 8],
    ];
    const seat = seats.find(([x, y]) => free(x, y));
    if (seat) ctlStyle = { left: seat[0], top: seat[1], right: 'auto', bottom: 'auto' };
  }

  const total = session.def.checkpoints.length;
  const step = session.progress.checkpoint + 1;
  const calloutText = cue?.callout?.text ?? cp.title;

  return (
    <div className={`tut-overlay ${paused ? 'is-paused' : ''}`}>
      {/* Only dim when a step actually declares a spotlight — arrow/callout-only steps must leave the
          board fully interactive. dimWhenMissing=false: a hidden/late target renders NO scrim (a
          lesson must never black out the screen it is teaching). */}
      {cue?.spotlight && <Spotlight rect={spotlightRect} dimWhenMissing={false} />}
      {cue?.focus && <CameraFocus target={cue.focus} />}
      {cue?.arrow && <TutorialArrow rect={arrowRect} from={cue.arrow.from} />}

      <ObjectiveTracker title={cp.title} step={step} total={total} />

      {/* Milestone reward toast — pure CSS lifetime (animates in, holds, fades), keyed per grant. */}
      {milestone && (
        <div className="tut-milestone" key={milestone.at} role="status">
          <span className="tut-ms-label">◈ {milestone.label}</span>
          <span className="tut-ms-grant">
            {milestone.cores > 0 && <b>+{milestone.cores} Genome Cores</b>}
            {milestone.essence > 0 && <b>+{milestone.essence} Gene Essence</b>}
          </span>
        </div>
      )}

      {/* An arrow on the SAME side of the SAME target gets clear air between it and the bubble. */}
      <Callout
        rect={calloutRect}
        side={cue?.callout?.side}
        avoid={avoidRect}
        gap={cue?.arrow && cue.callout?.target === cue.arrow.target && (cue.arrow.from ?? 'top') === (cue.callout.side ?? 'bottom') ? 44 : 14}
      >
        {cue?.callout?.eyebrow && <div className="tut-callout-eyebrow">{cue.callout.eyebrow}</div>}
        {/* Narrow shells hide the floating objective pill (no room beside callouts/controls) —
            the counter rides inside the callout there instead. Desktop hides this line. */}
        <div className="tut-callout-step" aria-hidden>Step {step} of {total}</div>
        <div className="tut-callout-text"><Typewriter text={calloutText} /></div>
        {advanceKind === 'continue' && <ContinuePrompt onContinue={() => tutorial.advance()} />}
        {advanceKind === 'event' && <div className="tut-waiting">Complete the objective to continue…</div>}
      </Callout>

      {/* On phones the pills live in the top strip — when a spotlight holds that band (the
          Hive-Core lesson), they drop just below its ring so the spotlit HUD stays pristine.
          The CSS var only applies inside the phone block. Desktop: see ctlStyle. */}
      <div
        ref={setCtlEl}
        className="tut-controls"
        style={ctlStyle ?? (spotlightRect && spotlightRect.top < 96
          ? ({ ['--tut-ctl-top' as string]: `${Math.round(spotlightRect.bottom + 14)}px` } as CSSProperties)
          : undefined)}
      >
        {skipCost ? (
          // A Skip never SILENTLY forfeits the graduation (docs/TUTORIAL.md §graduation): name the
          // cost and the way back. A replay (nothing left to pay) skips straight through.
          <div className="tut-skip-confirm" role="alertdialog" aria-label="Skip the tutorial?">
            <div className="tut-skip-q">Skip the trial?</div>
            <div className="tut-skip-cost">
              You forfeit the graduation reward — +{skipCost.cores} Genome Cores, {skipCost.containers} {skipCost.containerRarity}{' '}
              Bio-Container{skipCost.containers === 1 ? '' : 's'} and more. Replay the trial from Settings any time to claim it.
            </div>
            <div className="tut-skip-btns">
              <button className="tut-ctl" onClick={() => setSkipCost(null)}>Keep training</button>
              <button className="tut-ctl tut-skip" onClick={() => tutorial.skip()}>Skip anyway</button>
            </div>
          </div>
        ) : (
          <>
            <button className="tut-ctl" onClick={() => (paused ? tutorial.resume() : tutorial.pause())}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="tut-ctl tut-skip"
              onClick={() => {
                const cost = meta.pendingOnboardingReward();
                if (cost) setSkipCost(cost); else tutorial.skip();
              }}
            >
              Skip Tutorial
            </button>
          </>
        )}
      </div>

      {paused && <div className="tut-paused-veil" aria-hidden>Paused</div>}
    </div>
  );
}
