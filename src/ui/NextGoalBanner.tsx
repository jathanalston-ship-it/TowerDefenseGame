// The anticipation surface (docs/ONE-MORE-RUN.md) — renders the Next-Goal engine so the screen a
// player would quit from always shows the nearest reward. The old Home NEXT banner was absorbed
// into Mission Control's objective ledger (docs/MISSION-CONTROL.md — one main-zone owner); what
// remains here is the macro-loop directive and the Results cliffhanger. Pure presentation over
// state/nextGoal + state/progressionLoop.

import { meta } from '../state/meta';
import { nextGoals } from '../state/nextGoal';
import { loopAdvice, loopState } from '../state/progressionLoop';

const pct = (p: number): number => Math.round(p * 100);

/** The MACRO-loop directive (docs/PROGRESSION-LOOP.md) — one line of Campaign↔Infinite routing:
 *  farm Infinite at the wall, push Campaign when the power target is met. Shared by Results,
 *  Campaign, and Infinite so the loop reads identically everywhere. */
export function LoopDirective({ difficultyId }: { difficultyId?: string }): JSX.Element {
  const ls = loopState(meta.get(), difficultyId);
  const farm = ls.phase === 'farm-infinite';
  return (
    <div className={`loop-directive ${farm ? 'is-farm' : 'is-push'}`}>
      <span className="loop-k">{farm ? '∞ FARM PHASE' : '◈ PUSH PHASE'}</span>
      <span className="loop-line">{loopAdvice(ls)}</span>
      <span className="loop-meter" aria-hidden>
        <i style={{ width: `${Math.min(100, Math.round(ls.readiness * 100))}%` }} />
      </span>
      <span className="loop-sub">
        Stage {ls.frontierStage} readiness · Power {Math.round(ls.power).toLocaleString()} / {ls.requiredPower.toLocaleString()}
      </span>
    </div>
  );
}

/** The single nearest goal, as a compact cliffhanger — "1 run from …". Used on the Results screen. */
export function NextGoalCliffhanger(): JSX.Element | null {
  const goal = nextGoals(meta.get())[0];
  if (!goal) return null;
  return (
    <div className="ng-cliff" style={{ ['--gc' as string]: goal.color }}>
      <span className="ng-cliff-eyebrow">◈ You're almost there — {pct(goal.progress)}%</span>
      <div className="ng-goal-h">
        <span className="ng-goal-label">{goal.label}</span>
        <span className="ng-goal-rem">{goal.remaining}</span>
      </div>
      <div className="ng-bar big"><i style={{ width: `${pct(goal.progress)}%` }} /></div>
      <span className="ng-goal-reward">{goal.reward} — one more run.</span>
    </div>
  );
}

