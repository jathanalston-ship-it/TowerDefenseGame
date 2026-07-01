// Living-laboratory atmosphere for the headquarters — a subtle, GPU-cheap ambient layer
// behind the Hub: drifting bioluminescent light, slow DNA helices, floating spores,
// background "organisms", and a scanning hologram, plus a faint random organic SFX so the
// lab feels alive. Pure decoration: pointer-events:none, no gameplay, no JS render loop
// (all motion is CSS transforms/opacity), and fully stilled under prefers-reduced-motion.

import { useEffect, useMemo, type CSSProperties } from 'react';
import { audio } from '../audio/sound';
import { meta } from '../state/meta';
import { labState } from './homeBaseTiers';

interface Spore { left: number; size: number; dur: number; delay: number; drift: number; hue: string }

const HUES = ['var(--vital)', 'var(--viral)', 'var(--caustic)'];

/** Build a vertical double-helix as two sine strands + connecting rungs (drawn once). */
function buildHelix(w: number, h: number, turns: number, segs: number): { d1: string; d2: string; rungs: { x: number; y: number; x2: number }[] } {
  const cx = w / 2;
  const amp = w / 2 - 2;
  const p1: string[] = [];
  const p2: string[] = [];
  const rungs: { x: number; y: number; x2: number }[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = +(t * h).toFixed(1);
    const a = t * turns * Math.PI * 2;
    const x1 = +(cx + amp * Math.sin(a)).toFixed(1);
    const x2 = +(cx + amp * Math.sin(a + Math.PI)).toFixed(1);
    p1.push(`${i ? 'L' : 'M'}${x1} ${y}`);
    p2.push(`${i ? 'L' : 'M'}${x2} ${y}`);
    if (i % 2 === 0) rungs.push({ x: x1, y, x2 });
  }
  return { d1: p1.join(' '), d2: p2.join(' '), rungs };
}

function Dna({ className, color }: { className: string; color: string }): JSX.Element {
  const { d1, d2, rungs } = useMemo(() => buildHelix(40, 300, 3, 60), []);
  return (
    <svg className={`lab-dna ${className}`} viewBox="0 0 40 300" aria-hidden preserveAspectRatio="none">
      <path d={d1} stroke={color} fill="none" strokeWidth="1.4" />
      <path d={d2} stroke={color} fill="none" strokeWidth="1.4" />
      {rungs.map((r, i) => <line key={i} x1={r.x} y1={r.y} x2={r.x2} y2={r.y} stroke={color} strokeWidth="0.7" />)}
    </svg>
  );
}

export function LabAtmosphere(): JSX.Element {
  // The lab EVOLVES with the account (docs/HOME-BASE.md): denser life + more equipment as the
  // development score climbs. Pure read of the save; updates whenever progression changes.
  const save = meta.use();
  const lab = labState(save);
  const sporeCount = Math.round(10 + lab.intensity * 18); // 12 (nascent) → 28 (ascendant)

  const spores = useMemo<Spore[]>(
    () =>
      Array.from({ length: sporeCount }, (_, i) => ({
        left: (i * 53 + 7) % 100,
        size: 2 + ((i * 7) % 5),
        dur: 16 + ((i * 11) % 16),
        delay: -((i * 13) % 22),
        drift: ((i % 5) - 2) * 18,
        hue: HUES[i % HUES.length],
      })),
    [sporeCount],
  );

  // Faint, infrequent organic SFX — "the lab breathing". Naturally silent when sound is off
  // (master gain is muted) or before the first user gesture resumes the audio context.
  useEffect(() => {
    const tags = ['br_spore', 'br_plague', 'br_acid', 'dissolve'];
    let alive = true;
    let timer = window.setTimeout(fire, 9000 + Math.random() * 9000);
    function fire(): void {
      if (!alive) return;
      try {
        if (localStorage.getItem('audioOn') !== 'false') audio.cue(tags[Math.floor(Math.random() * tags.length)]);
      } catch { /* private mode */ }
      timer = window.setTimeout(fire, 15000 + Math.random() * 17000);
    }
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // Parallax camera drift: the pointer eases two CSS vars (rAF-throttled); depth layers
  // translate by different factors. Disabled under prefers-reduced-motion.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const el = document.querySelector<HTMLElement>('.lab-atmos');
    if (!el) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: PointerEvent): void => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = (): void => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      el.style.setProperty('--plx-x', cx.toFixed(4));
      el.style.setProperty('--plx-y', cy.toFixed(4));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div
      className="lab-atmos"
      aria-hidden
      data-lab-era={lab.era}
      style={{ ['--lab-intensity' as string]: lab.intensity } as CSSProperties}
    >
      {/* Progression-driven equipment — each fixture materializes once the account passes its
          development threshold (homeBaseTiers). A late-game lab is unrecognizably richer. */}
      {lab.fixtures.length > 0 && (
        <div className="lab-fixtures">
          {lab.fixtures.map((id) => <div key={id} className={`lab-fix fix-${id}`} />)}
        </div>
      )}
      <div className="lab-fog">
        <div className="lab-fog-a" />
        <div className="lab-fog-b" />
      </div>
      <svg className="lab-veins" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <path className="lab-vein v1" d="M-20,860 C240,780 180,560 420,520 S760,600 940,470 S1380,420 1650,330" />
        <path className="lab-vein v2" d="M-30,120 C220,180 420,60 660,140 S1080,90 1300,200 S1560,260 1660,220" />
        <path className="lab-vein v3" d="M120,940 C180,700 60,520 220,360 S420,180 380,-40" />
      </svg>
      <div className="lab-drift">
        <div className="lab-cell lab-cell-a" />
        <div className="lab-cell lab-cell-b" />
        <div className="lab-glow lab-glow-a" />
        <div className="lab-glow lab-glow-b" />
        <div className="lab-glow lab-glow-c" />
        <Dna className="lab-dna-l" color="var(--vital)" />
        <Dna className="lab-dna-r" color="var(--viral)" />
        <div className="lab-spores">
          {spores.map((s, i) => (
            <span
              key={i}
              className="lab-spore"
              style={{
                left: `${s.left}%`,
                width: s.size,
                height: s.size,
                background: s.hue,
                boxShadow: `0 0 6px ${s.hue}`,
                ['--dur' as string]: `${s.dur}s`,
                ['--delay' as string]: `${s.delay}s`,
                ['--drift' as string]: `${s.drift}px`,
              }}
            />
          ))}
        </div>
        <div className="lab-scan" />
      </div>
    </div>
  );
}
