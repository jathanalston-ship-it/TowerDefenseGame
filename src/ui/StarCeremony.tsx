// Star upgrade CEREMONY — the mutation moment when a tower gains a star. Instead of incrementing a
// number, it plays a staged sequence: the portrait pops, the new star fills into the pip track, the
// newly unlocked evolution is revealed, the next unlock is previewed, and milestone stars
// (3/5/7/10★) earn a celebratory banner. Dismissible at any time. Pure presentation — the star was
// already bought/persisted upstream; this only choreographs the reveal.

import type { StepView } from './towerLabModel';
import type { TowerKind } from '../core/types';
import { TowerPortrait } from './TowerPortrait';

const MILESTONE_LABEL: Record<number, string> = {
  3: 'Specialized',
  5: 'Fully Evolved',
  7: 'Ascendant',
  10: 'Apex Organism',
};

export function StarCeremony({
  name,
  color,
  toStar,
  maxStars,
  unlocked,
  next,
  milestoneStar,
  onClose,
  kind,
}: {
  name: string;
  color: string;
  toStar: number;
  maxStars: number;
  kind?: TowerKind; // drives the portrait's per-tower identity organs (battlefield ↔ lab parity)
  unlocked: StepView | null; // the evolution this star granted (null past the ★5 evolution band)
  next: StepView | null; // what the next star will bring
  milestoneStar: number | null; // 3 | 5 | 7 | 10 if this upgrade hit a milestone, else null
  onClose: () => void;
}): JSX.Element {
  const isMilestone = milestoneStar != null;
  return (
    <div className="tl-ceremony-backdrop" onClick={onClose}>
      <div
        className={`tl-ceremony${isMilestone ? ' is-milestone' : ''}`}
        style={{ ['--tw' as string]: color }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tl-cer-eyebrow">{isMilestone ? 'MILESTONE REACHED' : 'MUTATION COMPLETE'}</div>
        <div className="tl-cer-name" style={{ color }}>{name}</div>

        <div className="tl-cer-portrait">
          <TowerPortrait color={color} stars={toStar} size={150} kind={kind} />
          {isMilestone && <div className="tl-cer-burst" aria-hidden />}
        </div>

        {/* the star fills into the track */}
        <div className="tl-cer-pips" aria-label={`${toStar} of ${maxStars} stars`}>
          {Array.from({ length: maxStars }, (_, i) => (
            <span
              key={i}
              className={`tl-cer-pip${i < toStar ? ' on' : ''}${i === toStar - 1 ? ' is-new' : ''}`}
              style={i < toStar ? { color } : undefined}
            >
              ★
            </span>
          ))}
        </div>
        <div className="tl-cer-level" style={{ color }}>★{toStar}</div>

        {isMilestone && (
          <div className="tl-cer-milestone" style={{ color }}>
            {MILESTONE_LABEL[milestoneStar as number] ?? `★${milestoneStar}`}
          </div>
        )}

        {/* newly unlocked evolution */}
        <div className="tl-cer-unlock">
          <div className="tl-cer-tag">{unlocked ? 'NEW EVOLUTION' : 'POWER ASCENSION'}</div>
          <div className="tl-cer-unlock-name">{unlocked ? unlocked.name : `Ascension ★${toStar}`}</div>
          <div className="tl-cer-unlock-desc">
            {unlocked ? unlocked.desc : 'Raw power surges through the organism — sharper, faster, deadlier.'}
          </div>
        </div>

        {/* what's coming next */}
        {next && (
          <div className="tl-cer-next">
            <span className="tl-cer-next-k">Coming next · ★{next.star}</span>
            <span className="tl-cer-next-name">{next.name}</span>
          </div>
        )}

        <button type="button" className="primary tl-cer-continue" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
