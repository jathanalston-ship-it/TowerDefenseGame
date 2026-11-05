// Power comparison chip — ▲ Better / ▼ Worse / = Same vs the currently-equipped item in a slot,
// with the Power Score difference ("+37 Power"). One presentational component reused on inventory
// cards, the Compare overlay, and the Vault reveal, so "is this an upgrade?" reads the same way
// everywhere. Pure — hand it a PowerCompare (from state/itemPower).

import { formatPower } from '../../core/power';
import type { PowerCompare } from '../../state/itemPower';
import './PowerDelta.css';

const SYM: Record<PowerCompare['verdict'], string> = { better: '▲', worse: '▼', same: '=' };
const WORD: Record<PowerCompare['verdict'], string> = { better: 'Stronger', worse: 'Weaker', same: 'Equal' };

export function PowerDelta({ cmp, compact = false }: { cmp: PowerCompare; compact?: boolean }): JSX.Element {
  const sign = cmp.delta > 0 ? '+' : cmp.delta < 0 ? '−' : '±';
  const mag = formatPower(Math.abs(cmp.delta));
  const title = cmp.equippedName
    ? `${WORD[cmp.verdict]} than equipped ${cmp.equippedName} · ${sign}${mag} Power (this ${formatPower(cmp.candidate)} vs ${formatPower(cmp.equipped)})`
    : `Empty slot — ${formatPower(cmp.candidate)} Power if equipped`;
  return (
    <span className={`pdelta is-${cmp.verdict}`} title={title} aria-label={title}>
      <span className="pdelta-sym" aria-hidden>{SYM[cmp.verdict]}</span>
      {sign}{mag}{compact ? '' : ' Power'}
    </span>
  );
}
