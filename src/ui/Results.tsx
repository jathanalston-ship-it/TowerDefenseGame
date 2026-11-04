// End-of-Run reward presentation. Reads the already-decided RunOutcome and stages it as a paced,
// categorized "progression capsule" (see RewardReveal): Combat Report → Progression → Resources →
// Bio-Containers → Discoveries, each animating in one at a time, then achievements spotlight after.
// This file is the DATA layer — it turns the outcome into RewardCategory[] (add a progression system
// = add one category here); RewardReveal owns the pacing, animation, and player controls.

import { useEffect } from 'react';
import { meta } from '../state/meta';
import { music } from '../audio/music';
import type { RunOutcome, RunResult } from '../state/meta';
import { MASTERY, HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { DOCTRINES } from '../core/doctrines';
import { recommendedPowerScore } from '../core/campaign';
import { rarityRank, rarityRegistry } from '../core/loot';
import { defeatDebrief, highestThreat } from '../state/runDebrief';
import type { DefeatDebrief } from '../state/runDebrief';
import { isOpenNav } from '../state/unlocks';
import { navBus } from '../state/navBus';
import { masteryRewardById } from '../core/mastery';
import { RewardReveal } from './RewardReveal';
import type { AchievementItem, RewardCategory, RewardStat } from './RewardReveal';
import { LoopDirective, NextGoalCliffhanger } from './NextGoalBanner';
import { BiomassIcon } from './components/Icon';
import { CurrencyIcon } from './components/CurrencyIcon';
import { FieldResearchCard } from './components/FieldResearch';
import { rewardLine } from './components/AccountXpBar';
import { ShareReplayButton } from './components/ShareReplay';
import { ThreatResult } from './components/ThreatPicker';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { AutoClaimSummary } from './components/AutoClaimSummary';
import { featureRevealed } from '../state/unlocks';
import { autoClaimPref } from '../state/prefs';

/** The defeat debrief (docs/REWARD-PRESENTATION.md §debrief) — always visible under the title on
 *  a loss: how close the run came, what got through, and ONE concrete next step. */
function DebriefPanel({ d, onGo }: { d: DefeatDebrief; onGo: (nav: string) => void }): JSX.Element {
  const where = d.totalWaves > 0 ? `Fell on wave ${d.wave} of ${d.totalWaves}` : `Fell at depth ${d.wave}`;
  const boss = d.bosses[0];
  return (
    <div className="rr-debrief" role="note" aria-label="What went wrong" onClick={(e) => e.stopPropagation()}>
      <div className="rr-debrief-close">
        <b>{where}</b>
        {boss && <span> · {boss.name} had <b className="rr-debrief-hp">{boss.hpPct}%</b> HP left</span>}
      </div>
      {d.threats.length > 0 && (
        <div className="rr-debrief-leak">
          <span className="rr-debrief-k">Got through</span>
          {d.threats.map((t) => (
            <span key={t.key} className="rr-debrief-src">
              <b style={{ color: t.color }}>{t.name}</b> {Math.round(t.share * 100)}%
            </span>
          ))}
        </div>
      )}
      <div className="rr-debrief-tip">
        <span>▸ {d.tip}</span>
        {d.tipNav && <button type="button" className="rr-debrief-go" onClick={() => onGo(d.tipNav!)}>Go ▸</button>}
      </div>
    </div>
  );
}

export function Results({
  result,
  outcome,
  onContinue,
  onReplay,
  onNext,
  nextBoons,
  nextAccent,
  powerBefore,
  paused,
}: {
  result: RunResult;
  outcome: RunOutcome;
  onContinue: () => void;
  onReplay?: () => void; // one-tap "Infect Again" — re-run the same mode
  onNext?: (boonId?: string) => void; // Campaign win with Stage N+1 open → the primary "Stage N+1 ▸" (App decides availability)
  /** Stage N+1's Mutation-event boon choice (docs/CAMPAIGN-EVENTS.md) — picked right here; absent ⇒ none. */
  nextBoons?: { id: string; name: string; desc: string }[];
  nextAccent?: string;
  powerBefore?: number; // Power Score just before the settle — the Power row counts up FROM it
  paused?: boolean; // a milestone cinematic (Hero Slot / Evolution Unlock) is over Results — the reveal waits
}): JSX.Element {
  const masteryGains = TOWER_ORDER.filter((k) => outcome.mastery[k].xpGained > 0);
  // The run's highest mastery contributor (by XP) wears the crown in the ledger.
  const topContributor = masteryGains.length > 0 ? masteryGains.reduce((a, b) => (outcome.mastery[b].xpGained > outcome.mastery[a].xpGained ? b : a)) : null;
  const heroMasteryGains = HERO_ORDER.filter((k) => outcome.heroMastery[k].xpGained > 0);

  const masteryXp =
    TOWER_ORDER.reduce((s, k) => s + outcome.mastery[k].xpGained, 0) +
    HERO_ORDER.reduce((s, k) => s + outcome.heroMastery[k].xpGained, 0);
  const levelUps =
    TOWER_ORDER.reduce((s, k) => s + Math.max(0, outcome.mastery[k].toLevel - outcome.mastery[k].fromLevel), 0) +
    HERO_ORDER.reduce((s, k) => s + Math.max(0, outcome.heroMastery[k].toLevel - outcome.heroMastery[k].fromLevel), 0);

  // Toughest Kill = the toughest thing the player actually put down this run — a slain boss by
  // its REAL name (framework bosses borrow the 'tyrant' kind; state/runDebrief resolves it).
  const threat = highestThreat(result.stats);
  // Defeat debrief (docs/REWARD-PRESENTATION.md §debrief): how close, what got through, one step.
  const debrief = defeatDebrief(result, {
    power: meta.power().score,
    rec: result.campaignStage ? recommendedPowerScore(result.campaignStage, result.difficulty ?? 'standard') : 0,
    canOpen: (nav) => isOpenNav(meta.get(), nav),
  });

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
  // The Flawless first-clear bonus cache is banked as an extra 'cache' container; surface it as its
  // own labeled row so the guaranteed run cache and the earned bonus read distinctly.
  const flawlessEarned = outcome.flawlessCache?.earned ?? false;
  const guaranteedCaches = flawlessEarned ? cacheCount - 1 : cacheCount;
  if (guaranteedCaches > 0) containerRows.push({ key: 'cache', name: 'Run Cache', color: 'var(--cache)', n: guaranteedCaches, glyph: '⬢', cache: true });
  if (flawlessEarned) containerRows.push({ key: 'flawless-cache', name: 'Flawless Cache', color: 'var(--gold)', n: 1, glyph: '⬢', cache: true });
  const earned = outcome.loot.banked.length;
  const lootBoxes = earned - cacheCount; // loot-queue boxes only (excludes the guaranteed cache)
  const owned = meta.pendingContainers().length;
  // Reward eligibility (docs/MODE-IDENTITY.md): a run that didn't qualify for its cache says why.
  const blockedNote = outcome.rewardBlocked
    ? outcome.rewardBlocked.reason === 'campaign-loss'
      ? 'Stage failed — no Stage Cache awarded. Clear the stage to earn its cache.'
      : `Run too short to qualify for Stage Cache rewards — reach Wave ${outcome.rewardBlocked.qualifyWave} (50% of your ${outcome.rewardBlocked.reason === 'rush-short' ? 'Boss Rush record' : 'best'}) to bank rewards.`
    : null;
  const front = rarityRegistry.get(outcome.loot.queue.queue[0]);
  const next = rarityRegistry.get(outcome.loot.queue.queue[1]);

  const newMasteries = outcome.masteryUnlocks.titles.length + outcome.masteryUnlocks.lore.length;

  // Flawless bonus-cache notice — tells the player whether the no-damage first-clear bonus landed,
  // and why not when it didn't (took damage, or a replay). null → not a campaign clear, show nothing.
  const fc = outcome.flawlessCache;
  // A campaign FIRST CLEAR is a chapter beat — it lands the 'chapter' stinger over the victory
  // cadence as the capsule opens (audio/music.ts STINGERS). Replays stay quiet.
  const firstClear = fc?.firstClear ?? false;
  useEffect(() => {
    if (firstClear) music.stinger('chapter');
  }, [firstClear]);
  // Account level-ups crossed this run: the `levelup` cue rides the Account Level row (RewardStat
  // `cue`), so it sounds when that row LANDS in the paced reveal — not as the capsule opens.
  const flawlessNotice: { tone: 'earned' | 'miss'; text: string } | null =
    !fc ? null
    : fc.earned ? { tone: 'earned', text: 'Flawless clear — bonus Flawless Cache secured! No damage taken.' }
    : fc.firstClear ? { tone: 'miss', text: 'Flawless bonus missed — the Nucleus took damage this run.' }
    : fc.noDamage ? { tone: 'miss', text: 'Flawless run — but the bonus cache is first-clear only.' }
    : null;

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
  // Deepest STRAIN evolution reached (docs/STRAIN.md §integration) — a run trophy when > I.
  if ((result.stats.maxStrain ?? 1) > 1) {
    combatStats.push({
      id: 'strain',
      label: 'Deepest Strain',
      value: result.stats.maxStrain ?? 1,
      format: (n) => `Strain ${['I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(4, Math.round(n) - 1))]}`,
      accent: 'var(--gold)',
      celebrate: (result.stats.maxStrain ?? 1) >= 5,
    });
  }
  categories.push({
    id: 'combat',
    title: 'Combat Report',
    icon: '◎',
    accent: 'var(--danger)',
    summary: `${result.won ? 'Victory' : 'Defeat'} · ${num(result.kills)} eliminated`,
    stats: combatStats,
    extra: threat ? (
      <div className="rr-line">
        <span>Toughest Kill</span>
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
      { id: 'power', label: 'Power Score', value: meta.power().score, from: powerBefore, accent: 'var(--vital)', celebrate: levelUps > 0 },
    ],
    extra: (masteryGains.length > 0 || heroMasteryGains.length > 0) ? (
      <div className="mastery-gains">
        {masteryGains.map((k) => {
          const m = outcome.mastery[k];
          const c = result.mastery[k];
          const leveled = m.toLevel > m.fromLevel;
          const top = k === topContributor;
          const save = meta.get();
          // Power this run's mastery BANKED for the kind: current score minus the score
          // with the gained XP rolled back (the same preview model as everywhere).
          const powerGained = m.xpGained > 0
            ? Math.max(0, meta.power().score - meta.previewPower((sv) => ({
                ...sv,
                towerMasteryXp: { ...sv.towerMasteryXp, [k]: Math.max(0, (sv.towerMasteryXp[k] ?? 0) - m.xpGained) },
              })).score)
            : 0;
          return (
            <div className={`mastery-gain${top ? ' is-top' : ''}`} key={`t-${k}`}>
              <span className="mg-name" style={{ color: TOWER_DEFS[k].color }}>{top && <i className="mg-crown" title="Top contributor">✦</i>}{TOWER_DEFS[k].name}</span>
              <span className="mg-combat">{num(c.kills)} kills · {num(Math.round(c.damage))} dmg</span>
              <span className="mg-xp">+{num(m.xpGained)} XP</span>
              <span className={`mg-lvl ${leveled ? 'is-up' : ''}`}>{leveled ? `Lv ${m.fromLevel} → ${m.toLevel}` : `Lv ${m.toLevel}`}</span>
              {leveled && (
                <span className="mg-earn">
                  +{((m.toLevel - m.fromLevel) * MASTERY.damagePerLevel * 100).toFixed(1)}% dmg
                  {powerGained > 0 ? ` · ▲ +${num(powerGained)} Power` : ''}
                </span>
              )}
              <span className="mg-life">lifetime {num(save.towerKills[k] ?? 0)} kills · best wave {save.stats.towerBestWave[k] || '—'}{(save.stats.towerBestStrain[k] ?? 0) > 1 ? ` · strain ${['I', 'II', 'III', 'IV', 'V'][save.stats.towerBestStrain[k] - 1]}` : ''}</span>
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

  // 2b — ACCOUNT LEVEL (docs/ACCOUNT-LEVEL.md): the account-wide XP lane — every run pays in.
  // The bar fills toward the NEXT level (post-run state); crossed levels list their rewards.
  const axp = outcome.accountXp;
  const acct = meta.accountLevel();
  const acctMilestone = axp.levelUps.some((l) => l.milestone);
  categories.push({
    id: 'account',
    title: 'Account Level',
    icon: '⬆',
    accent: 'var(--viral)',
    summary: axp.levelUps.length > 0
      ? `+${num(axp.gained)} XP · LEVEL ${axp.to}${acctMilestone ? ' · ✦ MILESTONE' : ''}`
      : `+${num(axp.gained)} XP · LV ${acct.level}`,
    stats: [
      { id: 'axp', label: 'Account XP Earned', value: axp.gained, format: (n) => `${n.toLocaleString()} XP`, accent: 'var(--viral)', bar: Math.min(1, acct.into / Math.max(1, acct.need)) },
      axp.levelUps.length > 0
        ? { id: 'alevel', label: 'Account Level', value: axp.to, from: axp.from, format: (n) => `LV ${axp.from} → ${n}`, accent: acctMilestone ? 'var(--gold)' : 'var(--viral)', celebrate: true, cue: 'levelup' }
        : { id: 'alevel', label: 'Account Level', value: acct.level, from: acct.level, format: (n) => `LV ${n} · ${num(acct.into)}/${num(acct.need)} XP`, },
    ],
    extra: axp.levelUps.length > 0 ? (
      <div className="axp-runups">
        {axp.levelUps.map((lu) => (
          <div className={`axp-runup${lu.milestone ? ' is-milestone' : ''}`} key={lu.level}>
            <b>{lu.milestone ? '✦' : '⬆'} Level {lu.level}</b>
            <span>{rewardLine(lu.reward)}</span>
          </div>
        ))}
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
      { id: 'shards', label: `${ACCOUNT_CURRENCY.name} Earned`, value: outcome.reward.shardsEarned, icon: <CurrencyIcon id="genomeCores" />, accent: 'var(--gold)' },
      // MOMENTUM (docs/ECONOMY_FORMULAS.md §5): the catch-up seam paid extra because the account
      // is fighting above its weight — worth celebrating, it's the comeback working.
      ...(outcome.momentum
        ? [{
            id: 'momentum', label: 'Momentum (behind the frontier)', value: Math.round((outcome.momentum - 1) * 100),
            format: (n: number) => `+${n}% all income`,
            accent: 'var(--caustic)', celebrate: outcome.momentum >= 1.2,
          }]
        : []),
      // Season Pass XP (docs/BATTLEPASS.md §xp) — every run feeds the season; a crossed level celebrates.
      ...(outcome.passXp > 0 && featureRevealed(meta.get(), 'season') // XP banks silently until the pass reveals
        ? [{
            id: 'season-xp', label: 'Season XP', value: outcome.passXp,
            format: (n: number) => outcome.passLevelUp ? `+${num(n)} — LEVEL ${outcome.passLevelUp.to}!` : `+${num(n)}`,
            accent: 'var(--viral)', celebrate: !!outcome.passLevelUp,
          }]
        : []),
      // Boss Rush lifetime-record bands (docs/BOSS-RUSH.md §ichor): the record progress always
      // shows on a rush run; the Ichor row appears only when a NEW record actually bled.
      ...(outcome.rushProgress
        ? [{
            id: 'rush-record', label: 'Lifetime Bosses (record)', value: outcome.rushProgress.bestBoss,
            format: (n: number) => `${n} / next Ichor at ${outcome.rushProgress!.nextIchorAt}`,
            accent: 'var(--danger)', celebrate: outcome.rushProgress.ichor > 0,
          }]
        : []),
      ...(outcome.rushProgress && outcome.rushProgress.ichor > 0
        ? [{ id: 'rush-ichor', label: 'Ichor Bled (new record)', value: outcome.rushProgress.ichor, icon: <CurrencyIcon id="ichor" />, accent: 'var(--viral)', celebrate: true }]
        : []),
    ],
  });

  // 4 — BIO-CONTAINERS
  categories.push({
    id: 'containers',
    title: 'Bio-Containers',
    icon: '◈',
    accent: 'var(--r-legendary)',
    summary: blockedNote
      ? (outcome.rewardBlocked?.reason === 'campaign-loss' ? 'Stage failed — no cache' : 'Run too short — no rewards')
      : earned > 0 ? `${earned} recovered · ${owned} in vault` : 'None this run',
    stats: [
      { id: 'recovered', label: 'Containers Recovered', value: earned },
      { id: 'vault', label: 'Now in Vault', value: owned, from: Math.max(0, owned - earned), accent: 'var(--gold)', celebrate: earned > 0 },
    ],
    extra: (
      <>
        {blockedNote && <div className="vault-blocked" role="status">{blockedNote}</div>}
        {flawlessNotice && (
          <div className={`flawless-notice is-${flawlessNotice.tone}`}>
            <span className="fn-glyph">{flawlessNotice.tone === 'earned' ? '⬢' : '◌'}</span>
            <span>{flawlessNotice.text}</span>
          </div>
        )}
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
          !blockedNote && <div className="vault-empty">No bio-containers banked — push deeper to fill the loot meter.</div>
        )}
        <div className="loot-queue-line" style={{ marginTop: 8 }}>
          Now filling <b style={{ color: front?.color }}>{front?.name ?? 'Common'}</b>
          {next && (<>{' · next '}<b style={{ color: next.color }}>{next.name}</b></>)}
        </div>
      </>
    ),
  });

  // 4b — CHAMPION CONTRACTS (docs/CONTRACTS.md): honoured rows, the PERFECT WEEK sweep,
  // and near-misses (failed by exactly ONE constraint — the named chase line). Cores are
  // already in the Resources lane; this category makes the WIN and the CHASE visible.
  if ((outcome.contracts?.length ?? 0) > 0 || (outcome.contractNears?.length ?? 0) > 0 || outcome.perfectWeek) {
    const hits = outcome.contracts ?? [];
    const nears = outcome.contractNears ?? [];
    categories.push({
      id: 'contracts',
      title: 'Champion Contracts',
      icon: '❖',
      accent: 'var(--gold)',
      summary: outcome.perfectWeek
        ? 'PERFECT WEEK — every contract honoured'
        : hits.length > 0 ? hits.map((c) => c.name).join(' · ') : 'So close — one constraint short',
      stats: [
        ...(hits.length > 0 ? [
          { id: 'ccount', label: 'Contracts Honoured', value: hits.length, accent: 'var(--gold)', celebrate: true },
          { id: 'ccores', label: 'Bonus Cores', value: hits.reduce((a, c) => a + c.cores, 0) + (outcome.perfectWeek?.cores ?? 0), accent: 'var(--gold)' },
        ] : []),
        ...(outcome.perfectWeek ? [{ id: 'cweek', label: 'Perfect Week', value: outcome.perfectWeek.cores, format: (n: number) => `+${n.toLocaleString()}`, accent: 'var(--gold)', celebrate: true }] : []),
        ...(hits.length === 0 && nears.length > 0 ? [{ id: 'cnear', label: 'Near Misses', value: nears.length, accent: 'var(--muted)' }] : []),
      ],
      extra: (
        <div className="rr-contract-list">
          {hits.map((c) => (
            <div className="rr-contract" key={c.id}>
              <b>❖ {c.name}</b>
              <span>+{c.cores} Cores{c.cosmetic ? ' · Gilded phenotype unlocked — equip it in the Phenotype Lab' : ''}</span>
            </div>
          ))}
          {outcome.perfectWeek && (
            <div className="rr-contract is-perfect">
              <b>❖ PERFECT WEEK</b>
              <span>The whole board honoured — +{outcome.perfectWeek.cores} Cores</span>
            </div>
          )}
          {nears.map((c) => (
            <div className="rr-contract is-near" key={c.id}>
              <b>◌ {c.name}</b>
              <span>Missed by one: {c.missed}</span>
            </div>
          ))}
        </div>
      ),
    });
  }

  // 4c — QUEST MISSIONS this run completed (docs/QUESTS.md §credit): rewards claim on the
  // Quest Board — this names the movement and routes the player there.
  if (outcome.questMissions && outcome.questMissions.length > 0 && featureRevealed(meta.get(), 'quests')) {
    categories.push({
      id: 'quests',
      title: 'Quest Missions',
      icon: '✪',
      accent: 'var(--vital)',
      summary: outcome.questMissions.map((m) => m.name).join(' · '),
      stats: [
        { id: 'qcount', label: 'Missions Accomplished', value: outcome.questMissions.length, accent: 'var(--vital)', celebrate: true },
      ],
      extra: (
        <div className="rr-contract-list">
          {outcome.questMissions.map((m) => (
            <div className="rr-contract" key={m.id}>
              <b>✪ {m.name}</b>
              <span>{m.quest} — {autoClaimPref() ? 'reward auto-claimed (Also earned, above)' : 'claim the reward on the Quest Board'}</span>
            </div>
          ))}
        </div>
      ),
    });
  }

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

  // The run's doctrine commitment reads back on the report (docs/DOCTRINES.md §presence).
  const doc = result.doctrine && result.doctrine !== 'none' ? DOCTRINES[result.doctrine] : null;
  const title = (
    <div className={`rr-title ${result.won ? 'win' : 'lose'}`}>
      <div className="rr-eyebrow">{result.won ? 'RUN COMPLETE' : 'RUN ENDED'}</div>
      <div className="rr-headline">
        {result.endless ? `DEPTH ${result.wave} REACHED` : result.won ? 'EXTRACTION COMPLETE' : 'NUCLEUS LOST'}
      </div>
      {doc && <div className="rr-doctrine" title={doc.blurb}>{doc.icon} {doc.name}</div>}
      <AutoClaimSummary settle={result} />
    </div>
  );

  return (
    <div className="menu results-screen">
      <RewardReveal
        title={title}
        banner={debrief ? <DebriefPanel d={debrief} onGo={(nav) => { onContinue(); window.setTimeout(() => navBus.go(nav), 60); }} /> : undefined}
        categories={categories}
        achievements={achievements}
        onContinue={onContinue}
        onReplay={onReplay}
        replayLabel={!result.won ? '↻ Try again' : onNext ? '↻ Replay' : undefined}
        next={onNext && result.campaignStage ? { label: `Stage ${result.campaignStage + 1} ▸`, onClick: onNext, choices: nextBoons, choiceLabel: `Stage ${result.campaignStage + 1} boon`, accent: nextAccent } : undefined}
        paused={paused}
        cliffhanger={
          <>
            <ThreatResult outcome={outcome.threat} />
            {/* The macro-loop routing — the wall/breakthrough moment lands HERE (PROGRESSION-LOOP.md) */}
            <LoopDirective difficultyId={result.difficulty} />
            {/* Daily runs recorded an input log — offer the share code right at the result. */}
            {result.dailyReplay && (
              <div className="rr-share">
                <ShareReplayButton blob={result.dailyReplay} labelKey="results.shareReplay" />
              </div>
            )}
            <FieldResearchCard category="sample" note="Bank a specimen sample while the field is fresh." />
            <NextGoalCliffhanger />
          </>
        }
      />
    </div>
  );
}
