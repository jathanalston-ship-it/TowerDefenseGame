// PLAYER PROFILE — the account dashboard (docs/PROFILE.md). Answers, top to bottom: who is
// this player (banner + frames), what have they accomplished (career + power breakdown +
// showcase + timeline), what are they working toward (milestones = the Next-Goal engine +
// the loop directive), and how do they play (analytics). Every stat grid renders whatever
// the PROFILE REGISTRY (state/profile.ts) yields — adding a system's stats never touches
// this file. Identity surfaces (title picker, achievement gallery) embed the existing
// components rather than duplicating them.

import { useState } from 'react';
import { AccountCard } from './components/AccountPanel';
import { meta } from '../state/meta';
import { bossDef } from '../core/boss';
import {
  PROFILE_SECTION_TITLES,
  achievementShowcase,
  playerBanner,
  powerBreakdown,
  profileSection,
} from '../state/profile';
import type { ProfileSectionId, ProfileStat } from '../state/profile';
import { nextGoals } from '../state/nextGoal';
import { LoopDirective } from './NextGoalBanner';
import { MasteryProfile } from './MasteryProfile';
import { AchievementPanel } from './AchievementPanel';
import { formatPower } from '../core/power';

const CAREER_SECTIONS: ProfileSectionId[] = ['combat', 'economy', 'campaign', 'infinite', 'bossrush', 'collection'];

function StatCell({ s }: { s: ProfileStat }): JSX.Element {
  return (
    <div className={`pf-stat${s.hint ? ' tt' : ''}`} tabIndex={s.hint ? 0 : undefined}>
      <span className="pf-stat-k">{s.label}</span>
      <span className="pf-stat-v" style={s.color ? { color: s.color } : undefined}>{s.value}</span>
      {s.progress !== undefined && (
        <span className="pf-stat-bar" aria-hidden><i style={{ width: `${Math.round(Math.min(1, s.progress) * 100)}%` }} /></span>
      )}
      {s.hint && <span className="tt-bubble">{s.hint}</span>}
    </div>
  );
}

export function PlayerProfile({ onNavigate }: { onNavigate?: (nav: string) => void }): JSX.Element {
  const save = meta.use();
  const banner = playerBanner(save);
  const power = powerBreakdown(save);
  const showcase = achievementShowcase(save);
  const goals = nextGoals(save, 5);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(banner.name);
  const maxShare = Math.max(1, ...power.slices.map((s) => s.share));

  return (
    <div className="pf">
      {/* ── 1 · PLAYER BANNER — who is this? ── */}
      <section className={`pf-banner frame-${banner.frame.id}`} aria-label="Player banner">
        <div className="pf-banner-bg" aria-hidden />
        <div className="pf-id">
          {editing ? (
            <input
              className="pf-name-input"
              value={draft}
              maxLength={24}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { meta.setProfileName(draft); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { meta.setProfileName(draft); setEditing(false); } }}
            />
          ) : (
            <button type="button" className="pf-name" onClick={() => { setDraft(banner.name); setEditing(true); }} title="Rename the specimen line">
              {banner.name} <i aria-hidden>✎</i>
            </button>
          )}
          {banner.title && <span className="pf-title">« {banner.title} »</span>}
          <span className="pf-frame-name">{banner.frame.name} frame</span>
        </div>
        <div className="pf-banner-stats">
          <div className="pf-big tt" tabIndex={0}>
            <span className="pf-big-k">Power</span>
            <span className="pf-big-v" style={{ color: 'var(--gold)' }}>{formatPower(banner.power)}</span>
            <span className="tt-bubble">The one account-strength number — every permanent system folds into it.</span>
          </div>
          <div className="pf-big"><span className="pf-big-k">Campaign</span><span className="pf-big-v" style={{ color: 'var(--caustic)' }}>{banner.stage}</span></div>
          <div className="pf-big"><span className="pf-big-k">Infinite</span><span className="pf-big-v" style={{ color: 'var(--viral)' }}>{banner.bestWave}</span></div>
          <div className="pf-big"><span className="pf-big-k">Molts</span><span className="pf-big-v">{banner.molts}</span></div>
        </div>
        <div className="pf-banner-chips">
          <span className="pf-chip">Playtime <b>{banner.playtime}</b></span>
          <span className="pf-chip">Age <b>{banner.accountAge}</b></span>
          <span className="pf-chip">Prefers <b>{banner.difficulty}</b></span>
          <span className="pf-chip">Strain <b>{banner.favoriteTower}</b></span>
          <span className="pf-chip">Champion <b>{banner.favoriteHero}</b></span>
        </div>
        <div className="pf-frames" role="radiogroup" aria-label="Profile frame">
          {banner.frames.map((f) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={banner.frame.id === f.id}
              className={`pf-frame-pick tt${banner.frame.id === f.id ? ' on' : ''}${f.isUnlocked ? '' : ' locked'}`}
              onClick={() => f.isUnlocked && meta.setProfileFrame(f.id)}
              tabIndex={0}
            >
              <i className={`pf-frame-dot frame-${f.id}`} aria-hidden />
              {f.name}
              <span className="tt-bubble">{f.isUnlocked ? f.blurb : `Locked — ${f.blurb}`}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── ACCOUNT & SYNC — where this life lives (docs/ACCOUNTS.md) ── */}
      <AccountCard />

      {/* ── 6 · NEXT MILESTONES — what should they do next? (macro loop + micro goals) ── */}
      <section className="pf-block" aria-label="Next milestones">
        <div className="pf-h">Next Milestones</div>
        <LoopDirective />
        <div className="pf-goals">
          {goals.map((g) => (
            <button key={g.id} type="button" className="pf-goal" style={{ ['--gc' as string]: g.color }} onClick={() => onNavigate?.(g.nav)}>
              <span className="pf-goal-top"><b>{g.label}</b><i>{g.remaining}</i></span>
              <span className="pf-goal-bar" aria-hidden><i style={{ width: `${Math.round(g.progress * 100)}%` }} /></span>
              <span className="pf-goal-reward">{g.reward}</span>
            </button>
          ))}
          {goals.length === 0 && <div className="pf-empty">Every tracked goal is complete — push the frontier.</div>}
        </div>
      </section>

      {/* ── 6b · NEMESIS + TROPHY RACK (docs/NEMESIS.md) — the hunt and the spoils ── */}
      <section className="pf-block" aria-label="Nemesis and trophies">
        <div className="pf-h">Nemesis &amp; Trophy Rack</div>
        {save.nemesis ? (
          <div className="pf-nemesis">
            ☠ <b>{bossDef(save.nemesis.defId)?.name ?? save.nemesis.defId}</b> hunts you — it has ended
            {' '}{save.nemesis.slain} of your runs. It returns STRONGER each time; kill it for
            {' '}<b>+{60 * save.nemesis.slain} Cores</b> and an Abyssal phenotype.
          </div>
        ) : (
          <div className="pf-nemesis dim">No nemesis stalks you. Lose a run to a boss and it will remember.</div>
        )}
        <div className="pf-trophies">
          {meta.trophies().map(({ def, owned, equipped }) => (
            <button
              key={def.id}
              className={`pf-trophy${equipped ? ' on' : ''}${owned ? '' : ' is-locked'}`}
              disabled={!owned}
              onClick={() => meta.equipTrophy(equipped ? null : def.id)}
              title={owned ? `${def.organ} — ${def.up} / ${def.down}` : 'Slay its source to claim this organ'}
            >
              <b>{owned ? (equipped ? '◈ ' : '') : '🔒 '}{def.name}</b>
              <span className="pf-trophy-fx"><i className="up">{def.up}</i> · <i className="down">{def.down}</i></span>
            </button>
          ))}
        </div>
        <div className="pf-trophy-note">One trophy may be mounted at a time — every organ pays AND costs.</div>
      </section>

      {/* ── 3 · POWER BREAKDOWN — where the strength comes from ── */}
      <section className="pf-block" aria-label="Power breakdown">
        <div className="pf-h">Power Breakdown <b className="pf-h-power">{formatPower(power.score)}</b></div>
        <div className="pf-power">
          {power.slices.map((s) => (
            <div className="pf-power-row tt" key={s.id} tabIndex={0}>
              <span className="pf-power-k">{s.label}</span>
              <span className="pf-power-bar" aria-hidden><i style={{ width: `${Math.round((s.share / maxShare) * 100)}%` }} /></span>
              <span className="pf-power-v">{s.share > 0 ? `+${formatPower(s.share)}` : '—'}</span>
              <span className="tt-bubble">{s.hint} Multiplier ×{s.mult.toFixed(2)}.</span>
            </div>
          ))}
          <div className="pf-power-base">Baseline organism {formatPower(power.base)} — every bucket multiplies it.</div>
        </div>
      </section>

      {/* ── 2 · CAREER STATISTICS — registry-driven groups ── */}
      <section className="pf-block" aria-label="Career statistics">
        <div className="pf-h">Career Statistics</div>
        <div className="pf-career">
          {CAREER_SECTIONS.map((id) => {
            const stats = profileSection(save, id);
            if (stats.length === 0) return null;
            return (
              <div className="pf-group" key={id}>
                <div className="pf-group-h">{PROFILE_SECTION_TITLES[id]}</div>
                <div className="pf-grid">{stats.map((s) => <StatCell key={s.id} s={s} />)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 7 · PERFORMANCE ANALYTICS — how do they play? ── */}
      <section className="pf-block" aria-label="Performance analytics">
        <div className="pf-h">{PROFILE_SECTION_TITLES.analytics}</div>
        <div className="pf-grid pf-analytics">
          {profileSection(save, 'analytics').map((s) => <StatCell key={s.id} s={s} />)}
        </div>
      </section>

      {/* ── 4 · ACHIEVEMENTS SHOWCASE ── */}
      <section className="pf-block" aria-label="Achievements showcase">
        <div className="pf-h">Achievements <b className="pf-h-sub">{showcase.count} / {showcase.total}</b></div>
        <div className="pf-showcase">
          <div className="pf-case"><span className="pf-case-k">Most recent</span><b>{showcase.recent?.name ?? '—'}</b><i>{showcase.recent?.desc ?? 'No achievements yet.'}</i></div>
          <div className="pf-case"><span className="pf-case-k">Crown piece</span><b>{showcase.rarest?.name ?? '—'}</b><i>{showcase.rarest ? `${showcase.rarest.desc}` : 'Unlock achievements to earn one.'}</i></div>
          <div className="pf-case is-goal"><span className="pf-case-k">Chasing</span><b>{showcase.goal?.name ?? 'All clear'}</b><i>{showcase.goal?.desc ?? 'Every visible achievement is unlocked.'}</i></div>
        </div>
      </section>

      {/* ── 5 · PROGRESS TIMELINE — the account's story, newest first ── */}
      <section className="pf-block" aria-label="Progress timeline">
        <div className="pf-h">Timeline</div>
        {save.timeline.length > 0 ? (
          <ol className="pf-timeline">
            {[...save.timeline].reverse().map((e, i) => (
              <li className="pf-tl" key={`${e.at}-${i}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                <span className="pf-tl-icon" aria-hidden>{e.icon}</span>
                <span className="pf-tl-label">{e.label}</span>
                <span className="pf-tl-when">{new Date(e.at).toLocaleDateString()}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="pf-empty">Milestones record here from your next settled run onward.</div>
        )}
      </section>

      {/* Identity + gallery — the existing surfaces, embedded (titles = wearable badges). */}
      <div className="pf-cols">
        <MasteryProfile />
        <AchievementPanel />
      </div>
    </div>
  );
}
