import { useState } from 'react';
import { meta } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { rarityRank, rarityRegistry } from '../core/loot';
import { masteryRewardById } from '../core/mastery';
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

      {done && (() => {
        // Full breakdown of what banked into the Genetic Vault this run — loot boxes grouped by
        // rarity (rarest first) plus the guaranteed run cache, with totals. Everything's on the
        // Summary so the player instantly sees what they earned — no drilling into a menu.
        const lootCounts = new Map<string, number>();
        let cacheCount = 0;
        for (const c of outcome.loot.banked) {
          if (c.kind === 'cache') cacheCount++;
          else lootCounts.set(c.rarity, (lootCounts.get(c.rarity) ?? 0) + 1);
        }
        const rows = rarityRegistry
          .ids()
          .filter((id) => lootCounts.has(id))
          .sort((a, b) => rarityRank(b) - rarityRank(a)) // rarest first
          .map((id) => {
            const def = rarityRegistry.get(id);
            return { key: id, name: def?.name ?? id, color: def?.color ?? 'var(--r-common)', n: lootCounts.get(id) as number };
          });
        if (cacheCount > 0) rows.push({ key: 'cache', name: 'Run Cache', color: 'var(--gold)', n: cacheCount });

        const earned = outcome.loot.banked.length;
        const owned = meta.pendingContainers().length;
        const front = rarityRegistry.get(outcome.loot.queue.queue[0]);
        const next = rarityRegistry.get(outcome.loot.queue.queue[1]);

        return (
          <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
            <div className="panel-title">Genetic Vault</div>
            {earned === 0 ? (
              <div className="vault-empty">No bio-containers banked this run — push deeper to fill the loot meter.</div>
            ) : (
              <>
                <div className="vault-earned-k">Bio-Containers Earned</div>
                <div className="vault-earned">
                  {rows.map((r) => (
                    <div className="ve-row" key={r.key} style={{ borderLeftColor: r.color }}>
                      <span className="ve-icon" style={{ color: r.color }}>◈</span>
                      <span className="ve-name" style={{ color: r.color }}>{r.name}</span>
                      <span className="ve-count">×{r.n}</span>
                    </div>
                  ))}
                </div>
                <div className="vault-totals">
                  <span>Total earned <b>{earned}</b></span>
                  <span>Now owned <b style={{ color: 'var(--gold)' }}>{owned}</b></span>
                </div>
              </>
            )}
            <div className="loot-queue-line" style={{ marginTop: 10 }}>
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
