// Top-bar loot meter. The run banks loot points into the meta queue LIVE during play
// (meta.syncRunLoot drives it from the HUD loop), so this just REFLECTS that queue: the box
// filling now (queue[0] + its banked progress), its fill %, and the pre-determined "next" box.
//
// CONTRACT (docs/LOOTBOX.md §meter): the fill width is ALWAYS the backend fraction — a
// completion celebrates with OVERLAYS (rarity flash, container flight, burst, subtle shake),
// never by faking the width, so the display can never desynchronize from meta state again.
// On completion the fill element REMOUNTS (key=cycle): the next box's small width starts
// fresh instead of transitioning backward from full (the old "meter stays full" latch bug —
// docs/BUGFIX-LOG.md #10). No gameplay, no sim.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { costOf, rarityRegistry } from '../core/loot';
import { meta } from '../state/meta';

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315]; // burst ray angles (deg) — CSS --pa per spark

interface Celebration {
  color: string; // the COMPLETED box's rarity color (tints flash/flight/burst)
  fly: { x0: number; y0: number; x1: number; y1: number } | null; // toast rail → meter chest
}

/** DORMANT until the account's first Mega Boss kill (docs/LOOTBOX.md §meter): the HUD cell is
 *  hidden entirely — runs pay run/stage caches only, and the What's-New teach row announces the
 *  awakening when the first mega falls. Split from the body so the gate returns early without
 *  tripping the body's hook order. */
export function LootMeter(): JSX.Element | null {
  const { megaProgress } = meta.use();
  if (megaProgress.slain.length === 0) return null;
  return <LootMeterBody />;
}

function LootMeterBody(): JSX.Element {
  const { lootQueue } = meta.use();
  const frontId = lootQueue.queue[0] ?? 'common';
  const nextId = lootQueue.queue[1];
  const front = rarityRegistry.get(frontId);
  const next = nextId ? rarityRegistry.get(nextId) : undefined;
  const color = front?.color ?? 'var(--r-common)';
  const cost = costOf(frontId);
  const filled = Math.min(Math.max(0, lootQueue.progress), cost);
  const pct = cost > 0 ? Math.min(1, filled / cost) : 0;
  const toGo = Math.max(1, Math.ceil(cost - filled));
  const hot = pct >= 0.85; // near-full: the bar breathes — a container is imminent

  // Completion detection: the front rarity changed OR banked progress dropped (a box was
  // awarded; overflow carried into the next). `cycle` remounts the fill at the new width;
  // `celeb` drives the overlay ceremony. The clear-timer lives in a REF: this effect re-runs
  // on every 80ms progress tick, and an effect-cleanup timer would be cancelled by the very
  // next tick — the latch that pinned the old meter at a faked 100%.
  const [cycle, setCycle] = useState(0);
  const [celeb, setCeleb] = useState<Celebration | null>(null);
  const chestRef = useRef<HTMLSpanElement | null>(null);
  const celebTimer = useRef<number | undefined>(undefined);
  const prevFront = useRef(frontId);
  const prevProgress = useRef(lootQueue.progress);
  useEffect(() => {
    const completed = prevFront.current;
    const advanced = frontId !== prevFront.current || lootQueue.progress < prevProgress.current;
    prevFront.current = frontId;
    prevProgress.current = lootQueue.progress;
    if (!advanced) return;
    const c = chestRef.current?.getBoundingClientRect();
    setCycle((n) => n + 1);
    setCeleb({
      color: rarityRegistry.get(completed)?.color ?? 'var(--gold)',
      // Launch from the toast rail anchor (top-right, where the Earned toast lands) into the chest.
      fly: c ? { x0: window.innerWidth - 56, y0: 84, x1: c.left + c.width / 2 - 9, y1: c.top + c.height / 2 - 9 } : null,
    });
    window.clearTimeout(celebTimer.current);
    celebTimer.current = window.setTimeout(() => setCeleb(null), 1400);
  }, [frontId, lootQueue.progress]);
  useEffect(() => () => window.clearTimeout(celebTimer.current), []); // unmount only

  return (
    <div
      className={`hud-cell hud-loot tt${celeb ? ' is-celebrating' : ''}`}
      tabIndex={0}
      style={{ ['--hud-acc' as string]: color }} /* the vessel's chrome wears the incubating rarity */
    >
      <div className="hud-k">Loot</div>
      <div className="loot-row">
        <span
          ref={chestRef}
          className={`loot-chest ${celeb ? 'is-impact' : ''}`}
          aria-hidden
          style={{ borderColor: color, color: celeb?.color ?? color }}
        >
          ◈
          {celeb && (
            <span className="loot-burst" style={{ color: celeb.color }} aria-hidden>
              {SPARKS.map((a) => <i key={a} style={{ ['--pa' as string]: `${a}deg` }} />)}
            </span>
          )}
        </span>
        <div className="loot-bar-wrap">
          <div
            className={`loot-bar ${celeb ? 'is-complete' : ''}${hot ? ' is-hot' : ''}`}
            style={celeb ? { ['--cc' as string]: celeb.color } : undefined}
          >
            {/* key: a completed box REMOUNTS the fill — the new width starts fresh (no backward drain) */}
            <div key={cycle} className="loot-bar-fill" style={{ width: `${pct * 100}%`, background: color, color }} />
          </div>
          <div className="loot-sub">
            <span style={{ color }}>{front?.name ?? 'Common'}</span>
            {next && (
              <span className="hud-sub">
                {' · next '}
                <b style={{ color: next.color }}>{next.name}</b>
              </span>
            )}
            <span className="loot-pct">{Math.floor(pct * 100)}%</span>
          </div>
        </div>
      </div>
      {/* The earned container streaks from the toast rail into the meter; burst/pop land on impact. */}
      {celeb?.fly &&
        createPortal(
          <span
            className="loot-fly"
            aria-hidden
            style={{
              ['--cc' as string]: celeb.color,
              ['--fx0' as string]: `${celeb.fly.x0}px`,
              ['--fy0' as string]: `${celeb.fly.y0}px`,
              ['--fx1' as string]: `${celeb.fly.x1}px`,
              ['--fy1' as string]: `${celeb.fly.y1}px`,
            }}
          >
            ◈
          </span>,
          document.body,
        )}
      <span className="tt-bubble">
        Filling toward a <b style={{ color }}>{front?.name ?? 'Common'}</b> box ({Math.floor(filled)}/{cost}). {toGo} pts
        to go — banked live as you play, opened into shards on completion.
        {next && (
          <>
            {' '}
            Next up: <b style={{ color: next.color }}>{next.name}</b>.
          </>
        )}
      </span>
    </div>
  );
}
