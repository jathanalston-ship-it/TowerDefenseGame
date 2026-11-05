// FIELD NOTE (docs/GUIDED-UNLOCKS.md §field-notes) — the in-run lesson bubble. Watches the live HUD
// for the first unseen note whose moment is live (state/fieldNotes.ts), points at its control with the
// Combat Tutorial's own Callout, and archives the mechanic into the Help wiki the moment it shows (so
// What's New never repeats it). One note at a time, held FIELD_NOTE_PACE.holdMs (tap to dismiss),
// at least gapMs apart. Pointer-transparent except the bubble itself — the fight never pauses.

import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../core/types';
import { meta } from '../state/meta';
import { FIELD_NOTE_PACE, dueFieldNote } from '../state/fieldNotes';
import type { FieldNoteDef } from '../state/fieldNotes';
import { Callout } from './tutorial/primitives';
import { useTargetRect } from './tutorial/useTargetRect';

export function FieldNote({ hud, speed }: { hud: HudSnapshot; speed: number }): JSX.Element | null {
  const [note, setNote] = useState<FieldNoteDef | null>(null);
  const lastAt = useRef(-Infinity);
  const rect = useTargetRect(note?.anchor);
  const avoid = useTargetRect(note?.avoid);

  // Arm the next due note (HUD snapshots arrive several times a second; the check is a short scan).
  useEffect(() => {
    if (note || hud.phase === 'draft') return;
    if (performance.now() - lastAt.current < FIELD_NOTE_PACE.gapMs) return;
    const seen = new Set(meta.get().help.seen);
    const due = dueFieldNote(hud, { speed }, seen);
    if (!due) return;
    meta.archiveMechanics([due.mechanic], { beat: false }); // taught now — the Help wiki keeps the full entry
    lastAt.current = performance.now();
    setNote(due);
  }, [hud, speed, note]);

  // Hold, then retire (a draft opening retires it at once — the draft owns the screen).
  useEffect(() => {
    if (!note) return undefined;
    if (hud.phase === 'draft') { setNote(null); return undefined; }
    const t = window.setTimeout(() => setNote(null), FIELD_NOTE_PACE.holdMs);
    return () => window.clearTimeout(t);
  }, [note, hud.phase]);

  if (!note) return null;
  return (
    <div className="field-note" onClick={() => setNote(null)}>
      <Callout rect={rect} side={note.side} avoid={avoid}>
        <div className="tut-callout-eyebrow">✦ FIELD NOTE · {note.eyebrow}</div>
        <div className="tut-callout-text">{note.text}</div>
        <div className="field-note-dismiss">tap to dismiss</div>
      </Callout>
    </div>
  );
}
