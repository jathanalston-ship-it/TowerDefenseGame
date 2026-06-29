// End-of-Run reward presentation. Reads the already-decided RunOutcome and stages it as a paced,
// categorized "progression capsule" (see RewardReveal): Combat Report → Progression → Resources →
// Bio-Containers → Discoveries, each animating in one at a time, then achievements spotlight after.
// This file is the DATA layer — it turns the outcome into RewardCategory[] (add a progression system
// = add one category here); RewardReveal owns the pacing, animation, and player controls.

import { meta } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import { ENEMY_DEFS, HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import type { EnemyKind } from '../core/types';
import { rarityRank, rarityRegistry } from '../core/loot';
import { masteryRewardById } from '../core/mastery';
import { RewardReveal } from './RewardReveal';
import type { AchievementItem, RewardCategory, RewardStat } from './RewardReveal';
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

  const masteryXp =
    TOWER_ORDER.reduce((s, k) => s + outcome.mastery[k].xpGained, 0) +
    HERO_ORDER.reduce((s, k) => s + outcome.heroMastery[k].xpGained, 0);
  const levelUps =
    TOWER_ORDER.reduce((s, k) => s + Math.max(0, outcome.mastery[k].toLevel - outcome.mastery[k].fromLevel), 0) +
    HERO_ORDER.reduce((s, k) => s + Math.max(0, outcome.heroMastery[k].toLevel - outcome.heroMastery[k].fromLevel), 0);

  // Highest Threat = the toughest enemy (by base HP) the player actually put down this run.
  let threat: { name: string; color: string } | null = null;
  let threatHp = -1;
  for (const [k, n] of Object.entries(result.stats.killsByEnemy)) {
    if (n <= 0) continue;
    const d = ENEMY_DEFS[k as EnemyKind];
    if (d && d.hp > threatHp) { threatHp = d.hp; threat = { name: d.name, color: d.color }; }
  }

  // Bio-containers banked this run, grouped by rarity (rarest first) + the guaranteed run cache.
  const lootCounts = new Map<string, number>();
  let cacheCount = 0;
  for (const c of outcome.loot.banked) {
    if (c.kind === 'cache') cacheCount++;
    else lootCounts.set(c.rarity, (lootCounts.get(c.rarity) ?? 0) + 1);
  }
  const containerRows = rarityRegistry
    .ids()
    .filter((id) => lootCounts.has(id))
    .sort((a, b) => rarityRank(b) - rarityRank(a))
    .map((id) => {
      const def = rarityRegistry.get(id);
      return { key: id, name: def?.name ?? id, color: def?.color ?? 'var(--r-common)', n: lootCounts.get(id) as number, glyph: '◈', cache: false };
    });
  if (cacheCount > 0) containerRows.push({ key: 'cache', name: 'Run Cache', color: 'var(--cache)', n: cacheCount, glyph: '⬢', cache: true });
  const earned = outcome.loot.banked.length;
  const lootBoxes = earned - cacheCount; // loot-queue boxes only (excludes the guaranteed cache)
  const owned = meta.pendingContainers().length;
  const front = rarityRegistry.get(outcome.loot.queue.queue[0]);
  const next = rarityRegistry.get(outcome.loot.queue.queue[1]);

  const newMasteries = outcome.masteryUnlocks.titles.length + outcome.masteryUnlocks.lore.length;

  const num = (n: number): string => Math.round(n).toLocaleString();

  // ── Build the categories (data-driven; only rows with data render, so this scales cleanly) ──
  const categories: RewardCategory[] = [];

  // 1 — COMBAT REPORT
  const combatStats: RewardStat[] = [
    {
      id: 'wave',
      label: result.endless ? 'Depth Reached' : 'Wave Reached',
      value: result.wave,
      note: outcome.reward.newBest ? 'NEW BEST' : undefined,
      accent: outcome.reward.newBest ? 'var(--caustic)' : undefined,
      celebrate: outcome.reward.newBest,
    },
    { id: 'kills', label: 'Enemies Eliminated', value: result.kills },
    { id: 'damage', label: 'Damage Dealt', value: Math.round(result.stats.damageDealt) },
  ];
  categories.push({
    id: 'combat',
    title: 'Combat Report',
    icon: '◎',
    accent: 'var(--danger)',
    summary: `${result.won ? 'Victory' : 'Defeat'} · ${num(result.kills)} eliminated`,
    stats: combatStats,
    extra: threat ? (
      <div className="rr-line">
        <span>Highest Threat</span>
        <b style={{ color: threat.color }}>{threat.name}</b>
      </div>
    ) : undefined,
  });

  // 2 — PROGRESSION
  categories.push({
    id: 'progression',
    title: 'Progression',
    icon: '✦',
    accent: 'var(--gold)',
    summary: masteryXp > 0 ? `+${num(masteryXp)} XP${levelUps > 0 ? ` · ${levelUps} level-up${levelUps > 1 ? 's' : ''}` : ''}` : 'No mastery gained',
    stats: [
      { id: 'xp', label: 'Mastery XP Earned', value: masteryXp, format: (n) => `${n.toLocaleString()} XP`, accent: 'var(--gold)', bar: masteryXp > 0 ? 1 : 0 },
      { id: 'levels', label: 'Mastery Levels', value: levelUps, celebrate: levelUps > 0 },
    ],
    extra: (masteryGains.length > 0 || heroMasteryGains.length > 0) ? (
      <div className="mastery-gains">
        {masteryGains.map((k) => {
          const m = outcome.mastery[k];
          const leveled = m.toLevel > m.fromLevel;
          return (
            <div className="mastery-gain" key={`t-${k}`}>
              <span className="mg-name" style={{ color: TOWER_DEFS[k].color }}>{TOWER_DEFS[k].name}</span>
              <span className="mg-xp">+{m.xpGained} XP</span>
              <span className={`mg-lvl ${leveled ? 'is-up' : ''}`}>{leveled ? `Lv ${m.fromLevel} → ${m.toLevel}` : `Lv ${m.toLevel}`}</span>
            </div>
          );
        })}
        {heroMasteryGains.map((k) => {
          const m = outcome.heroMastery[k];
          const leveled = m.toLevel > m.fromLevel;
          return (
            <div className="mastery-gain" key={`h-${k}`}>
              <span className="mg-name" style={{ color: HERO_DEFS[k].color }}>{HERO_DEFS[k].name}</span>
              <span className="mg-xp">+{m.xpGained} XP</span>
              <span className={`mg-lvl ${leveled ? 'is-up' : ''}`}>{leveled ? `Lv ${m.fromLevel} → ${m.toLevel}` : `Lv ${m.toLevel}`}</span>
            </div>
          );
        })}
      </div>
    ) : undefined,
  });

  // 3 — RESOURCES
  categories.push({
    id: 'resources',
    title: 'Resources',
    icon: '◆',
    accent: 'var(--caustic)',
    summary: `+${num(result.stats.biomassEarned)} biomass · +${num(outcome.reward.shardsEarned)} ${ACCOUNT_CURRENCY.name}`,
    stats: [
      { id: 'biomass', label: 'Biomass Earned', value: Math.round(result.stats.biomassEarned), icon: <BiomassIcon />, accent: 'var(--caustic)' },
      { id: 'shards', label: `${ACCOUNT_CURRENCY.name} Earned`, value: outcome.reward.shardsEarned, icon: <ShardIcon />, accent: 'var(--gold)' },
    ],
  });

  // 4 — BIO-CONTAINERS
  categories.push({
    id: 'containers',
    title: 'Bio-Containers',
    icon: '◈',
    accent: 'var(--r-legendary)',
    summary: earned > 0 ? `${earned} recovered · ${owned} in vault` : 'None this run',
    stats: [
      { id: 'recovered', label: 'Containers Recovered', value: earned },
      { id: 'vault', label: 'Now in Vault', value: owned, accent: 'var(--gold)', celebrate: earned > 0 },
    ],
    extra: (
      <>
        {earned > 0 ? (
          <>
            <div className="vault-earned">
              {containerRows.map((r, i) => (
                <div className={`ve-row${r.cache ? ' is-cache' : ''}`} key={r.key} style={{ borderLeftColor: r.color, ['--i' as string]: i }}>
                  <span className="ve-icon" style={{ color: r.color }}>{r.glyph}</span>
                  <span className="ve-name" style={{ color: r.color }}>{r.name}</span>
                  <span className="ve-count">×{r.n}</span>
                </div>
              ))}
            </div>
            {lootBoxes === 0 && (
              <div className="vault-note">Only your guaranteed run cache — push deeper to fill the loot meter for rarity drops.</div>
            )}
          </>
        ) : (
          <div className="vault-empty">No bio-containers banked — push deeper to fill the loot meter.</div>
        )}
        <div className="loot-queue-line" style={{ marginTop: 8 }}>
          Now filling <b style={{ color: front?.color }}>{front?.name ?? 'Common'}</b>
          {next && (<>{' · next '}<b style={{ color: next.color }}>{next.name}</b></>)}
        </div>
      </>
    ),
  });

  // 5 — DISCOVERIES (only when there's something new — scales to collections / unlocks later)
  if (outcome.achievements.length > 0 || newMasteries > 0) {
    categories.push({
      id: 'discoveries',
      title: 'Discoveries',
      icon: '✧',
      accent: 'var(--r-epic)',
      summary: [
        outcome.achievements.length > 0 ? `${outcome.achievements.length} achievement${outcome.achievements.length > 1 ? 's' : ''}` : null,
        newMasteries > 0 ? `${newMasteries} new master${newMasteries > 1 ? 'ies' : 'y'}` : null,
      ].filter(Boolean).join(' · '),
      stats: [
        { id: 'achv', label: 'Achievements', value: outcome.achievements.length, accent: 'var(--r-epic)', celebrate: outcome.achievements.length > 0 },
        { id: 'newmastery', label: 'New Masteries', value: newMasteries, celebrate: newMasteries > 0 },
      ],
      // The full list lives here (always inspectable by expanding Discoveries); the post-sequence
      // spotlight is just the celebratory sequential reveal of the same achievements.
      extra: (
        <div className="mastery-unlocks">
          {outcome.achievements.map((a) => (
            <div className="mu-row" key={`a-${a.id}`}>
              <span className="mu-kind mu-achv">Achv</span>
              <span className="mu-name">{a.name}{a.reward ? ` · +${a.reward} ${ACCOUNT_CURRENCY.name}` : ''}</span>
            </div>
          ))}
          {outcome.masteryUnlocks.titles.map((id) => (
            <div className="mu-row" key={`t-${id}`}>
              <span className="mu-kind mu-title">Title</span>
              <span className="mu-name">{masteryRewardById(id)?.name ?? id}</span>
            </div>
          ))}
          {outcome.masteryUnlocks.lore.map((id) => (
            <div className="mu-row" key={`l-${id}`}>
              <span className="mu-kind mu-lore">Lore</span>
              <span className="mu-name">{masteryRewardById(id)?.name ?? id}</span>
            </div>
          ))}
        </div>
      ),
    });
  }

  const achievements: AchievementItem[] = outcome.achievements.map((a) => ({ id: a.id, name: a.name, desc: a.desc, reward: a.reward }));

  const title = (
    <div className={`rr-title ${result.won ? 'win' : 'lose'}`}>
      <div className="rr-eyebrow">{result.won ? 'RUN COMPLETE' : 'RUN ENDED'}</div>
      <div className="rr-headline">
        {result.endless ? `DEPTH ${result.wave} REACHED` : result.won ? 'EXTRACTION COMPLETE' : 'NUCLEUS LOST'}
      </div>
    </div>
  );

  return (
    <div className="menu results-screen">
      <RewardReveal title={title} categories={categories} achievements={achievements} onContinue={onContinue} />
    </div>
  );
}
