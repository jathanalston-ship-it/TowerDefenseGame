// Global standings block (Daily / Boss Rush screens). Fail-soft: offline or
// unconfigured backends render a quiet one-liner, never an error state. On
// mount it also submits the player's newest personal best (server keeps best;
// resubmits are harmless). docs/DEPLOYMENT.md §leaderboards.

import { useEffect, useState } from 'react';
import { fetchTop, maybeSubmitBest } from '../../net/leaderboard';
import type { LbMode, LbView } from '../../net/leaderboard';
import { romanNumeral } from '../../core/genomeRank';
import './LeaderboardBlock.css';

/** Per-mode display strings — the account boards carry XP as `score` and LEVEL as `wave`. */
const LB_STRINGS: Record<LbMode, { context: (v: LbView) => string; score: (e: { score: number; wave: number }) => string }> = {
  daily: { context: (v) => `Today · ${v.dayKey} (UTC)`, score: (e) => `wave ${e.score}` },
  bossRush: { context: () => 'All-time deepest gauntlets', score: (e) => `${e.score} bosses` },
  accountLevel: { context: () => 'All-time account levels', score: (e) => `LV ${e.wave}` },
  weeklyXp: { context: (v) => `This week · ${v.dayKey}`, score: (e) => `${e.score.toLocaleString()} XP` },
  monthlyXp: { context: (v) => `This month · ${v.dayKey}`, score: (e) => `${e.score.toLocaleString()} XP` },
  genomeRating: { context: () => 'All-time Genome Ratings', score: (e) => `${romanNumeral(e.wave)} · ${e.score.toLocaleString()}` },
};

export function LeaderboardBlock({ mode }: { mode: LbMode }): JSX.Element {
  const [view, setView] = useState<LbView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('loading');
    setView(null);
    void (async () => {
      await maybeSubmitBest(mode); // best-effort; server keeps max
      const v = await fetchTop(mode);
      if (!alive) return;
      if (v) { setView(v); setState('ready'); }
      else setState('offline');
    })();
    return () => { alive = false; };
  }, [mode, request]);

  return (
    <div className="lbblock panel" aria-busy={state === 'loading'}>
      <div className="lb-heading">
        <div className="panel-title">Global standings</div>
        <button type="button" disabled={state === 'loading'} onClick={() => setRequest(n => n + 1)}>
          {state === 'loading' ? 'Loading standings…' : state === 'offline' ? 'Retry standings' : 'Refresh standings'}
        </button>
      </div>
      <div className="lb-note" role="status">
        {state === 'loading' ? 'Contacting the network…' : state === 'offline'
          ? 'Standings are unavailable right now. Your runs still count locally.'
          : view?.mode === mode ? `${LB_STRINGS[mode].context(view)} · ${view.total} ${view.total === 1 ? 'entry' : 'entries'}` : 'Contacting the network…'}
      </div>
      {state === 'ready' && view?.mode === mode && (
        <>
          {view.entries.length === 0 && <div className="lb-note">No entries yet — be the first.</div>}
          {view.entries.length > 0 && (
            <table className="lb-table" aria-label="Global standings">
              <thead><tr><th scope="col">Rank</th><th scope="col">Commander</th><th scope="col">Result</th></tr></thead>
              <tbody>
                {view.entries.map((e) => (
                  <tr key={e.rank}>
                    <td className="lb-rank">#{e.rank}</td>
                    <td className="lb-name">
                      {e.name}
                      {e.tag && <i className="lb-tag" title="Register number — commanders may share a name; this stays theirs">#{e.tag}</i>}
                    </td>
                    <td className="lb-score">{LB_STRINGS[mode].score(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view.you && <div className="lb-you">Your best: #{view.you.rank} · {LB_STRINGS[mode].score(view.you)}</div>}
        </>
      )}
    </div>
  );
}
