// IDLE HARVEST surfaces (docs/IDLE-HARVEST.md §presentation). Two exports:
//  · HarvestScreen — the hub screen: the living hopper (veins filling toward the cap), the
//    COLLECT action, the infinite evolution tree (gates as work-toward labels, never grey-outs),
//    the drop table (eligible vs progression-locked rows) and the lifetime ledger.
//  · HarvestArrival — the RETURN ceremony: auto-offers a ripe harvest once per session; the
//    collect plays pods-bursting + staggered reward flyouts + stats (time away, efficiency)
//    and ends on a "grow this next" suggestion. Never a boring popup.

import { useState } from 'react';
import { meta } from '../state/meta';
import type { IdleHarvestReceipt, IdleHarvestView, IdleNodeView } from '../state/meta';
import { fmtIdleHours } from '../state/meta';
import { IDLE } from '../core/config';
import { audio } from '../audio/sound';
import { CurrencyIcon } from './components/CurrencyIcon';

function pct(n: number): number { return Math.max(0, Math.min(100, Math.round(n * 100))); }

// ── The collect ceremony (shared by the screen + the arrival) ────────────────────────────────
function HarvestCeremony({ r, onClose, onGrow }: { r: IdleHarvestReceipt; onClose: () => void; onGrow?: () => void }): JSX.Element {
  return (
    <div className="hv-cer-backdrop" onClick={onClose}>
      <div className={`hv-cer${r.bloom ? ' is-bloom' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Harvest collected">
        <div className="hv-cer-eyebrow">{r.bloom ? '❉ THE HIVE BLOOMED ❉' : '⬢ HARVEST EXTRACTED ⬢'}</div>
        <div className="hv-cer-pods" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => <span key={i} className="hv-pod" style={{ animationDelay: `${i * 0.12}s` }} />)}
        </div>
        <div className="hv-cer-stats">
          <span><b>{fmtIdleHours(r.rawHours)}</b> away</span>
          <span><b>{fmtIdleHours(r.effHours)}</b> banked{r.full ? ' · BRIMMED' : ''}</span>
          <span><b>{r.efficiencyPct}%</b> efficiency</span>
        </div>
        <div className="hv-cer-lines">
          {r.lines.map((l, i) => (
            <div key={i} className={`hv-line${l.rare ? ' is-rare' : ''}`} style={{ animationDelay: `${0.25 + i * 0.14}s` }}>
              <span className="hv-line-i" aria-hidden>{l.icon}</span>
              <span className="hv-line-t">{l.label}</span>
              {l.rare && <span className="hv-line-rare">RARE</span>}
            </div>
          ))}
        </div>
        {r.suggestion && r.suggestion.kind === 'buy' && (
          <button className="hv-cer-grow" onClick={() => { onGrow?.(); onClose(); }}>
            Grow next: {r.suggestion.node.glyph} {r.suggestion.node.name} · {r.suggestion.cost.toLocaleString('en-US')} <CurrencyIcon id="genomeCores" size={12} title="Genome Cores" />
          </button>
        )}
        {r.suggestion && r.suggestion.kind === 'gate' && (
          <div className="hv-cer-gate">Next horizon: {r.suggestion.node.name} awaits — keep progressing.</div>
        )}
        <button className="hv-cer-close" onClick={onClose}>Return to the Hive</button>
      </div>
    </div>
  );
}

// ── Arrival overlay (mounted by the Hub; auto-offers once per session when ripe) ─────────────
let arrivalShown = false;
export function HarvestArrival({ onVisitHarvest }: { onVisitHarvest: () => void }): JSX.Element | null {
  meta.use();
  const [dismissed, setDismissed] = useState(false);
  const [receipt, setReceipt] = useState<IdleHarvestReceipt | null>(null);
  const v = meta.idleView();
  const ripe = v.collectable && v.accrual.rawHours * 60 >= IDLE.ceremonyMinutes;
  if (receipt) return <HarvestCeremony r={receipt} onClose={() => { setReceipt(null); setDismissed(true); }} onGrow={onVisitHarvest} />;
  if (arrivalShown || dismissed || !ripe) return null;
  return (
    <div className="hv-arrive" role="status">
      <span className="hv-arrive-glyph" aria-hidden>⬢</span>
      <span className="hv-arrive-t">The Hive kept harvesting — <b>{fmtIdleHours(v.accrual.effHours)}</b> banked{v.accrual.full ? ' (brimmed)' : ''}.</span>
      <button className="primary hv-arrive-go" onClick={() => {
        arrivalShown = true;
        const r = meta.collectIdleHarvest();
        if (r) { audio.cue('chest'); setReceipt(r); } else setDismissed(true);
      }}>Harvest</button>
      <button className="hv-arrive-later" onClick={() => { arrivalShown = true; setDismissed(true); }}>Later</button>
    </div>
  );
}

// ── The Harvest screen ───────────────────────────────────────────────────────────────────────
function NodeCard({ n }: { n: IdleNodeView }): JSX.Element {
  // GROW ceremony (docs/IDLE-HARVEST.md §presentation): a successful node buy must FEEL like
  // biology taking — graftCrack cue (the house upgrade sound), a caustic ring bursting off the
  // card, the glyph swelling, and the new level flaring gold. `grewLv` keys the one-shot CSS
  // animation to the level just reached (re-buys re-trigger); reduced-motion stills it in CSS.
  const [grewLv, setGrewLv] = useState(0);
  const buy = (): void => {
    if (!meta.buyIdleNode(n.def.id)) return;
    audio.cue('graftCrack');
    setGrewLv(n.level + 1);
  };
  return (
    <div className={`hv-node${n.gate ? ' is-gated' : ''}${grewLv > 0 ? ' is-grown' : ''}`} key={grewLv}>
      <div className="hv-node-h">
        <span className="hv-node-g" aria-hidden>{n.def.glyph}</span>
        <span className="hv-node-name">{n.def.name}</span>
        <span className="hv-node-lv">L{n.level}</span>
      </div>
      <p className="hv-node-blurb">{n.def.blurb}</p>
      {n.gate ? (
        <div className="hv-node-gate">🔒 {n.gateLabel} unlocks L{n.level + 1}</div>
      ) : (
        <button className={`hv-node-buy${n.affordable ? ' is-afford' : ''}`} disabled={!n.affordable} onClick={buy}>
          Grow · {n.cost.toLocaleString('en-US')} <CurrencyIcon id="genomeCores" size={12} title="Genome Cores" />
        </button>
      )}
    </div>
  );
}

export function HarvestScreen(): JSX.Element {
  meta.use();
  const [receipt, setReceipt] = useState<IdleHarvestReceipt | null>(null);
  const v: IdleHarvestView = meta.idleView(); // meta.use() above re-renders on every persist
  const a = v.accrual;
  const fillPct = pct(Math.min(1, a.rawHours / a.capHours));
  const toFullH = Math.max(0, a.capHours - a.rawHours);
  return (
    <div className="screen hv-screen">
      <header className="screen-h">
        <h2>Idle Harvest</h2>
        <p className="screen-sub">The Hive keeps harvesting while you're away — playing always out-earns it, but nothing is wasted.</p>
      </header>

      {/* The living hopper: veins fill toward the cap */}
      <section className="hv-hopper" aria-label="Harvest hopper">
        <div className="hv-veins" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => <i key={i} className="hv-vein" style={{ ['--fill' as string]: `${fillPct}%`, animationDelay: `${i * 0.35}s` }} />)}
        </div>
        <div className="hv-hopper-body">
          <div className="hv-hopper-row">
            <span className="hv-big">{fmtIdleHours(Math.min(a.rawHours, a.capHours))}</span>
            <span className="hv-cap">/ {fmtIdleHours(a.capHours)} cap{a.overflowHours > 0 ? ` · +${fmtIdleHours(a.overflowHours)} overflow` : ''}</span>
          </div>
          <div className="hv-bar" role="progressbar" aria-valuenow={fillPct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${fillPct}%` }} />
          </div>
          <div className="hv-meta-row">
            <span>{a.ratePerHour.toFixed(1)} value/h</span>
            {v.rankBonus > 0 && (
              <span title={`Genome Rank dividend: the mastery ladder feeds the harvest — +${Math.round(IDLE.rankGrowth * 100)}% rate per rank past I.`}>
                ⌖ +{Math.round(v.rankBonus * 100)}% rank dividend
              </span>
            )}
            <span>{Math.round(a.offlineEff * 100)}% offline efficiency</span>
            <span>{a.full ? 'BRIMMED — collect now' : `full in ${fmtIdleHours(toFullH)}`}</span>
          </div>
          <button
            className={`primary hv-collect${v.collectable ? ' is-ready' : ''}${a.full ? ' is-brimmed' : ''}`}
            disabled={!v.collectable}
            onClick={() => {
              const r = meta.collectIdleHarvest();
              if (r) { audio.cue('chest'); setReceipt(r); }
            }}
          >
            {v.collectable ? 'HARVEST' : `Warming — ready in ${Math.max(1, Math.ceil(IDLE.minCollectMinutes - a.rawHours * 60))}m`}
          </button>
        </div>
      </section>

      {/* The evolution tree — infinite, soft-scaled, progression-gated */}
      <section aria-label="Idle evolution tree">
        <div className="hv-sec-h">
          <span className="hv-sec-t">Hive Evolution</span>
          <span className="hv-sec-s">{v.cores.toLocaleString('en-US')} <CurrencyIcon id="genomeCores" size={12} title="Genome Cores" /> · every node grows forever, ever slower, ever pricier</span>
        </div>
        <div className="hv-nodes">
          {v.nodes.map((n) => <NodeCard key={n.def.id} n={n} />)}
        </div>
      </section>

      {/* The drop table — eligibility is the future-proofing contract made visible */}
      <section aria-label="Harvest drops">
        <div className="hv-sec-h"><span className="hv-sec-t">What the Hive extracts</span></div>
        <div className="hv-drops">
          {v.drops.map((d) => (
            <span key={d.id} className={`hv-drop${d.eligible ? '' : ' is-locked'}${d.rare ? ' is-rare' : ''}`}
              title={d.eligible ? d.name : `Unlocks at${d.minCampaign ? ` Stage ${d.minCampaign}` : ''}${d.minGenomeRank ? ` · Genome Rank ${d.minGenomeRank}` : ''}`}>
              <i aria-hidden>{d.icon}</i> {d.name}{!d.eligible && ' 🔒'}
            </span>
          ))}
        </div>
      </section>

      {/* Lifetime ledger — the collection/achievement spine */}
      <section aria-label="Harvest ledger" className="hv-ledger">
        <span><b>{v.ledger.harvests.toLocaleString('en-US')}</b> harvests</span>
        <span><b>{fmtIdleHours(v.ledger.lifetimeHours)}</b> lifetime banked</span>
        <span><b>{v.ledger.lifetimeValue.toLocaleString('en-US')}</b> lifetime value</span>
        <span><b>{fmtIdleHours(v.ledger.bestHours)}</b> best single harvest</span>
        <span><b>{v.ledger.blooms.toLocaleString('en-US')}</b> blooms</span>
      </section>

      {receipt && <HarvestCeremony r={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
