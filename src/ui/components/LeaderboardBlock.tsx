// Global standings block (Daily / Boss Rush screens). Fail-soft: offline or
// unconfigured backends render a quiet one-liner, never an error state. On
// mount it also submits the player's newest personal best (server keeps best;
// resubmits are harmless). docs/DEPLOYMENT.md §leaderboards.

import { useEffect, useState } from 'react';
import { fetchTop, maybeSubmitBest } from '../../net/leaderboard';
import type { LbMode, LbView } from '../../net/leaderboard';

export function LeaderboardBlock({ mode }: { mode: LbMode }): JSX.Element {
  const [view, setView] = useState<LbView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');

  useEffect(() => {
    let alive = true;
    void (async () => {
      await maybeSubmitBest(mode); // best-effort; server keeps max
      const v = await fetchTop(mode);
      if (!alive) return;
      if (v) { setView(v); setState('ready'); }
      else setState('offline');
    })();
    return () => { alive = false; };
  }, [mode]);

  return (
    <div className="lbblock panel">
      <div className="panel-title">Global standings</div>
      {state === 'loading' && <div className="lb-note">Contacting the network…</div>}
      {state === 'offline' && <div className="lb-note">Standings unavailable offline — your runs still count locally.</div>}
      {state === 'ready' && view && (
        <>
          <div className="panel-sub">
            {mode === 'daily' ? `Today · ${view.dayKey} (UTC)` : 'All-time deepest gauntlets'} · {view.total} {view.total === 1 ? 'entry' : 'entries'}
          </div>
          {view.entries.length === 0 && <div className="lb-note">No entries yet — be the first.</div>}
          {view.entries.length > 0 && (
            <table className="lb-table">
              <tbody>
                {view.entries.map((e) => (
                  <tr key={e.rank}>
                    <td className="lb-rank">#{e.rank}</td>
                    <td className="lb-name">{e.name}</td>
                    <td className="lb-score">{mode === 'daily' ? `wave ${e.score}` : `${e.score} bosses`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view.you && <div className="lb-you">Your best: #{view.you.rank} · {mode === 'daily' ? `wave ${view.you.score}` : `${view.you.score} bosses`}</div>}
        </>
      )}
    </div>
  );
}
