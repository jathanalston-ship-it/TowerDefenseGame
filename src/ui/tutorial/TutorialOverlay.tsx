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
import { currentCheckpoint } from '../../core/tutorial';
import { useTargetRect } from './useTargetRect';
import { Callout, CameraFocus, ContinuePrompt, ObjectiveTracker, Spotlight, TutorialArrow, Typewriter } from './primitives';

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

  const paused = session?.progress.status === 'paused';
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

      <Callout rect={calloutRect} side={cue?.callout?.side}>
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
          The CSS var only applies inside the phone block; desktop keeps its bottom corner. */}
      <div
        className="tut-controls"
        style={spotlightRect && spotlightRect.top < 96
          ? ({ ['--tut-ctl-top' as string]: `${Math.round(spotlightRect.bottom + 14)}px` } as CSSProperties)
          : undefined}
      >
        <button className="tut-ctl" onClick={() => (paused ? tutorial.resume() : tutorial.pause())}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="tut-ctl tut-skip" onClick={() => tutorial.skip()}>Skip Tutorial</button>
      </div>

      {paused && <div className="tut-paused-veil" aria-hidden>Paused</div>}
    </div>
  );
}
