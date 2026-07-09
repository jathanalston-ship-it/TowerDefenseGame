// Infestation board (docs/INFESTATION.md §map) — the home conquest surface. A LIVING
// canvas territory map (render/infestationMap.ts): four region lobes, sixteen sector cells
// that fill with creeping infestation by their live level, a pulsing pin, a feed reticle,
// saturation glow, and entrenchment auras. A transparent a11y/click overlay (one button per
// cell, positioned from the shared layout) keeps it keyboard- and screen-reader-navigable.
// Header shows map totals; a control row pins a sector/region/spread; a detail line reads the
// focused sector's tier + decay forecast. The canvas loop is DPR-aware and pauses when hidden
// or under prefers-reduced-motion (one still frame).

import { useEffect, useMemo, useRef, useState } from 'react';
import { meta } from '../../state/meta';
import { audio } from '../../audio/sound';
import { REGIONS, regionOfSector } from '../../core/infestation';
import { REDUCED_MAP_T, decayFlashes, drawInfestationMap, infestationLayout } from '../../render/infestationMap';
import type { MapDrawState } from '../../render/infestationMap';

const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const REGION_IDS = REGIONS.map((r) => ({ id: r.id, sectorIds: r.sectors.map((s) => s.id) }));

function fmtDays(d: number | null): string {
  if (d === null) return '—';
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h`;
  if (d < 10) return `${d.toFixed(1)}d`;
  return `${Math.round(d)}d`;
}

export function InfestationBoard(): JSX.Element {
  meta.use();
  const view = meta.infestationView();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<string | null>(null); // hovered/keyboard-focused sector for the detail line
  const [, bump] = useState(0);

  // Live draw state, mutated each frame from the current view (kept in a ref so the rAF loop
  // never restarts on a React render). Feed flashes are seeded when a sector's level rises.
  const drawRef = useRef<MapDrawState>({
    levels: {}, accents: {}, entrenched: {}, fractions: {}, pinnedSectors: new Set(), feedsInto: '', flashes: {},
  });
  const prevLevels = useRef<Record<string, number>>({});

  // Which cells wear the pin: a sector-pin marks itself; a region-pin marks the sector its
  // runs actually feed (the resolved feedsInto), so the pulse always sits where points land.
  const pinnedSectors = useMemo(() => {
    const set = new Set<string>();
    if (view.target) {
      if (view.sectorDetails[view.target]) set.add(view.target); // sector pin
      else set.add(view.feedsInto); // region pin → its live emptiest
    }
    return set;
  }, [view.target, view.feedsInto, view.sectorDetails]);

  // Sync the draw state from the view on every render; flash any sector that just grew.
  useEffect(() => {
    const d = drawRef.current;
    d.feedsInto = view.feedsInto;
    d.pinnedSectors = pinnedSectors;
    for (const r of view.regions) {
      d.accents[r.def.id] = r.def.accent;
      d.entrenched[r.def.id] = r.entrenched;
      d.fractions[r.def.id] = r.fraction;
    }
    for (const [id, lvl] of Object.entries(view.sectors)) {
      d.levels[id] = lvl;
      if (lvl > (prevLevels.current[id] ?? 0) + 0.01) d.flashes[id] = 1;
    }
    prevLevels.current = { ...view.sectors };
  });

  // The canvas projector — DPR-scaled, visibility-paused, reduced-motion single-still.
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    let last = performance.now();
    let stopped = false;
    const size = (): void => {
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    };
    const paint = (t: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = cv.width / dpr;
      const h = cv.height / dpr;
      const layout = infestationLayout(w, h, REGION_IDS);
      drawInfestationMap(ctx, layout, drawRef.current, t);
    };
    size();
    if (reducedMotion) {
      paint(REDUCED_MAP_T);
      return () => { stopped = true; };
    }
    const loop = (now: number): void => {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        decayFlashes(drawRef.current.flashes, dt);
        paint(now / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = (): void => size();
    window.addEventListener('resize', onResize);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Redraw the reduced-motion still whenever the data changes (no loop to pick it up).
  useEffect(() => {
    if (!reducedMotion) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const layout = infestationLayout(cv.width / dpr, cv.height / dpr, REGION_IDS);
    drawInfestationMap(ctx, layout, drawRef.current, REDUCED_MAP_T);
  });

  // The overlay layout uses CSS px (clientWidth/Height) so buttons sit exactly over the cells.
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = (): void => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const overlay = useMemo(() => infestationLayout(box.w, box.h, REGION_IDS), [box.w, box.h]);

  const setTarget = (id: string | null): void => {
    meta.setInfestTarget(id);
    audio.cue('ui');
    bump((n) => n + 1);
  };

  const focusDetail = focus ? view.sectorDetails[focus] : view.sectorDetails[view.feedsInto];
  const focusRegion = focusDetail ? regionOfSector(focusDetail.id) : undefined;

  return (
    <div className="inf-board panel" aria-label="Infestation map">
      <div className="liveops-head">
        <span className="liveops-k">⬢ INFESTATION MAP</span>
        <span className="inf-total">
          {Math.round(view.completion * 100)}% infested
          {view.saturatedCount > 0 && <i className="inf-sat"> · {view.saturatedCount} saturated</i>}
        </span>
      </div>

      <div className="inf-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="inf-canvas" aria-hidden />
        {/* A11y + click overlay — one button per cell, positioned from the shared layout. */}
        <div className="inf-cells" role="group" aria-label="Sectors">
          {overlay.cells.map((cell) => {
            const det = view.sectorDetails[cell.sectorId];
            const pinned = pinnedSectors.has(cell.sectorId);
            const isFeed = cell.sectorId === view.feedsInto;
            return (
              <button
                key={cell.sectorId}
                className={`inf-cell${pinned ? ' is-pinned' : ''}`}
                style={{ left: cell.cx - cell.r, top: cell.cy - cell.r, width: cell.r * 2, height: cell.r * 2 }}
                onClick={() => setTarget(view.target === cell.sectorId ? null : cell.sectorId)}
                onMouseEnter={() => setFocus(cell.sectorId)}
                onFocus={() => setFocus(cell.sectorId)}
                onMouseLeave={() => setFocus(null)}
                onBlur={() => setFocus(null)}
                title={`${det.name} — ${det.tier.name} ${Math.round(det.level)}/100${pinned ? ' · pinned' : isFeed ? ' · next feed' : ' · click to pin'}`}
                aria-label={`${det.name}, ${det.tier.name}, ${Math.round(det.level)} of 100${pinned ? ', pinned' : ''}`}
              />
            );
          })}
        </div>
        {/* Region name tags, positioned over each lobe. */}
        {overlay.regions.map((r) => {
          const def = REGIONS.find((x) => x.id === r.id)!;
          const rv = view.regions.find((x) => x.def.id === r.id)!;
          return (
            <div key={r.id} className={`inf-tag${rv.entrenched ? ' is-entrenched' : ''}`}
              style={{ left: r.label.x, top: r.label.y, ['--rc' as string]: def.accent }}>
              <span className="inf-tag-name">{def.name}</span>
              <span className="inf-tag-bonus">{rv.bonusNow}{rv.entrenched ? ' ⚡' : ''}</span>
            </div>
          );
        })}
      </div>

      {/* Detail line — the focused (or feed-target) sector's tier + decay forecast. */}
      {focusDetail && (
        <div className="inf-detail" style={{ ['--rc' as string]: focusRegion?.accent }}>
          <span className="inf-detail-name">{focusDetail.name}</span>
          <span className="inf-detail-tier">{focusDetail.tier.name} · {Math.round(focusDetail.level)}/100</span>
          <span className="inf-detail-fore">
            {focusDetail.saturated ? 'saturated — half decay' : focusDetail.level <= 0 ? 'dormant' : `empties in ${fmtDays(focusDetail.zeroInDays)}`}
          </span>
        </div>
      )}

      {/* Feed control — pin a region, or spread; the map shows exactly where points land. */}
      <div className="inf-controls" role="group" aria-label="Feed target">
        <span className="inf-controls-k">Feed</span>
        {REGIONS.map((r) => (
          <button key={r.id} className={`inf-chip${view.target === r.id ? ' on' : ''}`}
            style={{ ['--rc' as string]: r.accent }} onClick={() => setTarget(view.target === r.id ? null : r.id)}
            title={`Pin ${r.name} — runs feed its emptiest sector`}>
            {r.name.split(' ')[0]}
          </button>
        ))}
        <button className={`inf-chip inf-chip-spread${view.target === null ? ' on' : ''}`} onClick={() => setTarget(null)}
          title="Spread — runs feed the emptiest sector on the whole map">
          Spread
        </button>
      </div>
    </div>
  );
}
