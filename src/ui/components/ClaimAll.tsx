// CLAIM ALL — the ONE batch-claim control (docs/NOTIFICATIONS.md §claim-all). Every screen that
// holds a stack of no-choice claims (Quest Board missions, Season Pass levels, Milestones tiers)
// offers the same words, glyph and shape: "✹ Claim all (N)". Presentation + one callback only —
// each screen keeps its own claim logic, ledger and celebration (the component never claims).
// Ceremonial claims (quest FINALES, Evolution EVOLVE) are never batched: they stay manual.

import type { MouseEvent } from 'react';

export function ClaimAll({
  count,
  onClaim,
  guide,
  className,
}: {
  count: number; // claimable right now; 0 renders disabled (screens that hide it simply don't mount it)
  onClaim: (e: MouseEvent<HTMLButtonElement>) => void; // the click rides along (a screen's burst origin)
  guide?: string; // data-guide anchor for a Guided Unlock step
  className?: string; // a screen's own placement hook (never restyles the pattern)
}): JSX.Element {
  return (
    <button
      type="button"
      className={`primary act-claim claim-all${className ? ` ${className}` : ''}`}
      data-guide={guide}
      disabled={count <= 0}
      onClick={onClaim}
    >
      Claim all{count > 0 ? ` (${count})` : ''}
    </button>
  );
}
