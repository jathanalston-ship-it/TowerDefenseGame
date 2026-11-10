// FIELD NOTE (docs/GUIDED-UNLOCKS.md §field-notes) — the in-run lesson bubble. Watches the live HUD
// for the first unseen note whose moment is live (state/fieldNotes.ts), points at its control with the
// Combat Tutorial's own Callout, and archives the mechanic into the Help wiki the moment it shows (so
// What's New never repeats it). One note at a time, held FIELD_NOTE_PACE.holdMs (tap to dismiss),
// at least gapMs apart. Hover/focus holds the note for reading; Dismiss is keyboard-accessible.
// Pointer-transparent except the bubble itself — the fight never pauses.

import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../core/types';
import { meta } from '../state/meta';
import { FIELD_NOTE_PACE, dueFieldNote } from '../state/fieldNotes';
import type { FieldNoteDef } from '../state/fieldNotes';
import { Callout } from './tutorial/primitives';
import { useTargetRect } from './tutorial/useTargetRect';

export function FieldNote({ hud, speed }: { hud: HudSnapshot; speed: number }): JSX.Element | null {
  const [note, setNote] = useState<FieldNoteDef | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const lastAt = useRef(-Infinity);
  const rect = useTargetRect(note?.anchor);
  const avoid = useTargetRect(note?.avoid);
  const dismiss = (): void => { setNote(null); setHovered(false); setFocused(false); };

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
    if (hud.phase === 'draft') { dismiss(); return undefined; }
    if (hovered || focused) return undefined; // let the player finish reading/interacting
    const t = window.setTimeout(dismiss, FIELD_NOTE_PACE.holdMs);
    return () => window.clearTimeout(t);
  }, [note, hud.phase, hovered, focused]);

  if (!note) return null;
  return (
    <div className="field-note" onClick={dismiss}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}>
      <Callout rect={rect} side={note.side} avoid={avoid}>
        <div role="status">
          <div className="tut-callout-eyebrow">✦ FIELD NOTE · {note.eyebrow}</div>
          <div className="tut-callout-text">{note.text}</div>
        </div>
        <button className="field-note-dismiss" aria-label="Dismiss field note">Dismiss</button>
      </Callout>
    </div>
  );
}
