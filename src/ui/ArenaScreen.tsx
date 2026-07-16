// THE PROVING GROUNDS (docs/ARENA.md) — the arena hub screen: season identity + countdown,
// the ranked emblem (division/rating/placements/streak/record), the MATCHMAKING console
// (Power-bracket search with the honest 20s window → seamless AI fallback), the wins-only
// 100-level Arena Pass track with claims + the premium door, the season-exclusive showcase,
// closed-season history, and the rank benefits (idle dividend) chip.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import type { ArenaHubView } from '../state/meta';
import { ARENA, matchSearchState } from '../core/arena';
import { ARENA_PASS } from '../core/arenaPass';
import { generateAiOpponent } from '../core/arenaAi';
import type { ArenaMatchSetup } from '../core/arenaMatch';
import { rewardShort } from '../core/battlePass';
import { CurrencyIcon } from './components/CurrencyIcon';

/** Deterministic-enough match id (local matches; the server treats it as an opaque dedupe key). */
function newMatchId(): string {
  return `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

export function ArenaScreen({ onLaunchMatch }: { onLaunchMatch: (setup: ArenaMatchSetup) => void }): JSX.Element {
  meta.use(); // re-render on every persist (claims/settles/premium)
  const view: ArenaHubView = meta.arenaView();
  const [tab, setTab] = useState<'ladder' | 'pass'>('ladder');
  // ── The queue ──
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const searchRef = useRef<number | null>(null);
  const seedRef = useRef(0);

  useEffect(() => {
    meta.pollArenaSeason(); // materialize season rolls + decay on entry
  }, []);

  // The search clock: brackets widen across the window; at its end the AI opponent takes the
  // slot with the same handshake — the transition is seamless by design (docs/ARENA.md §2).
  useEffect(() => {
    if (!searching) return;
    const startedAt = performance.now();
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const tick = (): void => {
      const t = (performance.now() - startedAt) / 1000;
      setElapsed(t);
      if (t >= ARENA.searchSec) {
        // No relay configured / no human in bracket — the AI opponent fills the slot.
        const ai = generateAiOpponent(seedRef.current, view.power, view.divisionIndex);
        const setup: ArenaMatchSetup = {
          matchId: newMatchId(),
          seed: (seedRef.current ^ 0xa54ff53a) >>> 0,
          season: view.season.index,
          local: meta.arenaBootBundle(),
          remote: ai.boot,
          vsAi: true,
          ai,
          localPower: view.power,
          oppPower: ai.power,
          oppRating: ai.rating,
        };
        setSearching(false);
        onLaunchMatch(setup);
        return;
      }
      searchRef.current = requestAnimationFrame(tick);
    };
    searchRef.current = requestAnimationFrame(tick);
    return () => {
      if (searchRef.current !== null) cancelAnimationFrame(searchRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  const search = searching ? matchSearchState(elapsed, view.power) : null;
  const winRate = view.wins + view.losses > 0 ? Math.round((view.wins / (view.wins + view.losses)) * 100) : 0;
  const endsDays = Math.max(0, Math.floor(view.season.endsInMs / 86_400_000));
  const endsHours = Math.max(0, Math.floor((view.season.endsInMs % 86_400_000) / 3_600_000));

  return (
    <div className="scr" data-tut="arena" style={{ ['--acc' as string]: view.season.accent }}>
      <header className="scr-head">
        <div>
          <h2>{view.season.glyph} THE PROVING GROUNDS</h2>
          <p className="muted">
            Season {view.season.index} — <b style={{ color: view.season.accent }}>{view.season.name}</b> · ends in {endsDays}d {endsHours}h · {view.season.tagline}
          </p>
        </div>
      </header>

      {/* ── The ranked emblem + queue console ── */}
      <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', borderColor: view.division.color }}>
        <div style={{ textAlign: 'center', minWidth: 130 }}>
          <div style={{ fontSize: 44, color: view.division.color, lineHeight: 1 }}>{view.division.glyph}</div>
          <div style={{ fontWeight: 700, color: view.division.color }}>{view.division.name}</div>
          <div className="muted">{view.rating} rating{view.peak > view.rating ? ` · peak ${view.peak}` : ''}</div>
          {view.placementsLeft > 0 && <div className="muted">PLACEMENTS — {view.placementsLeft} to go</div>}
          {view.nextDivision && (
            <div className="muted" style={{ fontSize: 12 }}>
              next: {view.nextDivision.name} @ {view.nextDivision.minRating}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><b>{view.wins}</b> W — <b>{view.losses}</b> L{view.wins + view.losses > 0 ? ` (${winRate}%)` : ''}</span>
            {view.streak > 1 && <span style={{ color: 'var(--gold, #ffd24d)' }}>🔥 {view.streak} streak</span>}
            <span className="muted">lifetime {view.lifetimeWins}–{view.lifetimeLosses}</span>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Rank benefits: Idle Harvest ×{view.idle.dividend.toFixed(3)}
            {view.idle.capBonusHours > 0 ? ` · +${view.idle.capBonusHours}h storage` : ''} (diminishing, capped)
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            The mirror siege race: both hives fight the same assault — the survivor takes the rating. No Mega Bosses; wins pay Bio-Containers + a Run Cache and are the ONLY pass progress.
          </div>
        </div>
        <div style={{ minWidth: 230 }}>
          {!searching ? (
            <button className="primary" style={{ width: '100%', padding: '14px 18px', fontSize: 16 }} onClick={() => { setElapsed(0); setSearching(true); }}>
              ⚔ ENTER THE ARENA
            </button>
          ) : (
            <div className="panel" style={{ padding: 10, textAlign: 'center' }}>
              <div style={{ letterSpacing: 2, color: view.season.accent }}>
                SEARCHING{'.'.repeat(1 + (Math.floor(elapsed * 2) % 3))}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Power bracket {search!.powerLow.toLocaleString('en-US')} – {search!.powerHigh.toLocaleString('en-US')} (widening)
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, margin: '8px 0' }}>
                <div style={{ height: '100%', width: `${Math.round(search!.frac * 100)}%`, background: view.season.accent, borderRadius: 3, transition: 'width 120ms linear' }} />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                est. wait ≤ {ARENA.searchSec}s · opponent guaranteed in {Math.ceil(search!.aiInSec)}s
              </div>
              <button style={{ marginTop: 8 }} onClick={() => setSearching(false)}>Cancel</button>
            </div>
          )}
        </div>
      </section>

      {/* ── Tabs: ladder detail / the pass ── */}
      <nav style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button className={tab === 'ladder' ? 'primary' : ''} onClick={() => setTab('ladder')}>LADDER</button>
        <button className={tab === 'pass' ? 'primary' : ''} onClick={() => setTab('pass')}>
          ARENA PASS — LV {view.pass.level}
          {view.pass.claimableFree.length + view.pass.claimablePremium.length > 0 ? ` (${view.pass.claimableFree.length + view.pass.claimablePremium.length} to claim)` : ''}
        </button>
      </nav>

      {tab === 'ladder' && (
        <section className="panel">
          <h3>SEASON HISTORY</h3>
          {view.history.length === 0 && <p className="muted">No closed seasons yet — this one is the first record.</p>}
          {view.history.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {[...view.history].reverse().map((h) => (
                <li key={h.season} style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
                  <span className="muted">Season {h.season}</span>
                  <b>{h.division}</b>
                  <span>{h.rating} rating</span>
                  <span className="muted">{h.wins}–{h.losses}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'pass' && (
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>THE ARENA PASS — wins only</h3>
              <p className="muted" style={{ margin: '4px 0' }}>
                Level {view.pass.level} / {ARENA_PASS.levels} · {view.pass.into}/{view.pass.need} XP · every WIN pays {ARENA.winPassXp} XP — losses pay none.
              </p>
            </div>
            {!view.pass.premium && (
              <button
                className="primary"
                onClick={() => meta.buyArenaPassPremium()}
                title={`Unlock the premium lane for ${view.pass.premiumPrice} Ichor`}
              >
                UNLOCK PREMIUM — {view.pass.premiumPrice} <CurrencyIcon id="ichor" />
              </button>
            )}
          </div>

          <div className="panel" style={{ margin: '10px 0', borderColor: view.season.accent }}>
            <b style={{ color: view.season.accent }}>THE SEASON CROWN — LEVEL 100:</b> {view.pass.exclusiveLabel}
            {view.pass.exclusiveOwned && <span style={{ color: 'var(--gold, #ffd24d)' }}> ✓ CLAIMED — yours forever</span>}
            <div className="muted" style={{ fontSize: 12 }}>
              Arena-exclusive. No shards, no market, no containers — the grind is the only door. Next seasons rotate the other two crowns.
            </div>
          </div>

          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr className="muted"><th style={{ textAlign: 'left' }}>LV</th><th style={{ textAlign: 'left' }}>FREE</th><th style={{ textAlign: 'left' }}>PREMIUM</th></tr>
              </thead>
              <tbody>
                {view.pass.track.map((row, i) => {
                  const level = i + 1;
                  const reached = level <= view.pass.level;
                  const freeClaimed = view.pass.claimedFree.has(level);
                  const premClaimed = view.pass.claimedPremium.has(level);
                  return (
                    <tr key={level} style={{ opacity: reached ? 1 : 0.55, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '4px 6px', color: level === 100 ? view.season.accent : undefined }}><b>{level}</b></td>
                      <td style={{ padding: '4px 6px' }}>
                        {row.free.map((r, j) => <span key={j} className="muted" style={{ marginRight: 8 }}>{rewardShort(r)}</span>)}
                        {reached && !freeClaimed && (
                          <button onClick={() => meta.claimArenaPassLevel('free', level)}>CLAIM</button>
                        )}
                        {freeClaimed && <span style={{ color: 'var(--vital, #7fd08f)' }}>✓</span>}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        {row.exclusive && <b style={{ color: view.season.accent, marginRight: 8 }}>★ {view.pass.exclusiveLabel}</b>}
                        {row.premium.map((r, j) => <span key={j} className="muted" style={{ marginRight: 8 }}>{rewardShort(r)}</span>)}
                        {reached && view.pass.premium && !premClaimed && (
                          <button onClick={() => meta.claimArenaPassLevel('premium', level)}>CLAIM</button>
                        )}
                        {premClaimed && <span style={{ color: 'var(--vital, #7fd08f)' }}>✓</span>}
                        {!view.pass.premium && !premClaimed && <span className="muted">🔒</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
