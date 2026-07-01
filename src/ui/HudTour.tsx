// First-launch HUD Tour (docs/HELP.md) — a short guided walkthrough of the Hub, one area at a time,
// explaining ONLY the purpose of each (≤2 sentences). Runs once after the Combat Tutorial. On finish
// it grants the one-time Tutorial Bio-Container (fixed contents) — the player's first progression loop.
// Distinct from the Help wiki (a permanent manual) and never replayable as a "tutorial".

import { useState } from 'react';
import { meta } from '../state/meta';
import type { TutorialRewardSummary } from '../state/meta';
import { TutorialRewardReveal } from './tutorial/TutorialRewardReveal';

const TOUR: { area: string; purpose: string }[] = [
  { area: 'Top Resource Bar', purpose: 'Your permanent account currencies live here — Genome Cores, tower/hero shards, and Ascendant Cells.' },
  { area: 'Power Score', purpose: 'One number for your whole account’s strength. It climbs as you invest and drives your progress predictions.' },
  { area: 'Campaign', purpose: 'The main path — descend stage by stage. Depth unlocks your Star Cap, Hero Slots, and Prestige.' },
  { area: 'Infinite', purpose: 'Endless, escalating waves. Push for a personal best and farm the richest loot.' },
  { area: 'Evolution', purpose: 'Your permanent-progression HQ — buy Genome Core upgrades and, later, Prestige for a compounding multiplier.' },
  { area: 'Tower Lab', purpose: 'Upgrade towers with Stars and study each species’ Evolution Codex.' },
  { area: 'Hero Lab', purpose: 'Develop your heroes — stars, mastery, and which heroes you field each run.' },
  { area: 'Equipment', purpose: 'The Armory — gear each hero with a weapon, armor, and relic; reforge to perfect them.' },
  { area: 'Genetic Vault', purpose: 'Crack open the Bio-Containers your runs earn for equipment, shards, and crafting materials.' },
  { area: 'Collection', purpose: 'Your codex — every tower, enemy, boss, and Gene Card you have discovered.' },
  { area: 'Profile', purpose: 'Your lifetime stats, mastery ranks, achievements, and account records.' },
  { area: 'Settings', purpose: 'Audio, difficulty defaults, save management, and replaying this tour or the tutorial.' },
];

export function HudTour({ onClose }: { onClose: () => void }): JSX.Element {
  const [i, setI] = useState(0);
  const [reward, setReward] = useState<TutorialRewardSummary | null>(null);
  const [ended, setEnded] = useState(false);

  const finish = (): void => {
    const r = meta.completeHudTour(); // grants the container (idempotent); marks the tour done
    if (r) { setReward(r); setEnded(true); } else onClose();
  };

  if (ended) return reward ? <TutorialRewardReveal reward={reward} onClose={onClose} /> : <></>;

  const step = TOUR[i];
  const last = i === TOUR.length - 1;
  return (
    <div className="hudtour" role="dialog" aria-label="HUD Tour">
      <div className="hudtour-card">
        <div className="hudtour-step">Field Orientation · {i + 1} / {TOUR.length}</div>
        <h3 className="hudtour-area">{step.area}</h3>
        <p className="hudtour-purpose">{step.purpose}</p>
        <div className="hudtour-dots" aria-hidden>
          {TOUR.map((_, n) => <span key={n} className={`hudtour-dot ${n === i ? 'on' : n < i ? 'past' : ''}`} />)}
        </div>
        <div className="hudtour-btns">
          <button className="hudtour-skip" onClick={finish}>Skip</button>
          <button className="primary" onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Finish ▸' : 'Next ▸'}</button>
        </div>
      </div>
    </div>
  );
}
