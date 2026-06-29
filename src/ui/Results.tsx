import { useState } from 'react';
import type { RunOutcome, RunResult } from '../state/meta';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { rarityRegistry } from '../core/loot';
import { masteryRewardById } from '../core/mastery';
import { RewardSequence } from './RewardSequence';
import type { RewardLine } from './RewardSequence';
import { BiomassIcon, ShardIcon } from './components/Icon';
import { ACCOUNT_CURRENCY } from '../core/currencies';

export function Results({
  result,
  outcome,
  onContinue,
}: {
  result: RunResult;
  outcome: RunOutcome;
  onContinue: () => void;
}): JSX.Element {
  const masteryGains = TOWER_ORDER.filter((k) => outcome.mastery[k].xpGained > 0);
  const heroMasteryGains = HERO_ORDER.filter((k) => outcome.heroMastery[k].xpGained > 0);
  const [done, setDone] = useState(false);

  // Headline mastery number = total XP banked this run (tower + hero); the
  // per-kind breakdown still renders below once the sequence finishes.
  const masteryXp =
    TOWER_ORDER.reduce((s, k) => s + outcome.mastery[k].xpGained, 0) +
    HERO_ORDER.reduce((s, k) => s + outcome.heroMastery[k].xpGained, 0);

  // Data-driven reward lines — surface a new run-end reward by adding one entry.
  const lines: RewardLine[] = [
    {
      id: 'wave',
      label: result.endless ? 'Depth Reached' : 'Wave Reached',
      value: result.wave,
      note: outcome.reward.newBest ? 'New best!' : undefined,
      accent: outcome.reward.newBest ? 'var(--caustic)' : undefined,
    },
    { id: 'kills', label: 'Enemies Killed', value: result.kills },
    { id: 'biomass', label: 'Biomass Earned', value: Math.round(result.stats.biomassEarned), icon: <BiomassIcon /> },
    { id: 'cards', label: 'Cards Collected', value: result.stats.cardIds.length },
    { id: 'mastery', label: 'Mastery Earned', value: masteryXp, format: (n) => `${n.toLocaleString()} XP` },
    { id: 'shards', label: `${ACCOUNT_CURRENCY.name} Earned`, value: outcome.reward.shardsEarned, icon: <ShardIcon />, accent: 'var(--gold)' },
    { id: 'lootbox', label: 'Containers Banked', value: outcome.loot.banked.length },
  ];

  return (
    <div className="menu" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className={`result-big ${result.won ? 'win' : 'lose'}`}>
        {result.endless
          ? `DEPTH ${result.wave} REACHED`
          : result.won
            ? 'EXTRACTION COMPLETE'
            : 'NUCLEUS LOST'}
      </div>

      <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
        <RewardSequence lines={lines} onDone={() => setDone(true)} />
      </div>

      {/* Achievements earned this run surface here — inline, AFTER the reward sequence — so a
          milestone never floats over the statistics mid-tally. The toaster is suppressed off-menu. */}
      {done && outcome.achievements.length > 0 && (
        <div className="panel achv-earned" style={{ width: 'min(480px, 92vw)' }}>
          <div className="panel-title">Achievements Unlocked</div>
          <div className="ae-list">
            {outcome.achievements.map((a) => (
              <div className="ae-row" key={a.id}>
                <span className="ae-icon" aria-hidden>{a.name.charAt(0).toUpperCase()}</span>
                <span className="ae-body">
                  <span className="ae-name">{a.name}</span>
                  <span className="ae-desc">{a.desc}</span>
                </span>
                {a.reward ? (
                  <span className="ae-reward"><ShardIcon /> +{a.reward}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {done && (() => {
        // All loot — the run-end cache AND any loot-queue containers — banks UNOPENED into the
        // Genetic Vault. Show the count + the box now filling and the pre-determined next.
        const front = rarityRegistry.get(outcome.loot.queue.queue[0]);
        const next = rarityRegistry.get(outcome.loot.queue.queue[1]);
        const banked = outcome.loot.banked.length;
        return (
          <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
            <div className="panel-title">Genetic Vault</div>
            <div style={{ margin: '4px 0 10px', fontSize: 14 }}>
              <b style={{ color: 'var(--gold)' }}>{banked}</b> bio-container{banked > 1 ? 's' : ''} banked
              (incl. your run cache) — crack {banked > 1 ? 'them' : 'it'} open in the <b>Genetic Vault</b>.
            </div>
            <div className="loot-queue-line">
              Now filling <b style={{ color: front?.color }}>{front?.name ?? 'Common'}</b>
              {next && (
                <>
                  {' · next '}
                  <b style={{ color: next.color }}>{next.name}</b>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {done && (outcome.masteryUnlocks.titles.length > 0 || outcome.masteryUnlocks.lore.length > 0) && (
        <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
          <div className="panel-title">Mastery Unlocked</div>
          <div className="mastery-unlocks">
            {outcome.masteryUnlocks.titles.map((id) => (
              <div className="mu-row" key={id}>
                <span className="mu-kind mu-title">Title</span>
                <span className="mu-name">{masteryRewardById(id)?.name ?? id}</span>
              </div>
            ))}
            {outcome.masteryUnlocks.lore.map((id) => (
              <div className="mu-row" key={id}>
                <span className="mu-kind mu-lore">Lore</span>
                <span className="mu-name">{masteryRewardById(id)?.name ?? id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {done && masteryGains.length > 0 && (
        <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
          <div className="panel-title">Tower Mastery Gained</div>
          <div className="mastery-gains">
            {masteryGains.map((k) => {
              const m = outcome.mastery[k];
              const leveled = m.toLevel > m.fromLevel;
              return (
                <div className="mastery-gain" key={k}>
                  <span className="mg-name" style={{ color: TOWER_DEFS[k].color }}>
                    {TOWER_DEFS[k].name}
                  </span>
                  <span className="mg-xp">+{m.xpGained} XP</span>
                  <span className={`mg-lvl ${leveled ? 'is-up' : ''}`}>
                    {leveled ? `Lv ${m.fromLevel} → ${m.toLevel}` : `Lv ${m.toLevel}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {done && heroMasteryGains.length > 0 && (
        <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
          <div className="panel-title">Hero Mastery Gained</div>
          <div className="mastery-gains">
            {heroMasteryGains.map((k) => {
              const m = outcome.heroMastery[k];
              const leveled = m.toLevel > m.fromLevel;
              return (
                <div className="mastery-gain" key={k}>
                  <span className="mg-name" style={{ color: HERO_DEFS[k].color }}>
                    {HERO_DEFS[k].name}
                  </span>
                  <span className="mg-xp">+{m.xpGained} XP</span>
                  <span className={`mg-lvl ${leveled ? 'is-up' : ''}`}>
                    {leveled ? `Lv ${m.fromLevel} → ${m.toLevel}` : `Lv ${m.toLevel}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {done && (
        <button className="primary" onClick={onContinue}>
          Continue
        </button>
      )}
    </div>
  );
}
