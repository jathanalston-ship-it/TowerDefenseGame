// Tutorial director (docs/TUTORIAL.md) — the bridge between a LIVE game and the tutorial session.
// It (1) advances the current `event` checkpoint when its lesson signal fires on the game event
// bus, and (2) SCRIPTS every game beat the lessons depend on, so the game can never outrun the
// lesson plan: it owns game.tutorialMode (which holds the natural post-wave drafts), starts each
// tutorial wave itself, releases the held draft exactly when the gene-card lesson arrives, tops up
// Biomass so a build lesson can't stall unaffordable, pre-selects a tower for the Inspector
// lesson, and launches wave 2 under the Hero-ability lesson (a cast needs a live swarm). Pure
// wiring: it only calls the same control methods the player could (plus the tutorial-only seams).

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

// The second-tower lesson must always be affordable: cover the priciest starter tower.
const SECOND_TOWER_BIOMASS = 180;

/** Drive the tutorial session from the live game: advance event-checkpoints + script the beats. */
export function useTutorialDirector(game: Game | null): void {
  const session = tutorial.use();
  const cp = session ? currentCheckpoint(session.progress, session.def) : null;
  const cpId = cp?.id ?? null;
  const attempt = session?.progress.attempt ?? 0;
  const wantEvent = cp && cp.advance.kind === 'event' ? cp.advance.event : null;

  // Gate the game to the lesson plan for the whole tutorial run (holds natural drafts, keeps
  // auto-start inert) and make the HUD report the LESSON's length, not the host stage's 12
  // waves + finale objectives. Never set on normal runs — golden seeds are untouched.
  const lessonWaves = session?.def.waves ?? 0;
  useEffect(() => {
    if (!game) return;
    game.tutorialMode = true;
    if (lessonWaves > 0) game.tutorialWaves = lessonWaves; // kept through the hand-off frame
  }, [game, lessonWaves]);

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

  // Scripted beats — each checkpoint's game-side setup fires when the step (re)activates. The
  // small delay lets the callout land first, so the beat reads as a consequence of the lesson.
  useEffect(() => {
    if (!game || !cpId) return;
    const t = setTimeout(() => {
      switch (cpId) {
        case 'wave-1':
          // The tutorial owns every wave start (the console is locked) — nothing can begin
          // before its lesson, and no lesson waits on a wave nobody started.
          if (game.phase === 'prep') game.startWave();
          break;
        case 'gene-card':
          // Release the held draft exactly when the lesson teaches it — immediately, inside
          // wave 1's settle beat, so it deals in natural wave → draft → build order and the
          // HUD wave counter never steps back (a resumed board in prep opens it from there).
          // tutorialMode suppressed the natural roll, so this is the FIRST draft the player sees.
          game.openTutorialDraft();
          break;
        case 'second-tower':
          game.tutorialEnsureBiomass(SECOND_TOWER_BIOMASS);
          break;
        case 'inspect': {
          // Show the Inspector with a real subject: pre-select the player's first tower.
          const first = game.towers[0];
          if (first) game.selectPlacedTower(first.id);
          break;
        }
        case 'hero-ability':
          // Teach the cast on a LIVE swarm: close the Inspector, make sure the ability is
          // charged (a veteran may have burned it in wave 1), then launch wave 2.
          game.selectPlacedTower(null);
          game.tutorialReadyAbility();
          if (game.phase === 'prep') game.startWave();
          break;
        case 'graduation':
          // Wave 2 normally still runs (it launched with the ability lesson). A slow caster can
          // outlast it — the line already held, so graduate; a resumed fresh board starts its wave.
          if (game.phase === 'prep') {
            if (lessonWaves > 0 && game.waveIndex >= lessonWaves) {
              if (tutorial.current()?.id === 'graduation') tutorial.advance();
            } else game.startWave();
          }
          break;
      }
    }, cpId === 'gene-card' ? 0 : cpId === 'wave-1' || cpId === 'hero-ability' || cpId === 'graduation' ? 600 : 350);
    return () => clearTimeout(t);
  }, [game, cpId, attempt, lessonWaves]);
}
