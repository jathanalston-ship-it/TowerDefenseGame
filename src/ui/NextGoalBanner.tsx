// The anticipation surface (docs/ONE-MORE-RUN.md) — renders the Next-Goal engine so the screen a
// player would quit from always shows the nearest reward. Two forms: the Home NEXT banner + a
// "coming up" rail, and a compact single-goal cliffhanger (used on Results). Pure presentation over
// state/nextGoal; clicking a goal jumps to the system that advances it.

import { meta } from '../state/meta';
import { nextGoals } from '../state/nextGoal';
import type { NextGoal } from '../state/nextGoal';
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

/** The Home NEXT banner + a "coming up" rail of the next few goals. Reactive to the save. */
export function NextGoalBanner({ onNavigate }: { onNavigate?: (nav: string) => void }): JSX.Element | null {
  const save = meta.use();
  const goals = nextGoals(save);
  if (goals.length === 0) return null;
  const [next, ...rest] = goals;
  const go = (g: NextGoal): void => onNavigate?.(g.nav);
  return (
    <div className="nextgoal">
      <button type="button" className="ng-next" style={{ ['--gc' as string]: next.color }} onClick={() => go(next)}>
        <span className="ng-eyebrow">◈ NEXT · {pct(next.progress)}%</span>
        <span className="ng-goal-h">
          <span className="ng-goal-label">{next.label}</span>
          <span className="ng-goal-rem">{next.remaining}</span>
        </span>
        <span className="ng-bar big"><i style={{ width: `${pct(next.progress)}%` }} /></span>
        <span className="ng-goal-reward">{next.reward}</span>
      </button>
      {rest.length > 0 && (
        <div className="ng-rail">
          <span className="ng-rail-h">Coming up</span>
          {rest.slice(0, 3).map((g) => (
            <button type="button" className="ng-mini" key={g.id} style={{ ['--gc' as string]: g.color }} onClick={() => go(g)}>
              <span className="ng-mini-top"><span className="ng-mini-label">{g.label}</span><span className="ng-mini-rem">{g.remaining}</span></span>
              <span className="ng-mini-bar"><i style={{ width: `${pct(g.progress)}%` }} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
