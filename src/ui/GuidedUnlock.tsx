// GUIDED UNLOCK walkthrough (docs/GUIDED-UNLOCKS.md — Foundation #3). Renders a GuideDef from
// state/guidedUnlocks on top of the freshly-opened wing: Spotlight + Callout per step (the Combat
// Tutorial's own primitives), an interact step that advances on the player's FIRST REAL CLICK of
// the highlighted control (capture listener — the click still lands, so the practice objective IS
// the real action), then a compact completion toast with the one-time reward and the way home.
// Skippable at every moment; a missing anchor degrades to a centered card with no dim (never
// traps, never blacks out). Rewards ride the tutorial milestone ledger — replays never re-grant.

import { useEffect, useState } from 'react';
import type { GuideDef } from '../state/guidedUnlocks';
import { FEATURE_BY_ID } from '../state/unlocks';
import { meta } from '../state/meta';
import { navBus } from '../state/navBus';
import { audio } from '../audio/sound';
import { Spotlight, Callout, Typewriter } from './tutorial/primitives';
import { useTargetRect } from './tutorial/useTargetRect';

export function GuidedUnlock({ guide, onClose }: { guide: GuideDef; onClose: () => void }): JSX.Element {
  const [i, setI] = useState(0);
  // null = still stepping · {cores} = completion payout · 0 cores renders as plain "integrated"
  const [done, setDone] = useState<{ cores: number } | null>(null);
  const step = guide.steps[i];
  const rect = useTargetRect(done ? null : step?.anchor);

  const finish = (): void => {
    const granted = meta.grantTutorialMilestone('guided', guide.mech, { cores: guide.reward });
    audio.cue('unlock');
    setDone({ cores: granted?.cores ?? 0 });
  };
  const advance = (): void => { if (i >= guide.steps.length - 1) finish(); else setI(i + 1); };

  // The practice objective: the player's first real click inside the anchor advances the guide.
  // Capture phase observes WITHOUT consuming — the click still fires the control it landed on,
  // and the guide's chrome drops in the same breath so any ceremony the action opens is free.
  useEffect(() => {
    if (done || !step?.interact || !step.anchor) return undefined;
    const sel = step.anchor;
    const onClick = (e: MouseEvent): void => {
      if ((e.target as Element | null)?.closest?.(sel)) advance();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, done]);

  if (done) {
    return (
      <div className="guide-done" role="status">
        <span className="guide-done-t">✓ {(FEATURE_BY_ID.get(guide.nav)?.name ?? guide.nav).toUpperCase()} INTEGRATED</span>
        {done.cores > 0 && <span className="guide-done-r">+{done.cores} Genome Cores banked</span>}
        <span className="guide-done-btns">
          <button className="primary" onClick={() => { onClose(); navBus.go('home'); }}>⌂ Command Center ▸</button>
          <button className="guide-stay" onClick={onClose}>Stay here ▸</button>
        </span>
      </div>
    );
  }

  return (
    <div className="guide" role="dialog" aria-label="Field guide">
      <Spotlight rect={rect} dimWhenMissing={false} />
      <Callout rect={rect} side="bottom">
        <div className="guide-eyebrow">FIELD GUIDE · {i + 1} / {guide.steps.length}</div>
        <div className="guide-title">{step.title}</div>
        <div className="guide-text"><Typewriter text={step.text} /></div>
        <div className="guide-btns">
          <button className="guide-skip" onClick={onClose}>Skip</button>
          {step.interact
            ? <button className="guide-later" onClick={advance}>Got it ▸</button>
            : <button className="tut-continue" onClick={advance}>{i === guide.steps.length - 1 ? 'Finish' : 'Next'} <span aria-hidden>▸</span></button>}
        </div>
      </Callout>
    </div>
  );
}
