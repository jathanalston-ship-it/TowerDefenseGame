// Mastery Evolution Track — the HELIX panel (docs/MASTERY.md §evolution track). Deliberately
// NOT a battle-pass card row: the track renders as a scrollable double-helix genome in the
// unit's own color — minors are vertebrae riding the strands, majors are the crossover ganglia
// (the strands intersect exactly on the 10s), progress is the assimilated (recolored) span, and
// a pulsing read-head marks the live locus. Claiming banks every reached node in one tap;
// a completed loop offers EVOLVE (prestige — the helix reforms, mastery level never regresses).
// Shared by TowerLab and HeroLab; all data comes from evolutionTrackModel (pure).

import { useEffect, useMemo, useRef } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import type { EvolutionSubject } from '../core/masteryEvolution';
import { evolutionPanelModel } from './evolutionTrackModel';

// Geometry: 11px per track level; strand period 20 levels → crossovers land exactly on the
// majors (every 10th level). Paths are static — only node states and the clip width change.
const PX = 11;
const PAD = 26;
const W = PAD * 2 + 100 * PX;
const H = 108;
const MID = 54;
const AMP = 30;
const xOf = (l: number): number => PAD + l * PX;
const yA = (l: number): number => MID - AMP * Math.sin((Math.PI * l) / 10);
const yB = (l: number): number => MID + AMP * Math.sin((Math.PI * l) / 10);

function strandPath(y: (l: number) => number): string {
  let d = `M ${xOf(0)} ${y(0).toFixed(1)}`;
  for (let l = 0.5; l <= 100; l += 0.5) d += ` L ${xOf(l).toFixed(1)} ${y(l).toFixed(1)}`;
  return d;
}
const STRAND_A = strandPath(yA);
const STRAND_B = strandPath(yB);
// Base-pair rungs on the odd levels only — never on a crossover, where the strands touch.
const RUNGS = Array.from({ length: 50 }, (_, i) => 1 + i * 2);
const DECADES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function EvolutionTrackPanel({ subject, unit, name, color }: {
  subject: EvolutionSubject;
  unit: string;
  name: string;
  color: string;
}): JSX.Element {
  const save = meta.use();
  const m = useMemo(() => evolutionPanelModel(save, subject, unit), [save, subject, unit]);
  const railRef = useRef<HTMLDivElement>(null);
  const clipId = `met-clip-${subject}-${unit}`;

  // Keep the read-head in view — the genome is wider than the panel; center the live locus.
  useEffect(() => {
    const el = railRef.current;
    if (el) el.scrollLeft = Math.max(0, xOf(m.trackLevel) - el.clientWidth * 0.45);
  }, [m.trackLevel, m.prestige, subject, unit]);

  const claim = (): void => {
    audio.resume();
    const majors = m.claimableMajors; // captured pre-claim: were any of the paid nodes majors?
    if (meta.claimMasteryEvolution(subject, unit) > 0) audio.cue(majors > 0 ? 'levelup' : 'mastery');
  };
  const evolve = (): void => {
    audio.resume();
    if (meta.prestigeMasteryEvolution(subject, unit)) audio.cue('promotion');
  };

  return (
    <div className="met-panel" style={{ ['--tw' as string]: color }}>
      <div className="met-head">
        <span className="met-eyebrow">Evolution Track · {name} Helix</span>
        <span
          className="met-prestige"
          style={{ borderColor: `color-mix(in srgb, ${color} ${Math.min(90, 35 + m.prestige * 15)}%, var(--line))` }}
          title={`Prestige ${m.prestige + 1} — loop ${m.prestige + 1} of this organism's endless track`}
        >
          ⧉ P{m.prestige + 1}
        </span>
      </div>
      <div className="met-vitals">
        <span className="met-loop"><b style={{ color }}>Lv {m.trackLevel}</b> / 100 this loop</span>
        <span>Lifetime Mastery <b>{m.masteryLevel}</b></span>
        <span>{m.completionPct}% assimilated</span>
        {m.claimable > 0 && <span className="met-due">{m.claimable} node{m.claimable > 1 ? 's' : ''} ready</span>}
      </div>

      <div className="met-rail" ref={railRef} key={m.prestige}>
        <svg
          className="met-helix"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${name} evolution track — level ${m.trackLevel} of 100, ${m.claimable} rewards ready to claim`}
        >
          <defs>
            <clipPath id={clipId}><rect x="0" y="0" width={xOf(m.trackLevel)} height={H} /></clipPath>
          </defs>
          {RUNGS.map((l) => <line key={l} className="met-rung" x1={xOf(l)} y1={yA(l)} x2={xOf(l)} y2={yB(l)} />)}
          <path className="met-strand" d={STRAND_A} />
          <path className="met-strand" d={STRAND_B} />
          {/* the assimilated span — the same genome, recolored up to the read-head */}
          <g clipPath={`url(#${clipId})`}>
            {RUNGS.map((l) => <line key={l} className="met-rung on" x1={xOf(l)} y1={yA(l)} x2={xOf(l)} y2={yB(l)} />)}
            <path className="met-strand on" d={STRAND_A} />
            <path className="met-strand on" d={STRAND_B} />
          </g>
          <line className="met-headline" x1={xOf(m.trackLevel)} y1={8} x2={xOf(m.trackLevel)} y2={H - 18} />
          <circle className="met-headdot" cx={xOf(m.trackLevel)} cy={MID} r={4} />
          {m.nodes.map((n, i) => {
            const cx = xOf(n.level);
            const cy = n.major ? MID : i % 2 === 0 ? yA(n.level) : yB(n.level);
            return (
              <g
                key={n.level}
                className={`met-node is-${n.state}${n.major ? ' is-major' : ''}`}
                onClick={n.state === 'ready' ? claim : undefined}
              >
                <title>
                  {`Lv ${n.level}${n.major ? ' · MILESTONE' : ''} — ${n.label}${n.state === 'claimed' ? ' (claimed)' : n.state === 'ready' ? ' (ready to claim)' : ''}`}
                </title>
                {n.state === 'ready' && <circle className="met-halo" cx={cx} cy={cy} r={(n.major ? 8.5 : 5) + 5} />}
                <circle className="met-core" cx={cx} cy={cy} r={n.major ? 8.5 : 5} />
                {n.major && <circle className="met-gang" cx={cx} cy={cy} r={12} />}
              </g>
            );
          })}
          {DECADES.map((l) => <text key={l} className="met-lvl" x={xOf(l)} y={H - 4} textAnchor="middle">{l}</text>)}
        </svg>
      </div>

      <div className="met-console">
        <span className="met-next">
          {m.next
            ? <>Next node · <b style={{ color }}>Lv {m.next.level}</b> ({m.next.toGo} to go{m.next.major ? ' · milestone' : ''}) — {m.next.label}</>
            : <>Loop complete — the organism is ready to <b style={{ color }}>EVOLVE</b>.</>}
        </span>
        <div className="met-actions">
          <button className={`met-claim${m.claimable > 0 ? ' is-due' : ''}`} disabled={m.claimable === 0} onClick={claim}>
            {m.claimable > 0 ? `Claim ${m.claimable} node${m.claimable > 1 ? 's' : ''}` : 'Nothing to claim'}
          </button>
          {m.canPrestige && (
            <button
              className="met-evolve"
              onClick={evolve}
              title="Banks anything unclaimed, then reforms the helix with an upgraded pool — mastery level never decreases."
            >
              ⧉ EVOLVE → P{m.prestige + 2}
            </button>
          )}
        </div>
      </div>
      <span className="met-foot">
        {m.shardFree
          ? 'Deep loop — shards are retired: this pool pays alternate progression (cores, essence, materials, containers, rare Ichor) and grows every loop.'
          : `First loop — this helix carries ${name}'s own shards: a full track funds several stars.`}
      </span>
    </div>
  );
}
