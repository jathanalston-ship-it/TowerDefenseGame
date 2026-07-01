// Tutorial director (docs/TUTORIAL.md) — the bridge between a LIVE game and the tutorial session.
// It (1) advances the current `event` checkpoint when its lesson signal fires on the game event bus,
// and (2) scripts the few automated beats the lessons need (auto-starting the wave). Pure wiring:
// it never touches the deterministic sim beyond the same control methods the player uses.

import { useEffect } from 'react';
import type { Game } from '../../core/game';
import { gameEvents } from '../../core/events';
import type { GameEventType } from '../../core/events';
import { tutorial } from '../../state/tutorial';
import { currentCheckpoint } from '../../core/tutorial';

// Map the concrete game events onto the abstract lesson signals the checkpoints wait on.
const EVENT_MAP: Partial<Record<GameEventType, string>> = {
  towerPlaced: 'tower-placed',
  enemyKilled: 'enemy-killed',
  heroAbilityUsed: 'hero-ability',
  cardChosen: 'card-chosen',
  waveCompleted: 'wave-completed',
  waveStarted: 'wave-started',
};

/** Drive the tutorial session from the live game: advance event-checkpoints + auto-start waves. */
export function useTutorialDirector(game: Game | null): void {
  const session = tutorial.use();
  const cp = session ? currentCheckpoint(session.progress, session.def) : null;
  const cpId = cp?.id ?? null;
  const wantEvent = cp && cp.advance.kind === 'event' ? cp.advance.event : null;

  // Event bridge — re-armed per checkpoint. Advancing is guarded on the checkpoint still being
  // current, so a burst of the same event (e.g. many kills in a frame) only advances ONCE.
  useEffect(() => {
    if (!cp || !wantEvent) return;
    const thisId = cp.id;
    const offs = (Object.keys(EVENT_MAP) as GameEventType[]).map((evt) =>
      gameEvents.on(evt, () => {
        if (EVENT_MAP[evt] !== wantEvent) return;
        if (tutorial.current()?.id === thisId) tutorial.advance();
      }),
    );
    return () => offs.forEach((o) => o());
  }, [cp, wantEvent]);

  // Scripted beats — steps that need a wave running auto-start it (once we're in prep).
  useEffect(() => {
    if (!game || (cpId !== 'wave-1' && cpId !== 'graduation')) return;
    const t = setTimeout(() => { if (game.phase === 'prep') game.startWave(); }, 400);
    return () => clearTimeout(t);
  }, [game, cpId]);
}
