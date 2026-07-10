// QUEST BOARD (docs/QUESTS.md §ui) — the directive terminal. Top: THIS WEEK'S QUEST (the
// rotating ring — countdown, missions with live progress + claims, and the finale that
// guarantees a story cutscene + exclusive cosmetic on first completion). Middle: THE DESCENT
// BELOW — the main questline's permanent chapters, sequential (claiming a finale opens the
// next). Bottom: Champion Contracts, the quest-adjacent weekly skill checks, on the same
// board. Poll-on-tick keeps the rotation + countdown live; claims pay through meta.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { meta } from '../state/meta';
import type { QuestsView } from '../state/meta';
import { rewardLabel } from '../core/battlePass';
import { QUESTS } from '../core/quests';
import type { MissionDef, QuestDef } from '../core/quests';
import { cutsceneDef } from '../core/cutscenes';
import { wardrobeItem, WARDROBE_RARITY_COLOR } from '../core/wardrobe';
import { ContractsCard } from './components/ContractsCard';
import { audio } from '../audio/sound';

function fmtLeft(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function MissionRow({ mi, cur, claimed, onClaim }: {
  mi: MissionDef;
  cur: number;
  claimed: boolean;
  onClaim: () => void;
}): JSX.Element {
  const earned = cur >= mi.target;
  const pct = Math.min(100, (cur / Math.max(1, mi.target)) * 100);
  return (
    <div className={`qb-mission${claimed ? ' is-claimed' : earned ? ' is-earned' : ''}`}>
      <div className="qb-m-main">
        <span className="qb-m-name">{mi.name}</span>
        <span className="qb-m-blurb">{mi.blurb}</span>
        <div className="qb-m-bar" role="progressbar" aria-valuenow={cur} aria-valuemin={0} aria-valuemax={mi.target}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="qb-m-side">
        <span className="qb-m-count">{Math.min(cur, mi.target)}<em>/{mi.target}</em></span>
        <span className="qb-m-pay" aria-hidden>{mi.rewards.map((r, i) => <i key={i}>{rewardLabel(r).icon}</i>)}</span>
        {claimed
          ? <span className="qb-m-done" aria-label="Claimed">✓</span>
          : earned
            ? <button className="qb-m-claim" onClick={onClaim}>Claim</button>
            : null}
      </div>
    </div>
  );
}

/** The finale strip: repeatable rewards + the one-time story unlocks (or their substitution). */
function FinaleStrip({ q, firstTime, claimable, claimed, onClaim }: {
  q: QuestDef;
  firstTime: boolean;
  claimable: boolean;
  claimed: boolean;
  onClaim: () => void;
}): JSX.Element {
  const film = cutsceneDef(q.finaleCutscene);
  const item = wardrobeItem(q.finaleCosmetic);
  return (
    <div className={`qb-finale${claimable ? ' is-ready' : ''}${claimed ? ' is-claimed' : ''}`}>
      <div className="qb-finale-k">QUEST FINALE</div>
      <div className="qb-finale-rewards">
        {q.finaleRewards.map((r, i) => {
          const { icon, label } = rewardLabel(r);
          return <span className="qb-finale-line" key={i}>{icon} {label}</span>;
        })}
        {firstTime ? (
          <>
            <span className="qb-finale-line is-story">▣ Story memory — {film?.title ?? q.finaleCutscene}</span>
            <span className="qb-finale-line is-story" style={item ? { color: WARDROBE_RARITY_COLOR[item.rarity] } : undefined}>
              ❖ Exclusive cosmetic — {item?.name ?? q.finaleCosmetic}
            </span>
          </>
        ) : (
          <span className="qb-finale-line">⟳ Story rewards unlocked → {QUESTS.repeatFinale.ichor} Ichor + {QUESTS.repeatFinale.cores} Cores</span>
        )}
      </div>
      {claimed
        ? <span className="qb-finale-done">✓ Claimed</span>
        : <button className="primary qb-finale-claim" disabled={!claimable} onClick={onClaim}>
            {claimable ? 'Claim finale' : 'Complete every mission'}
          </button>}
    </div>
  );
}

export function QuestBoard(): JSX.Element {
  meta.use(); // re-render on credits / claims
  const [now, setNow] = useState(() => Date.now());
  const [receipt, setReceipt] = useState<{ icon: string; label: string }[] | null>(null);

  useEffect(() => {
    meta.pollWeeklyQuest(now);
    const t = window.setInterval(() => { const n = Date.now(); setNow(n); meta.pollWeeklyQuest(n); }, 30_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view: QuestsView = meta.quests(now);
  const wk = view.weekly;

  const claimMission = (id: string): void => {
    const lines = meta.claimQuestMission(id, Date.now());
    if (lines) { setReceipt(lines); audio.cue('chest'); }
  };
  const claimFinale = (questId: string): void => {
    const lines = meta.claimQuestFinale(questId, Date.now());
    if (lines) { setReceipt(lines); audio.cue('jackpot'); }
  };

  return (
    <div className="menu qb" style={{ ['--qa' as string]: wk.quest.accent } as CSSProperties}>
      <h1 className="title">QUEST BOARD</h1>
      <p className="subtitle">Directives from the deep — weekly orders and the story of the descent.</p>

      {receipt && (
        <div className="bp-receipt" role="status" onClick={() => setReceipt(null)}>
          {receipt.slice(0, 8).map((l, i) => <span key={i}>{l.icon} {l.label}</span>)}
          {receipt.length > 8 && <span>+{receipt.length - 8} more</span>}
        </div>
      )}

      <section className="panel qb-weekly" aria-label="This week's quest">
        <header className="qb-w-head">
          <div className="qb-w-glyph" aria-hidden>{wk.quest.glyph}</div>
          <div className="qb-w-title">
            <div className="qb-eyebrow">WEEKLY QUEST · rotates {fmtLeft(wk.endsInMs)} · progress resets</div>
            <h2 className="qb-w-name">{wk.quest.name}</h2>
            <p className="qb-w-tag">{wk.quest.tagline}</p>
          </div>
          <div className="qb-w-meter">
            <b>{wk.quest.missions.filter((m) => (wk.progress[m.id] ?? 0) >= m.target).length}</b>
            <span>/{wk.quest.missions.length} missions</span>
            {wk.completions > 0 && <span className="qb-w-reruns">answered ×{wk.completions}</span>}
          </div>
        </header>
        <div className="qb-missions">
          {wk.quest.missions.map((mi) => (
            <MissionRow
              key={mi.id}
              mi={mi}
              cur={wk.progress[mi.id] ?? 0}
              claimed={wk.claimed.has(mi.id)}
              onClaim={() => claimMission(mi.id)}
            />
          ))}
        </div>
        <FinaleStrip
          q={wk.quest}
          firstTime={wk.firstTime}
          claimable={wk.finaleClaimable}
          claimed={wk.completionClaimed}
          onClaim={() => claimFinale(wk.quest.id)}
        />
      </section>

      <section className="qb-main" aria-label="Main questline">
        <div className="qb-main-h">
          <h2 className="qb-main-title">THE DESCENT BELOW</h2>
          <p className="qb-main-sub">The main quest. Chapters are forever — claim a finale to open the next.</p>
        </div>
        {view.main.map(({ quest: c, state, progress, claimed, finaleClaimable, firstTime }, i) => (
          <article
            className={`panel qb-chapter is-${state}`}
            key={c.id}
            style={{ ['--qa' as string]: c.accent } as CSSProperties}
          >
            <header className="qb-c-head">
              <div className="qb-w-glyph" aria-hidden>{state === 'locked' ? '🔒' : c.glyph}</div>
              <div className="qb-w-title">
                <h3 className="qb-c-name">{c.name}</h3>
                <p className="qb-w-tag">{state === 'locked' ? `Claim the previous chapter's finale to open.` : c.tagline}</p>
              </div>
              <div className="qb-w-meter">
                {state === 'done' ? (
                  <span className="qb-c-done">✓ CHRONICLED</span>
                ) : (
                  <>
                    <b>{c.missions.filter((m) => (progress[m.id] ?? 0) >= m.target).length}</b>
                    <span>/{c.missions.length} missions</span>
                  </>
                )}
              </div>
            </header>
            {state === 'active' && (
              <>
                <div className="qb-missions">
                  {c.missions.map((mi) => (
                    <MissionRow
                      key={mi.id}
                      mi={mi}
                      cur={progress[mi.id] ?? 0}
                      claimed={claimed.has(mi.id)}
                      onClaim={() => claimMission(mi.id)}
                    />
                  ))}
                </div>
                <FinaleStrip
                  q={c}
                  firstTime={firstTime}
                  claimable={finaleClaimable}
                  claimed={false}
                  onClaim={() => claimFinale(c.id)}
                />
              </>
            )}
            {state === 'done' && (
              <div className="qb-c-epilogue">
                ▣ {cutsceneDef(c.finaleCutscene)?.title ?? c.finaleCutscene} — in the Memory Archive · ❖ {wardrobeItem(c.finaleCosmetic)?.name ?? c.finaleCosmetic} — in the Wardrobe
                {i < view.main.length - 1 ? ' · next chapter open' : ' · the descent continues…'}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="qb-contracts" aria-label="Champion Contracts">
        <div className="qb-main-h">
          <h2 className="qb-main-title">CHAMPION CONTRACTS</h2>
          <p className="qb-main-sub">The weekly skill checks — one qualifying run each, judged at run end.</p>
        </div>
        <ContractsCard />
      </section>
    </div>
  );
}
