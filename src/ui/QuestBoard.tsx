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
import { NextUp } from './HubLanding';
import { navBus } from '../state/navBus';
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
  onClaim: (e: React.MouseEvent) => void;
}): JSX.Element {
  const earned = cur >= mi.target;
  const pct = Math.min(100, (cur / Math.max(1, mi.target)) * 100);
  return (
    <div className={`qb-mission${claimed ? ' is-claimed' : earned ? ' is-earned' : ''}`}>
      <div className="qb-m-main">
        <span className="qb-m-name">{mi.name}{!claimed && earned && <i className="qb-m-readydot" aria-label="Ready to claim" />}</span>
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

/** The claim CELEBRATION — reward chips erupt from the claim point, ride a small arc, and
 *  fade; a shock ring marks the spot (finales get the wide gold ring). Pure presentation over
 *  the receipt (the save is already true), pointer-transparent, self-clearing, and skipped
 *  entirely under reduced motion (the top receipt strip remains the accessible record). */
function ClaimBurst({ burst }: { burst: { x: number; y: number; lines: { icon: string; label: string }[]; big: boolean; key: number } }): JSX.Element {
  return (
    <div className="qb-burst" style={{ left: burst.x, top: burst.y }} aria-hidden key={burst.key}>
      <i className={`qb-burst-ring${burst.big ? ' is-big' : ''}`} />
      {burst.lines.slice(0, 6).map((l, i) => {
        const spread = (i - (Math.min(burst.lines.length, 6) - 1) / 2) * 34;
        return (
          <span
            className="qb-burst-chip"
            key={i}
            style={{ ['--dx' as string]: `${spread}px`, animationDelay: `${i * 70}ms` }}
          >
            {l.icon} {l.label}
          </span>
        );
      })}
    </div>
  );
}

/** The finale strip: repeatable rewards + the one-time story unlocks (or their substitution). */
function FinaleStrip({ q, firstTime, claimable, claimed, onClaim }: {
  q: QuestDef;
  firstTime: boolean;
  claimable: boolean;
  claimed: boolean;
  onClaim: (e: React.MouseEvent) => void;
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
  const [burst, setBurst] = useState<{ x: number; y: number; lines: { icon: string; label: string }[]; big: boolean; key: number } | null>(null);

  useEffect(() => {
    meta.pollWeeklyQuest(now);
    const t = window.setInterval(() => { const n = Date.now(); setNow(n); meta.pollWeeklyQuest(n); }, 30_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The burst self-clears (pointer-transparent, purely decorative).
  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(null), 1600);
    return () => window.clearTimeout(t);
  }, [burst]);

  const view: QuestsView = meta.quests(now);
  const wk = view.weekly;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const celebrate = (e: React.MouseEvent, lines: { icon: string; label: string }[], big: boolean): void => {
    if (reduced) return;
    setBurst({ x: e.clientX, y: e.clientY, lines, big, key: Date.now() });
  };
  // Claims present through the global claim popup (docs/NOTIFICATIONS.md §claim-popups):
  // a bold itemized receipt naming the mission/quest — the burst stays as local juice.
  const claimMission = (mi: MissionDef, _accent: string, e: React.MouseEvent): void => {
    const lines = meta.claimQuestMission(mi.id, Date.now());
    if (lines) {
      celebrate(e, lines, false);
      audio.cue('chest');
      audio.cue('power');
    }
  };
  const claimFinale = (q: QuestDef, _firstTime: boolean, e: React.MouseEvent): void => {
    const lines = meta.claimQuestFinale(q.id, Date.now());
    if (lines) {
      celebrate(e, lines, true);
      audio.cue('jackpot');
    }
  };

  // Claimable RIGHT NOW across both lanes — the board's own headline notification (the nav
  // badge outside uses the same census via notificationSources 'quests.claimable').
  const activeChapter = view.main.find((c) => c.state === 'active');
  const claimableNow =
    wk.quest.missions.filter((m) => (wk.progress[m.id] ?? 0) >= m.target && !wk.claimed.has(m.id)).length
    + (wk.finaleClaimable && !wk.completionClaimed ? 1 : 0)
    + (activeChapter
      ? activeChapter.quest.missions.filter((m) => (activeChapter.progress[m.id] ?? 0) >= m.target && !activeChapter.claimed.has(m.id)).length
        + (activeChapter.finaleClaimable ? 1 : 0)
      : 0);

  return (
    <div className="menu qb" style={{ ['--qa' as string]: wk.quest.accent } as CSSProperties}>
      <h1 className="title">QUEST BOARD {claimableNow > 0 && <span className="qb-claimable-chip">◈ {claimableNow} to claim</span>}</h1>
      <p className="subtitle">Directives from the deep — weekly orders and the story of the descent.</p>
      {burst && <ClaimBurst burst={burst} />}
      {/* Loop handoff (docs/REWARD-ARCHITECTURE.md §chaining): a fully-claimed board hands
          the session to the next loop instead of dead-ending on grayed buttons. */}
      {claimableNow === 0 && <NextUp save={meta.get()} exclude="quests" go={(k) => navBus.go(k)} />}

      <section className="panel qb-weekly" data-guide="quest-weekly" aria-label="This week's quest">
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
              onClaim={(e) => claimMission(mi, wk.quest.accent, e)}
            />
          ))}
        </div>
        <FinaleStrip
          q={wk.quest}
          firstTime={wk.firstTime}
          claimable={wk.finaleClaimable}
          claimed={wk.completionClaimed}
          onClaim={(e) => claimFinale(wk.quest, wk.firstTime, e)}
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
                      onClaim={(e) => claimMission(mi, c.accent, e)}
                    />
                  ))}
                </div>
                <FinaleStrip
                  q={c}
                  firstTime={firstTime}
                  claimable={finaleClaimable}
                  claimed={false}
                  onClaim={(e) => claimFinale(c, firstTime, e)}
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

      <section className="qb-contracts" data-guide="quest-story" aria-label="Champion Contracts">
        <div className="qb-main-h">
          <h2 className="qb-main-title">CHAMPION CONTRACTS</h2>
          <p className="qb-main-sub">The weekly skill checks — one qualifying run each, judged at run end.</p>
        </div>
        <ContractsCard />
      </section>
    </div>
  );
}
