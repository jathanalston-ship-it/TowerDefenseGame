// Doctrine picker (docs/DOCTRINES.md) — THE shared run-start commitment UI. Family-grouped
// doctrine cards with full readouts (build effects + world-warp lines), hazard diamonds priced
// at the selected difficulty, campaign LOCK SEALS (sealed cards stay visible — anticipation,
// not absence), and MASTERY RANK pips from the account ledgers. Every mode terminal renders
// this one component, so a new doctrine is pure data — no screen edits anywhere.

import { meta } from '../../state/meta';
import { DOCTRINES, DOCTRINE_IDS, DOCTRINE_RANK_NAMES, DOCTRINE_RANK_REWARD_STEP, doctrineNextRank, doctrineRank } from '../../core/doctrines';
import type { DoctrineDef, DoctrineFamily } from '../../core/doctrines';
import { hazardRating } from '../../core/difficultyDirector';
import { isDoctrineUnlocked, highestCampaignStage } from '../../save/derive';
import { audio } from '../../audio/sound';

/** Human-readable lines for a doctrine's full impact (effects + world warp). */
export function doctrineLines(d: DoctrineDef): string[] {
  const out: string[] = [];
  const w = d.warp ?? {};
  if (w.countMult) out.push(w.countMult > 1 ? `Spawns ×${w.countMult}` : `Spawns ×${w.countMult} (sparse)`);
  if (w.hpMult) out.push(`Enemy HP ×${w.hpMult}`);
  if (w.damageMult) out.push(`Enemy damage ×${w.damageMult}`);
  if (w.speedMult) out.push(`Enemy speed ×${w.speedMult}`);
  if (w.eliteChance) out.push(`${Math.round(w.eliteChance * 100)}% elite spawns`);
  if (w.scalingRateMult) out.push(`Scaling ×${w.scalingRateMult} faster`);
  if (w.bountyMult) out.push(w.bountyMult < 1 ? `Bounty ×${w.bountyMult} (drought)` : `Bounty ×${w.bountyMult}`);
  if (w.rewardMult) out.push(`Rewards ×${w.rewardMult}`);
  if (w.essencePerWave) out.push(`+${w.essencePerWave} Essence / wave`);
  for (const e of d.effects) {
    if (e.op !== 'mul' && e.op !== 'add') continue;
    const v = e.value;
    switch (e.field) {
      case 'towerDamageMult': out.push(`Tower damage ×${v}`); break;
      case 'towerFireRateMult': out.push(`Fire rate ×${v}`); break;
      case 'integrityMult': out.push(`Integrity ×${v}`); break;
      case 'integrityRegenPerWave': out.push(`+${v} integrity / wave`); break;
      case 'biomassMult': out.push(`Biomass ×${v}`); break;
      case 'heroDamageMult': out.push(`Hero damage ×${v}`); break;
      case 'heroCooldownMult': out.push(`Hero cooldowns ×${v}`); break;
      case 'damagePerTower': out.push(`+${Math.round(v * 100)}% dmg / tower`); break;
      case 'damagePerEmptySlot': out.push(`+${Math.round(v * 100)}% dmg / empty slot`); break;
      case 'reactionRepeats': out.push('Reactions chain +1'); break;
      case 'classResonanceBonus': out.push(`+${Math.round(v * 100)}% same-class dmg`); break;
      case 'diversityBonus': out.push(`+${Math.round(v * 100)}% dmg / class fielded`); break;
      default: break; // secondary tuning stays in the blurb
    }
  }
  return out;
}

const FAMILIES: { id: DoctrineFamily; label: string; hint: string }[] = [
  { id: 'build', label: 'BUILD DOCTRINES', hint: 'bend your math' },
  { id: 'pact', label: 'PACTS', hint: 'a sacrifice and a payoff' },
  { id: 'protocol', label: 'PROTOCOLS', hint: 'reshape the enemy world' },
];

export function DoctrinePicker({
  value,
  onChange,
  difficultyId,
  compact = false,
}: {
  value: string;
  onChange: (id: string) => void;
  difficultyId: string;
  /** Compact terminals (Command Center) render a tighter grid with 1-line readouts. */
  compact?: boolean;
}): JSX.Element {
  const save = meta.use();
  const stage = highestCampaignStage(save);
  const active = DOCTRINES[value] ?? DOCTRINES.none;

  const card = (d: DoctrineDef): JSX.Element => {
    const unlocked = isDoctrineUnlocked(save, d);
    const rank = doctrineRank(d.id, save.stats.doctrineWins[d.id] ?? 0, save.stats.doctrineBestWave[d.id] ?? 0);
    const next = doctrineNextRank(rank);
    const lines = doctrineLines(d);
    const on = d.id === value;
    const rankTitle = rank > 0
      ? `${DOCTRINE_RANK_NAMES[rank]} — +${Math.round(rank * DOCTRINE_RANK_REWARD_STEP * 100)}% run rewards with this doctrine${next ? ` (next: ${next.wins} wins or wave ${next.wave})` : ''}`
      : undefined;
    return (
      <button
        key={d.id}
        role="radio"
        aria-checked={on}
        disabled={!unlocked}
        className={`inf-doc${on ? ' on' : ''}${d.family === 'protocol' ? ' is-protocol' : ''}${d.family === 'pact' ? ' is-pact' : ''}${unlocked ? '' : ' is-locked'}`}
        onClick={() => { if (unlocked && !on) { audio.cue('ui'); onChange(d.id); } }}
        title={unlocked ? d.blurb : `Sealed — clear Campaign Stage ${d.unlockStage} (you are at ${stage})`}
      >
        <span className="inf-doc-top">
          <span className="inf-doc-name"><i className="doc-ico" aria-hidden>{d.icon}</i> {d.name}</span>
          {unlocked
            ? <i className="inf-doc-hz" title={`Hazard ${hazardRating(difficultyId, d)}/5 at this difficulty`}>{'◆'.repeat(hazardRating(difficultyId, d))}</i>
            : <i className="doc-lock" aria-hidden>⬡</i>}
        </span>
        {rank > 0 && unlocked && (
          <span className="doc-rank" title={rankTitle}>{'◈'.repeat(rank)}<i>{DOCTRINE_RANK_NAMES[rank]}</i></span>
        )}
        {!unlocked ? (
          <span className="inf-doc-fx"><i className="is-dim">Stage {d.unlockStage} · {Math.min(stage, d.unlockStage)}/{d.unlockStage}</i></span>
        ) : lines.length > 0 ? (
          <span className="inf-doc-fx">{lines.slice(0, compact ? 2 : 3).map((l) => <i key={l}>{l}</i>)}</span>
        ) : (
          <span className="inf-doc-fx"><i className="is-dim">{d.id === 'none' ? 'No commitment' : 'Build-shaping'}</i></span>
        )}
      </button>
    );
  };

  return (
    <div className={`doc-pick${compact ? ' is-compact' : ''}`}>
      <div className="inf-doctrines" role="radiogroup" aria-label="Doctrine">
        {card(DOCTRINES.none)}
        {FAMILIES.map((f) => {
          const members = DOCTRINE_IDS.filter((id) => id !== 'none' && DOCTRINES[id].family === f.id)
            .sort((a, b) => DOCTRINES[a].unlockStage - DOCTRINES[b].unlockStage);
          if (members.length === 0) return null;
          return [
            <span key={`h-${f.id}`} className="doc-fam-h" title={f.hint}>{f.label}</span>,
            ...members.map((id) => card(DOCTRINES[id])),
          ];
        })}
      </div>
      {active.id !== 'none' && !compact && (
        <div className="inf-doc-detail">
          <b>{active.icon} {active.name}</b> — {active.blurb}
        </div>
      )}
    </div>
  );
}
