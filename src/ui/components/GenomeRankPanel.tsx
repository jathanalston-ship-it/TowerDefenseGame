// Genome Rank surfaces (docs/GENOME-RANK.md §presentation) — the Profile emblem block
// (rank + rating bar + contribution breakdown + the Progress Advisor) and the full-screen
// PROMOTION cinematic. The rating itself stays understated ("hidden" per the design); the
// RANK is the loud, prestigious thing.

import { useEffect, useState } from 'react';
import { meta } from '../../state/meta';
import type { GenomePromotion } from '../../state/meta';
import { audio } from '../../audio/sound';
import { telemetry } from '../../net/telemetry';

const CATEGORY_COLOR: Record<string, string> = {
  journey: 'var(--caustic)',
  strength: 'var(--gold)',
  arsenal: 'var(--kinetic)',
  identity: 'var(--viral)',
};

/** The Profile block: emblem, progress to the next rank, top contributions, and the Advisor. */
export function GenomeRankPanel({ onNavigate }: { onNavigate?: (nav: string) => void }): JSX.Element {
  meta.use();
  const v = meta.genomeRank();
  const rows = meta.genomeBreakdown().slice(0, 6);
  const advice = meta.genomeAdvice(3);
  const pct = Math.min(100, Math.round((v.into / Math.max(1, v.need)) * 100));
  const maxRating = Math.max(1, ...rows.map((r) => r.rating));
  return (
    <section className="pf-block grk" aria-label="Genome Rank">
      <div className="pf-h">Genome Rank</div>
      <div className="grk-head">
        <div className="grk-emblem" aria-hidden><span className="grk-numeral">{v.numeral}</span></div>
        <div className="grk-id">
          <span className="grk-name">{v.name}</span>
          <span className="grk-sub">Genome Rating <b>{v.rating.toLocaleString()}</b> · next rank at {v.next.toLocaleString()}</span>
          <span className="grk-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
        </div>
      </div>
      <div className="grk-cols">
        <div className="grk-break" aria-label="Top rating contributions">
          <div className="grk-k">Top contributions</div>
          {rows.map((r) => (
            <div className="grk-row" key={r.id} title={`${r.name} — ${Math.round(r.share * 100)}% of your rating`}>
              <span className="grk-row-k">{r.name}</span>
              <span className="grk-row-bar" aria-hidden><i style={{ width: `${Math.round((r.rating / maxRating) * 100)}%`, background: CATEGORY_COLOR[r.category] }} /></span>
              <span className="grk-row-v">{Math.round(r.rating)}</span>
            </div>
          ))}
        </div>
        <div className="grk-advisor" aria-label="Genome Progress Advisor">
          <div className="grk-k">Easiest rating ahead</div>
          {advice.map((a) => (
            <button type="button" className="grk-adv" key={a.id} onClick={() => onNavigate?.(a.nav)}>
              <span className="grk-adv-gain">+{Math.round(a.potential)}</span>
              <span className="grk-adv-hint">{a.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Full-screen promotion cinematic — drains the meta queue on the menu, one rank at a time. */
export function GenomePromotionCinematic(): JSX.Element | null {
  meta.use(); // promotions can land from any persist (settles poll in finishRun; menu grants poll in drain)
  const [queue, setQueue] = useState<GenomePromotion[]>([]);
  useEffect(() => {
    const fresh = meta.drainGenomePromotions();
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh]);
  });
  const p = queue.length > 0 ? queue[0] : null;
  useEffect(() => {
    if (p) {
      audio.cue('promotion');
      telemetry.emit('rank', { d: `r${p.index}` }); // Genome Rank milestone lane
    }
  }, [p?.index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const dismiss = (): void => setQueue((q) => q.slice(1));
  const r = p.reward;
  const rewards = [
    `+${r.cores.toLocaleString()} Genome Cores`,
    ...(r.ichor > 0 ? [`+${r.ichor} Ichor`] : []),
    ...(r.containers.length > 0 ? [`${r.containers.length} premium Bio-Container${r.containers.length > 1 ? 's' : ''}`] : []),
    `Title: ${p.name} ${p.numeral}`,
  ];
  return (
    <div className="evo-unlock grk-cine" role="dialog" aria-label="Genome Rank promotion" onClick={dismiss}>
      <div className="evo-rays" aria-hidden />
      <div className="evo-card grk-cine-card" onClick={(e) => e.stopPropagation()}>
        <div className="evo-eyebrow">⟁ Genome Rank Promotion ⟁</div>
        <div className="grk-cine-emblem" aria-hidden><span>{p.numeral}</span></div>
        <h2 className="evo-title">{p.name}</h2>
        <p className="evo-blurb">The organism has outgrown its previous designation. Every system you master feeds the Genome.</p>
        <div className="grk-cine-rewards">
          {rewards.map((line) => <div className="grk-cine-r" key={line}>✦ {line}</div>)}
        </div>
        <button className="primary evo-continue" onClick={dismiss}>Continue</button>
      </div>
    </div>
  );
}
