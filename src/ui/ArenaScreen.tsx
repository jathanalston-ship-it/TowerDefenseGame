// THE PROVING GROUNDS (docs/ARENA.md) — the arena hub screen: season identity + countdown,
// the ranked emblem (division/rating/placements/streak/record), the MATCHMAKING console
// (Power-bracket search with the honest 20s window → seamless AI fallback), the wins-only
// 100-level Arena Pass track with claims + the premium door, the season-exclusive showcase,
// closed-season history, and the rank benefits (idle dividend) chip.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import type { ArenaHubView } from '../state/meta';
import { ARENA, aiFallbackPower, matchSearchState } from '../core/arena';
import { ARENA_PASS } from '../core/arenaPass';
import { generateAiOpponent } from '../core/arenaAi';
import type { ArenaMatchSetup } from '../core/arenaMatch';
import { PROTOCOL_VERSION, loadoutFingerprint } from '../core/online';
import { rewardShort } from '../core/battlePass';
import { arenaRelayUrl } from '../net/arenaTransport';
import type { ArenaTransport } from '../net/arenaTransport';
import { findArenaOpponent, findPrivateMatch } from '../net/arenaMatchmaker';
import type { MatchmakerHandle } from '../net/arenaMatchmaker';
import { fetchArenaLadder } from '../net/arenaReport';
import type { ArenaLadderView } from '../net/arenaReport';
import { myDesignationTag, playerId } from '../net/identity';
import { humanMatchmakingPref, setHumanMatchmakingPref } from '../state/prefs';
import { CurrencyIcon } from './components/CurrencyIcon';

/** Deterministic-enough match id (local matches; the server treats it as an opaque dedupe key). */
function newMatchId(): string {
  return `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

export function ArenaScreen({ onLaunchMatch }: { onLaunchMatch: (setup: ArenaMatchSetup, transport?: ArenaTransport) => void }): JSX.Element {
  const save = meta.use(); // re-render on every persist (claims/settles/premium)
  const view: ArenaHubView = meta.arenaView();
  const [tab, setTab] = useState<'ladder' | 'pass'>('ladder');
  // ── The queue ──
  const [searching, setSearching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const searchRef = useRef<number | null>(null);
  const seedRef = useRef(0);
  // Human matchmaking is ON by default wherever a relay lives; the opt-out is honored but
  // hardened (docs/ARENA.md §toggle) — the sparring construct generates at a Power premium.
  const [humanMM, setHumanMM] = useState(humanMatchmakingPref);
  const relayLive = arenaRelayUrl() !== null;
  const toggleHumanMM = (on: boolean): void => {
    if (searching) return; // the queue reads the pref at entry — no mid-search flips
    setHumanMatchmakingPref(on);
    setHumanMM(on);
  };
  const premiumPct = Math.round((ARENA.aiOptOutPowerPremium - 1) * 100);
  // ── PRIVATE BOUT (docs/ARENA.md §private) — friendly, unrated, over a shared room code ──
  const [pmCode, setPmCode] = useState('');
  const [pmWaiting, setPmWaiting] = useState(false);
  const pmRef = useRef<MatchmakerHandle | null>(null);
  useEffect(() => () => { pmRef.current?.cancel(); }, []); // navigating away abandons the room
  const startPrivate = (): void => {
    const relay = arenaRelayUrl();
    const code = pmCode.trim();
    if (!relay || code.length < 3 || pmWaiting || searching) return;
    const boot = meta.arenaBootBundle();
    setPmWaiting(true);
    const mm = findPrivateMatch({
      url: relay,
      season: view.season.index,
      power: view.power,
      code,
      hello: {
        proto: PROTOCOL_VERSION, playerId: playerId(), name: save.profileName, tag: myDesignationTag(),
        power: view.power, rating: view.rating, season: view.season.index, heroKind: boot.heroKind,
      },
      loadout: {
        fingerprint: loadoutFingerprint(boot.opts.unlocked ?? [], [boot.heroKind], view.power),
        towerKinds: boot.opts.unlocked ?? [],
        heroKinds: [boot.heroKind],
      },
      boot,
    });
    pmRef.current = mm;
    void mm.promise.then((hm) => {
      setPmWaiting(false);
      pmRef.current = null;
      if (!hm) return; // cancelled / refused — stay on the console
      onLaunchMatch({
        matchId: hm.matchId,
        seed: hm.seed,
        season: view.season.index,
        local: boot,
        remote: hm.remoteBoot,
        vsAi: false,
        friendly: true, // §private: full ruleset, zero settlement
        localPower: view.power,
        oppPower: hm.oppHello.power,
        oppRating: hm.oppHello.rating,
        oppName: `${hm.oppHello.name}${hm.oppHello.tag}`,
      }, hm.transport);
    });
  };

  // ── The season ladder (docs/ARENA.md §ladder) — fetched fail-soft on the ladder tab ──
  const [ladder, setLadder] = useState<ArenaLadderView | null | 'loading'>('loading');
  useEffect(() => {
    if (tab !== 'ladder') return;
    let live = true;
    setLadder('loading');
    void fetchArenaLadder().then((v) => { if (live) setLadder(v); });
    return () => { live = false; };
  }, [tab]);

  useEffect(() => {
    meta.pollArenaSeason(); // materialize season rolls + decay on entry
  }, []);

  // The search clock: brackets widen across the window; at its end the AI opponent takes the
  // slot with the same handshake — the transition is seamless by design (docs/ARENA.md §2).
  // With a relay configured (VITE_ARENA_RELAY_URL) the window RACES the human lane: the
  // matchmaker hunts a bracket-fair human over the relay; whichever clock lands first owns
  // the launch, and the loser is cancelled (docs/ONLINE-FOUNDATION.md §relay).
  useEffect(() => {
    if (!searching) return;
    const startedAt = performance.now();
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    let done = false;
    const boot = meta.arenaBootBundle();
    const relay = arenaRelayUrl();
    // The human lane runs only when a relay exists AND the player hasn't opted out. Opting
    // out is a CHOICE (§toggle): the queue resolves fast, but the construct is hardened.
    const wantHumans = relay !== null && humanMM;
    const optedOut = relay !== null && !humanMM;
    const windowSec = wantHumans ? ARENA.searchSec : ARENA.aiOnlySearchSec;
    const mm = wantHumans && relay
      ? findArenaOpponent({
          url: relay,
          season: view.season.index,
          power: view.power,
          hello: {
            proto: PROTOCOL_VERSION, playerId: playerId(), name: save.profileName, tag: myDesignationTag(),
            power: view.power, rating: view.rating, season: view.season.index, heroKind: boot.heroKind,
          },
          loadout: {
            fingerprint: loadoutFingerprint(boot.opts.unlocked ?? [], [boot.heroKind], view.power),
            towerKinds: boot.opts.unlocked ?? [],
            heroKinds: [boot.heroKind],
          },
          boot,
        })
      : null;
    if (mm) {
      void mm.promise.then((hm) => {
        if (!hm) return; // refused/cancelled — the window clock owns the fallback
        if (done) {
          hm.transport.close(); // the AI landed first in the race's final frame
          return;
        }
        done = true;
        setSearching(false);
        onLaunchMatch({
          matchId: hm.matchId,
          seed: hm.seed,
          season: view.season.index,
          local: boot,
          remote: hm.remoteBoot,
          vsAi: false,
          localPower: view.power,
          oppPower: hm.oppHello.power,
          oppRating: hm.oppHello.rating,
          oppName: `${hm.oppHello.name}${hm.oppHello.tag}`,
        }, hm.transport);
      });
    }
    const tick = (): void => {
      const t = (performance.now() - startedAt) / 1000;
      setElapsed(t);
      if (t >= windowSec) {
        // No human found (or none wanted) — the AI opponent fills the slot. A voluntary
        // opt-out faces the HARDENED build (aiFallbackPower); the involuntary fallback
        // fights at parity. The Elo stake is identical either way (§toggle).
        if (done) return;
        done = true;
        mm?.cancel();
        const ai = generateAiOpponent(seedRef.current, aiFallbackPower(view.power, optedOut), view.divisionIndex);
        const setup: ArenaMatchSetup = {
          matchId: newMatchId(),
          seed: (seedRef.current ^ 0xa54ff53a) >>> 0,
          season: view.season.index,
          local: boot,
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
      if (!done) mm?.cancel(); // navigated away / cancelled the queue mid-search
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  const search = searching ? matchSearchState(elapsed, view.power) : null;
  const winRate = view.wins + view.losses > 0 ? Math.round((view.wins / (view.wins + view.losses)) * 100) : 0;
  const endsDays = Math.max(0, Math.floor(view.season.endsInMs / 86_400_000));
  const endsHours = Math.max(0, Math.floor((view.season.endsInMs % 86_400_000) / 3_600_000));

  return (
    <div className="scr" data-tut="arena" data-guide="arena-console" style={{ ['--acc' as string]: view.season.accent }}>
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
            <>
              <button className="primary" style={{ width: '100%', padding: '14px 18px', fontSize: 16 }} onClick={() => { setElapsed(0); setSearching(true); }}>
                ⚔ ENTER THE ARENA
              </button>
              {relayLive && (
                /* The opponent preference (§toggle) — shown only where a relay makes it real. */
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12 }}>OPPONENTS</span>
                  <button
                    className={humanMM ? 'primary' : ''}
                    style={{ minHeight: 24, fontSize: 12 }}
                    onClick={() => toggleHumanMM(true)}
                    title="Search for humans; the AI takes the slot if none is found inside the window"
                  >
                    HUMANS + AI
                  </button>
                  <button
                    className={!humanMM ? 'primary' : ''}
                    style={{ minHeight: 24, fontSize: 12 }}
                    onClick={() => toggleHumanMM(false)}
                    title={`Skip the human queue — the sparring construct runs a hardened build (+${premiumPct}% Power, same rating stakes)`}
                  >
                    AI ONLY
                  </button>
                  {!humanMM && <span className="muted" style={{ fontSize: 12 }}>hardened construct +{premiumPct}%</span>}
                </div>
              )}
            </>
          ) : (
            <div className="panel" style={{ padding: 10, textAlign: 'center' }}>
              {relayLive && humanMM ? (
                <>
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
                </>
              ) : (
                <>
                  <div style={{ letterSpacing: 2, color: view.season.accent }}>
                    ENGAGING CONSTRUCT{'.'.repeat(1 + (Math.floor(elapsed * 2) % 3))}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {relayLive
                      ? `Human queue skipped — hardened sparring construct (+${premiumPct}% Power, same stakes).`
                      : 'A sparring construct takes the slot — it fields a real build and plays the real sim.'}
                  </div>
                </>
              )}
              <button style={{ marginTop: 8 }} onClick={() => setSearching(false)}>Cancel</button>
            </div>
          )}
        </div>
      </section>

      {/* ── PRIVATE BOUT (docs/ARENA.md §private) — spar a friend by shared code; unrated ── */}
      <section className="panel" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ minWidth: 180 }}>
          <b>PRIVATE BOUT</b>
          <div className="muted" style={{ fontSize: 12 }}>
            {arenaRelayUrl()
              ? 'Agree on a code with a friend — both enter it. Friendly: no rating, no rewards.'
              : 'Needs a live relay — sparring opens when one is configured.'}
          </div>
        </div>
        {arenaRelayUrl() && !pmWaiting && (
          <>
            <input
              value={pmCode}
              onChange={(e) => setPmCode(e.target.value)}
              maxLength={12}
              placeholder="ROOM CODE"
              aria-label="Private bout room code"
              style={{ width: 140, textTransform: 'uppercase' }}
            />
            <button className="primary" disabled={pmCode.trim().length < 3 || searching} onClick={startPrivate}>
              ⚔ SPAR
            </button>
          </>
        )}
        {pmWaiting && (
          <>
            <span style={{ color: view.season.accent }}>WAITING — share the code “{pmCode.trim().toUpperCase()}”…</span>
            <button onClick={() => pmRef.current?.cancel()}>Cancel</button>
          </>
        )}
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
          <h3>THE SEASON LADDER</h3>
          {ladder === 'loading' && <p className="muted">Reading the ladder…</p>}
          {ladder === null && <p className="muted">The ladder needs the network — offline and guest hives fight unlisted.</p>}
          {ladder !== null && ladder !== 'loading' && (
            <>
              {ladder.entries.length === 0 && <p className="muted">No settled matches this season yet — the first report takes rank 1.</p>}
              {ladder.entries.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 260, overflowY: 'auto' }}>
                  {ladder.entries.map((e) => (
                    <li key={e.rank} style={{ display: 'flex', gap: 10, padding: '3px 0', alignItems: 'baseline' }}>
                      <span className="muted" style={{ minWidth: 28, textAlign: 'right' }}>#{e.rank}</span>
                      <b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || 'Unnamed Hive'} <span className="muted">#{e.tag}</span></b>
                      <span style={{ marginLeft: 'auto' }}>{e.rating}</span>
                      <span className="muted">{e.division}</span>
                      <span className="muted">{e.wins}–{e.losses}</span>
                    </li>
                  ))}
                </ul>
              )}
              {ladder.you && (
                <p style={{ marginTop: 8 }}>
                  Your standing: <b>#{ladder.you.rank}</b> at {ladder.you.rating} rating ({ladder.you.wins}–{ladder.you.losses}).
                </p>
              )}
            </>
          )}
        </section>
      )}

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
