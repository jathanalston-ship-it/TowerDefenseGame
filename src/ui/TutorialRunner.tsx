// The tutorial MODE — its own screen. It hosts a REAL, simplified game (fail-safe: the Hive Core is
// boosted so it can't fall mid-lesson) and layers the TutorialOverlay + director on top. The director
// advances event-checkpoints from live game signals and scripts the wave beats; the overlay draws the
// spotlights/arrows/callouts. On genuine completion it grants the one-time rewards (idempotent — a
// replay from Settings never re-grants) and shows the reward reveal; a Skip just leaves.

import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/sound';
import { telemetry } from '../net/telemetry';
import { tutorial } from '../state/tutorial';
import { currentCheckpoint } from '../core/tutorial';
import { navBus } from '../state/navBus';
import { meta, metaModifiers } from '../state/meta';
import type { TutorialRewardSummary } from '../state/meta';
import type { Game } from '../core/game';
import type { HeroKind, HeroProgress, MetaModifiers, TowerProgress } from '../core/types';
import { GameView } from './GameView';
import { TutorialOverlay } from './tutorial/TutorialOverlay';
import { useTutorialDirector } from './tutorial/tutorialDirector';
import { Commissioning } from './tutorial/Commissioning';

const TUTORIAL_SEED = 0x7c0de; // fixed → the tutorial encounter is identical every time

interface RunConfig { mods: MetaModifiers; progress: TowerProgress; heroKind: HeroKind; heroProgress: HeroProgress }

export function TutorialRunner({ onExit }: { onExit: () => void }): JSX.Element {
  const session = tutorial.use();
  const [game, setGame] = useState<Game | null>(null);
  const [reward, setReward] = useState<TutorialRewardSummary | null>(null);
  useTutorialDirector(game);

  // Snapshot the fail-safe run config ONCE: the player's real progression, unmodified — the
  // lesson's "can't be lost" guarantee comes from god-mode below, NOT from inflating the core
  // (a +100000 bonus used to make the HUD read "100100/100100" right as the spotlight says
  // "your one life", which read as a bug to the very player being taught).
  const cfg = useRef<RunConfig | null>(null);
  if (!cfg.current) {
    const base = metaModifiers(meta.get());
    cfg.current = {
      mods: base,
      progress: meta.towerProgress(),
      heroKind: meta.selectedHero(),
      heroProgress: meta.heroProgress(),
    };
  }

  // Completion detection: the session goes active→null when the final step advances (or on Skip).
  // Rewards are gated on the store's end reason — a Skip (even on the last step) never pays out.
  // Fail-safe: the Hive Core (and hero) cannot take lethal damage during the lesson.
  useEffect(() => {
    if (game) game.god = true;
  }, [game]);

  // Tutorial funnel telemetry (docs/ANALYTICS.md §tutorial): every checkpoint REACHED emits
  // once; a skip emits the abandon point — the funnel + abandonment insight read these.
  const stepRef = useRef<string | null>(null);
  const cp = session ? currentCheckpoint(session.progress, session.def) : null;
  useEffect(() => {
    if (cp && cp.id !== stepRef.current) {
      stepRef.current = cp.id;
      telemetry.emit('tut', { d: cp.id });
    }
  }, [cp]);

  const wasActive = useRef(false);
  useEffect(() => {
    if (session) {
      wasActive.current = true;
    } else if (wasActive.current) {
      if (tutorial.lastEndReason() === 'skipped' && stepRef.current) {
        telemetry.emit('tut', { d: `abandon:${stepRef.current}` });
      }
      if (tutorial.lastEndReason() === 'completed') {
        audio.cue('tut_done'); // graduation — the rising ceremony stinger
        const r = meta.grantTutorialRewards('combat'); // idempotent — null on a replay
        if (r) { setReward(r); return; }
      }
      // A SKIPPER wants to play, not read (playtest 2026-07: both testers skipped) — land them on
      // the Campaign screen, one Deploy from the real Stage 1, instead of the bare hub. Deferred a
      // tick so the Hub has mounted and is listening on the nav bus.
      const skipped = tutorial.lastEndReason() === 'skipped';
      onExit();
      if (skipped) setTimeout(() => navBus.go('campaign'), 150);
    }
  }, [session, onExit]);

  // Genuine completion → THE COMMISSIONING (docs/PROFILE.md §commissioning): rewards, then
  // designation + identity + the account safeguard as ONE ceremony (skips stay on the old
  // menu-modal fallbacks — CommanderName / WelcomeGate — unchanged).
  if (reward) return <Commissioning reward={reward} onClose={onExit} />;

  return (
    <div className="tut-runner">
      <GameView
        tutorial
        onReady={setGame}
        seed={TUTORIAL_SEED}
        mods={cfg.current.mods}
        progress={cfg.current.progress}
        heroKind={cfg.current.heroKind}
        heroProgress={cfg.current.heroProgress}
        onEnd={() => { /* the tutorial drives its own completion — never auto-ends */ }}
        onAbandon={onExit}
      />
      <TutorialOverlay />
    </div>
  );
}
