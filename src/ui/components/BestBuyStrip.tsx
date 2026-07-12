// BEST-VALUE STRIP (docs/POWER-SCORE.md §advisor) — the one-line answer to "which of these
// upgrades is the best Power per currency?" mounted atop every many-options surface (Gene
// Archive, Evolution HQ, Tower Lab, Hero Lab). Exact math: state/bestPurchase.ts diffs the real
// Power scorer per candidate. Shows the best AFFORDABLE pick with a QUICK-BUY (routes through
// executePurchase → the same guarded meta action the screen's own button calls, so the strip
// self-advances to the next pick after each buy); when the overall champion is out of wallet
// range it rides along as the "save for" tease. Memoized per save revision — the hypothetical
// scoring never runs during animation frames.

import { useMemo } from 'react';
import { meta } from '../../state/meta';
import { bestPurchase, executePurchase } from '../../state/bestPurchase';
import type { PurchaseSurface } from '../../state/bestPurchase';
import { audio } from '../../audio/sound';

export function BestBuyStrip({ surface }: { surface: PurchaseSurface }): JSX.Element | null {
  const save = meta.use();
  const { best, bestAffordable } = useMemo(() => bestPurchase(save, surface), [save, surface]);
  if (!best) return null; // nothing upgradeable — the strip stays silent
  const pick = bestAffordable ?? best;
  const fmt = (n: number): string => (n >= 10 ? String(Math.round(n)) : n.toFixed(1));
  return (
    <div className="bbs" role="note" aria-label="Best value purchase">
      <span className="bbs-k">⚡ BEST VALUE</span>
      <span className="bbs-pick">
        <b>{pick.label}</b> — +{fmt(pick.powerDelta)} Power for {pick.buyLabel}
        {!pick.affordable && <i className="bbs-save"> · save up</i>}
      </span>
      {pick.affordable && (
        <button
          className="bbs-buy"
          title={`Buy ${pick.label} — ${pick.buyLabel} (+${fmt(pick.powerDelta)} Power)`}
          onClick={() => { if (executePurchase(surface, pick.id)) audio.cue('ui'); }}
        >
          Buy
        </button>
      )}
      {bestAffordable && best.id !== bestAffordable.id && (
        <span className="bbs-next" title="The strongest value on this screen once you can afford it">
          next: <b>{best.label}</b> (+{fmt(best.powerDelta)} for {best.buyLabel})
        </span>
      )}
    </div>
  );
}
