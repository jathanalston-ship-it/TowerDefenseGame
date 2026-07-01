// TutorialOverlay — the orchestrator (docs/TUTORIAL.md §4). Reads the tutorial session store, and
// for the active checkpoint renders the reusable primitives driven by its (optional) cue: spotlight
// + arrow + callout on the target, an objective tracker, a continue prompt, and Pause/Skip. With no
// cue (placeholder lessons) it falls back to a centered callout of the checkpoint title — so the
// whole flow is demonstrable before any lesson content is authored. Fixed full-screen; the dim
// panels focus interaction while the spotlight hole passes clicks to the highlighted element.

import { useEffect } from 'react';
import { tutorial } from '../../state/tutorial';
import { currentCheckpoint } from '../../core/tutorial';
import { useTargetRect } from './useTargetRect';
import { Callout, CameraFocus, ContinuePrompt, ObjectiveTracker, Spotlight, TutorialArrow } from './primitives';

export function TutorialOverlay(): JSX.Element | null {
  const session = tutorial.use();
  const cp = session ? currentCheckpoint(session.progress, session.def) : null;
  const cue = cp?.cue;

  // Hooks are unconditional (selectors are null when idle → the hook returns null).
  const spotlightRect = useTargetRect(cue?.spotlight);
  const arrowRect = useTargetRect(cue?.arrow?.target);
  const calloutRect = useTargetRect(cue?.callout?.target);

  const paused = session?.progress.status === 'paused';
  const advanceKind = cp?.advance.kind;
  const advanceMs = cp && cp.advance.kind === 'timed' ? cp.advance.ms : 0;

  // `timed` checkpoints auto-advance (re-armed on checkpoint change + retry attempt).
  useEffect(() => {
    if (!session || paused || advanceKind !== 'timed') return;
    const t = setTimeout(() => tutorial.advance(), advanceMs);
    return () => clearTimeout(t);
  }, [session, cp?.id, advanceKind, advanceMs, paused, session?.progress.attempt]);

  if (!session || !cp) return null;

  const total = session.def.checkpoints.length;
  const step = session.progress.checkpoint + 1;
  const calloutText = cue?.callout?.text ?? cp.title;

  return (
    <div className={`tut-overlay ${paused ? 'is-paused' : ''}`}>
      {/* Only dim when a step actually declares a spotlight — arrow/callout-only steps must leave the
          board fully interactive (else the full-dim fallback would block tower placement / casting). */}
      {cue?.spotlight && <Spotlight rect={spotlightRect} />}
      {cue?.focus && <CameraFocus target={cue.focus} />}
      {cue?.arrow && <TutorialArrow rect={arrowRect} from={cue.arrow.from} />}

      <ObjectiveTracker title={cp.title} step={step} total={total} />

      <Callout rect={calloutRect} side={cue?.callout?.side}>
        <div className="tut-callout-text">{calloutText}</div>
        {advanceKind === 'continue' && <ContinuePrompt onContinue={() => tutorial.advance()} />}
        {advanceKind === 'event' && <div className="tut-waiting">Complete the objective to continue…</div>}
      </Callout>

      <div className="tut-controls">
        <button className="tut-ctl" onClick={() => (paused ? tutorial.resume() : tutorial.pause())}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="tut-ctl tut-skip" onClick={() => tutorial.skip()}>Skip Tutorial</button>
      </div>

      {paused && <div className="tut-paused-veil" aria-hidden>Paused</div>}
    </div>
  );
}
