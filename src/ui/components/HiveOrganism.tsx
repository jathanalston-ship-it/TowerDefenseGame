// THE LIVING HIVE (docs/HIVE-PRODUCTION.md §organism) — one breathing diagram shared by the
// Growth view (HiveScreen) and the Production view (HarvestScreen), so the two screens read
// as two views of the SAME organism. A central production sac fills toward the storage cap
// and beats at a rate proportional to production; every BUILT organ is an alive node on the
// body ring, its vein carrying resource motes toward the sac while production runs; LIVE
// synergies draw shimmering arcs between their paired organs. Pure presentation over
// meta.hiveView()/idleView() — live motion preferences and visibility pause both CSS and SVG.

import type { CSSProperties } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { HIVE_ORGANS } from '../../core/hiveOrgans';
import { HIVE_SYNERGIES, synergyLive } from '../../core/hiveProduction';
import { motionPrefs, onMotionPrefs, resolveMotion } from '../../state/prefs';
import './HiveOrganism.css';

export function HiveOrganism({
  built,
  fillFrac,
  producing,
  view,
}: {
  built: Record<string, number>;
  fillFrac: number; // 0..1 banked hours / cap (the sac's fill)
  producing: boolean; // motes + heartbeat run while the Hive accrues
  view: 'growth' | 'production'; // which view hosts it (the Hive's HostTabs strip switches views)
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const svg = root?.querySelector('svg');
    if (!root || !svg) return;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let prefs = motionPrefs();
    let visible = true;
    const sync = (): void => {
      const reduced = resolveMotion(prefs, motion?.matches ?? false).motion === 0;
      const active = !reduced && visible && !document.hidden;
      root.dataset.motion = reduced ? 'reduced' : 'full';
      root.dataset.active = active ? '1' : '0';
      if (active) svg.unpauseAnimations();
      else svg.pauseAnimations();
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer?.observe(root);
    const offPrefs = onMotionPrefs((next) => { prefs = next; sync(); });
    motion?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer?.disconnect();
      offPrefs();
      motion?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  const W = 560; const HGT = 200; const cx = W / 2; const cy = HGT / 2;
  const R = 74; // organ ring radius
  const n = HIVE_ORGANS.length;
  const pos = (i: number): { x: number; y: number } => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * (R + (i % 2 ? 16 : 0)) * 1.9, y: cy + Math.sin(a) * R };
  };
  const fill = Math.max(0, Math.min(1, fillFrac));
  const idx = new Map(HIVE_ORGANS.map((o, i) => [o.id, i] as const));
  const grown = HIVE_ORGANS.filter((o) => (built[o.id] ?? 0) > 0);

  return (
    <div ref={rootRef} className="hvo" data-motion="reduced" data-active="0" data-producing={producing ? 1 : 0} data-view={view}>
      <svg className="hvo-svg" viewBox={`0 0 ${W} ${HGT}`} aria-label={`The Hive — ${grown.length} of ${n} organs grown, ${Math.round(fill * 100)}% storage banked`}>
        {/* Veins: every BUILT organ feeds the sac; motes travel while producing. */}
        {grown.map((o) => {
          const p = pos(idx.get(o.id)!);
          const mid = { x: (p.x + cx) / 2 + (p.y < cy ? 8 : -8), y: (p.y + cy) / 2 };
          const d = `M ${p.x} ${p.y} Q ${mid.x} ${mid.y} ${cx} ${cy}`;
          return (
            <g key={`v-${o.id}`}>
              <path className="hvo-vein" d={d} />
              {producing && <circle className="hvo-mote" r="2.4"><animateMotion dur={`${2.6 + (idx.get(o.id)! % 4) * 0.7}s`} repeatCount="indefinite" path={d} /></circle>}
            </g>
          );
        })}
        {/* Synergy arcs — live pairs shimmer gold between their organs. */}
        {HIVE_SYNERGIES.filter((s) => synergyLive(built, s)).map((s) => {
          const a = pos(idx.get(s.a)!); const b = pos(idx.get(s.b)!);
          return <path key={s.id} className="hvo-syn" d={`M ${a.x} ${a.y} Q ${cx} ${cy - 46} ${b.x} ${b.y}`}><title>{s.name} — {s.note}</title></path>;
        })}
        {/* The production sac: fill rises with banked hours; the whole core beats. */}
        <g className="hvo-core">
          <circle className="hvo-core-halo" cx={cx} cy={cy} r={30} />
          <clipPath id="hvo-clip"><circle cx={cx} cy={cy} r={24} /></clipPath>
          <circle className="hvo-core-shell" cx={cx} cy={cy} r={24} />
          <rect className="hvo-core-fill" x={cx - 24} y={cy + 24 - fill * 48} width={48} height={fill * 48} clipPath="url(#hvo-clip)" />
          <text className="hvo-core-pct" x={cx} y={cy + 4} textAnchor="middle">{Math.round(fill * 100)}%</text>
        </g>
        {/* Organ nodes: alive when built (tier pips), dim silhouettes otherwise. */}
        {HIVE_ORGANS.map((o, i) => {
          const p = pos(i);
          const tiers = Math.min(built[o.id] ?? 0, o.tiers);
          return (
            <g key={o.id} className={`hvo-organ${tiers > 0 ? ' is-grown' : ''}`} style={{ ['--d' as string]: `${(i % 5) * 0.35}s` } as CSSProperties}>
              <circle className="hvo-organ-body" cx={p.x} cy={p.y} r={11} />
              <text className="hvo-organ-glyph" x={p.x} y={p.y + 3.5} textAnchor="middle">{o.icon}</text>
              {Array.from({ length: tiers }, (_, t) => (
                <circle key={t} className="hvo-pip" cx={p.x - 6 + t * 6} cy={p.y + 15} r={1.8} />
              ))}
              <title>{o.name}{tiers > 0 ? ` — tier ${tiers}/${o.tiers}` : ' — not yet grown'}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
