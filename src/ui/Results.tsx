import { useState } from 'react';
import type { RunOutcome, RunResult } from '../state/meta';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { rarityRegistry } from '../core/loot';
import { masteryRewardById } from '../core/mastery';
import { itemDef } from '../core/equipment';
import { LootReveal } from './LootReveal';
import { RewardSequence } from './RewardSequence';
import type { RewardLine } from './RewardSequence';
import { BiomassIcon, ShardIcon } from './components/Icon';

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
    { id: 'shards', label: 'Shards Earned', value: outcome.reward.shardsEarned, icon: <ShardIcon />, accent: 'var(--gold)' },
    { id: 'lootbox', label: 'Loot Boxes Earned', value: outcome.chest ? 1 : 0 },
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

      {done && (
        <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
          <LootReveal chest={outcome.chest} />
        </div>
      )}

      {done && (() => {
        // Loot queue: any boxes the run's banked progress completed, then the box now
        // filling + the pre-determined next (anticipation carries into the next run).
        const front = rarityRegistry.get(outcome.loot.queue.queue[0]);
        const next = rarityRegistry.get(outcome.loot.queue.queue[1]);
        return (
          <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
            <div className="panel-title">Loot Queue</div>
            {outcome.loot.awarded.map((a, i) => {
              const def = rarityRegistry.get(a.rarity);
              return <LootReveal key={i} chest={a.chest} title={`${def?.name ?? a.rarity} Box`} color={def?.color} />;
            })}
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

      {done && (() => {
        const def = itemDef(outcome.gear.defId);
        if (!def) return null;
        const tone =
          outcome.gear.rarity === 'exotic'
            ? 'var(--viral)'
            : outcome.gear.rarity === 'legendary'
              ? 'var(--r-legendary)'
              : outcome.gear.rarity === 'epic'
                ? 'var(--r-epic)'
                : outcome.gear.rarity === 'rare'
                  ? 'var(--r-rare)'
                  : 'var(--r-common)';
        return (
          <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
            <div className="panel-title">Gear Drop</div>
            <div className="gear-drop">
              <span className="equip-dot" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }} />
              <span className="gear-drop-info">
                <span style={{ color: tone, fontWeight: 700 }}>
                  {def.name} <span style={{ textTransform: 'uppercase', fontSize: 10 }}>{outcome.gear.rarity}</span>
                </span>
                <span className="equip-desc">{def.desc}</span>
              </span>
            </div>
          </div>
        );
      })()}

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
