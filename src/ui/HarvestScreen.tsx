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
import { NextUp } from './HubLanding';
import { navBus } from '../state/navBus';
import { CurrencyIcon } from './components/CurrencyIcon';
import { HiveOrganism } from './components/HiveOrganism';
import { telemetry } from '../net/telemetry';

function pct(n: number): number { return Math.max(0, Math.min(100, Math.round(n * 100))); }

// ── The collect ceremony (shared by the screen + the arrival) ────────────────────────────────
// Reads as a HAUL, not a log (docs/IDLE-HARVEST.md §presentation): merged one-row-per-thing
// rewards (core/idleHarvest.mergeIdleReceiptLines), real currency icons with the amount as
// the loudest element, labelled stat blocks with a BRIMMED badge, discrete finds framed
// rare, the Account XP footer kept quiet, and the grow-next suggestion as a true call to
// action. Every section cascades in; reduced-motion stills it all in CSS.

/** CurrencyIcon ids the receipt can carry (materials render name-chips instead). */
const CEREMONY_CURS = new Set(['genomeCores', 'hiveMaterials', 'geneEssence', 'mulliganTissue', 'ichor', 'towerShards', 'heroShards']);

function CeremonyLine({ l, delay }: { l: IdleHarvestReceipt['lines'][number]; delay: number }): JSX.Element {
  const cur = l.cur && CEREMONY_CURS.has(l.cur) ? l.cur : null;
  return (
    <div className={`hv-line${l.rare ? ' is-rare' : ''}`} style={{ animationDelay: `${delay}s` }}>
      <span className="hv-line-i" aria-hidden>
        {cur ? <CurrencyIcon id={cur as Parameters<typeof CurrencyIcon>[0]['id']} size={18} title="" /> : l.icon}
      </span>
      {cur && typeof l.qty === 'number' ? (
        <span className="hv-line-t">
          <b className="hv-line-qty">{l.qty.toLocaleString('en-US')}</b>
          <span className="hv-line-name">{l.label.replace(/^[\d,]+\s*/, '')}</span>
        </span>
      ) : l.mats ? (
        <span className="hv-line-t hv-line-mats">
          {l.mats.mutagen > 0 && <span className="hv-mat"><i aria-hidden>⊕</i><b>{l.mats.mutagen}</b> Mutagen</span>}
          {l.mats.scrap > 0 && <span className="hv-mat"><i aria-hidden>◳</i><b>{l.mats.scrap}</b> Scrap</span>}
          {l.mats.catalyst > 0 && <span className="hv-mat"><i aria-hidden>✷</i><b>{l.mats.catalyst}</b> Catalyst</span>}
        </span>
      ) : (
        <span className="hv-line-t"><span className="hv-line-name">{l.label}</span></span>
      )}
      {l.rare && <span className="hv-line-rare">RARE</span>}
    </div>
  );
}

function HarvestCeremony({ r, onClose, onGrow }: { r: IdleHarvestReceipt; onClose: () => void; onGrow?: () => void }): JSX.Element {
  const xp = r.lines.find((l) => l.icon === '⬆');
  const haul = r.lines.filter((l) => l !== xp);
  return (
    <div className="hv-cer-backdrop" onClick={onClose}>
      <div className={`hv-cer${r.bloom ? ' is-bloom' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Hive production collected">
        <div className="hv-cer-eyebrow">{r.bloom ? '❉ THE HIVE BLOOMED ❉' : '⬢ HIVE PRODUCTION COMPLETE ⬢'}</div>
        {r.bloom && <div className="hv-cer-bloomline">A rare surge doubled this harvest.</div>}
        <div className="hv-cer-pods" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="hv-pod" style={{ animationDelay: `${i * 0.1}s` }}><span className="hv-pod-glow" /></span>
          ))}
        </div>
        <div className="hv-cer-stats">
          <div className="hv-stat"><b>{fmtIdleHours(r.rawHours)}</b><span>away</span></div>
          <div className="hv-stat-sep" aria-hidden />
          <div className="hv-stat">
            <b>{fmtIdleHours(r.effHours)}</b>
            <span>banked{r.full && <em className="hv-brim" title="Storage was full — grow Storage Tissue to bank longer absences.">BRIMMED</em>}</span>
          </div>
          <div className="hv-stat-sep" aria-hidden />
          <div className="hv-stat"><b>{r.efficiencyPct}%</b><span>efficiency</span></div>
        </div>
        <div className="hv-cer-kicker">The Hive produced</div>
        <div className="hv-cer-lines">
          {haul.map((l, i) => <CeremonyLine key={i} l={l} delay={0.3 + i * 0.11} />)}
        </div>
        {xp && <div className="hv-cer-xp" style={{ animationDelay: `${0.3 + haul.length * 0.11}s` }}>⬆ {xp.label}</div>}
        {r.suggestion && r.suggestion.kind === 'buy' && (
          <button className="hv-cer-grow" onClick={() => { onGrow?.(); onClose(); }}>
            <span className="hv-grow-k">Grow next</span>
            <span className="hv-grow-n">{r.suggestion.node.glyph} {r.suggestion.node.name}</span>
            <span className="hv-grow-c">{r.suggestion.cost.toLocaleString('en-US')} <CurrencyIcon id="hiveMaterials" size={12} title="Chitin" /></span>
          </button>
        )}
        {r.suggestion && r.suggestion.kind === 'gate' && (
          <div className="hv-cer-gate">Next horizon: {r.suggestion.node.name} awaits — keep progressing.</div>
        )}
        <button className="hv-cer-close primary" onClick={onClose}>Return to the Hive</button>
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
    <div className="hv-arrive" data-guide="hv-arrive" role="status">
      <span className="hv-arrive-glyph" aria-hidden>⬢</span>
      <span className="hv-arrive-t">The Hive kept harvesting — <b>{fmtIdleHours(v.accrual.effHours)}</b> banked{v.accrual.full ? ' (brimmed)' : ''}.</span>
      <button className="primary hv-arrive-go" onClick={() => {
        arrivalShown = true;
        const r = meta.collectIdleHarvest();
        if (r) {
          telemetry.emit('idle_collect', { v: Math.max(0, Math.min(10_000, Math.round(v.accrual.effHours * 10))) });
          audio.cue('chest');
          setReceipt(r);
        } else setDismissed(true);
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
          Grow · {n.cost.toLocaleString('en-US')} <CurrencyIcon id="hiveMaterials" size={12} title="Chitin" />
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
  const built = meta.get().hive.built;
  return (
    <div className="screen hv-screen">
      <header className="screen-h">
        <h2>Hive Production</h2>
        <p className="screen-sub">The Hive produces while you're away — its body is the engine, this is the yield. Playing always out-earns it, but nothing is wasted.</p>
      </header>

      {/* The living organism — the same body the Growth view grows (docs/HIVE-PRODUCTION.md §organism) */}
      <HiveOrganism built={built} fillFrac={a.capHours > 0 ? a.rawHours / a.capHours : 0} producing={!a.full} view="production" />

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
            className={`primary hv-collect act-collect${v.collectable ? ' is-ready' : ''}${a.full ? ' is-brimmed' : ''}`}
            disabled={!v.collectable}
            onClick={() => {
              const r = meta.collectIdleHarvest();
              if (r) {
                telemetry.emit('idle_collect', { v: Math.max(0, Math.min(10_000, Math.round(a.effHours * 10))) });
                audio.cue('chest');
                setReceipt(r);
              }
            }}
          >
            {v.collectable ? 'HARVEST' : `Warming — ready in ${Math.max(1, Math.ceil(IDLE.minCollectMinutes - a.rawHours * 60))}m`}
          </button>
          {/* No dead ends: a warming hopper immediately points at the loop's next step. */}
          {!v.collectable && <NextUp save={meta.get()} exclude="harvest" go={(k) => navBus.go(k)} />}
        </div>
      </section>

      {/* Production intelligence (docs/HIVE-PRODUCTION.md §stats): rate breakdown, the body's
          contribution, and the adaptive "what to grow" hint. */}
      <section className="hv-stats" aria-label="Production statistics">
        <div className="hv-sec-h"><span className="hv-sec-t">Production Intelligence</span></div>
        <div className="hv-stat-grid">
          <span className="hv-stat"><b>{a.ratePerHour.toFixed(1)}</b> value/h production rate</span>
          <span className="hv-stat"><b>{Math.round(a.offlineEff * 100)}%</b> offline efficiency</span>
          <span className="hv-stat"><b>{fmtIdleHours(a.capHours)}</b> storage capacity</span>
          <span className="hv-stat"><b>{a.full ? 'now' : fmtIdleHours(toFullH)}</b> {a.full ? 'READY — storage brimmed' : 'until storage fills'}</span>
        </div>
        <div className="hv-mults">
          {v.rankBonus > 0 && <span className="hv-mult" title="Genome Rank dividend">⌖ +{Math.round(v.rankBonus * 100)}% rank</span>}
          {v.arenaDividend > 1 && <span className="hv-mult" title="Arena division dividend">⚔ +{Math.round((v.arenaDividend - 1) * 100)}% arena</span>}
          {v.hive.rateMult > 1 && <span className="hv-mult is-hive" title="Built organs feeding the rate lane">⬡ +{Math.round((v.hive.rateMult - 1) * 100)}% organism</span>}
          {v.hive.capBonusHours > 0 && <span className="hv-mult is-hive" title="Symbiote-tended storage">⬡ +{v.hive.capBonusHours}h storage</span>}
          {v.synergies.filter((x) => x.live).map((x) => (
            <span key={x.def.id} className="hv-mult is-syn" title={x.def.note}>✦ {x.def.name}</span>
          ))}
        </div>
        {v.mostProductive && (
          <div className="hv-top-organ" title={v.mostProductive.line}>
            Most productive organ: <b>{v.mostProductive.name}</b> — {v.mostProductive.line}
          </div>
        )}
        {/* The adaptive recommendation: storage pressure beats everything, then the tree's own suggestion. */}
        <div className="hv-advice" data-guide="hv-advice">
          {a.full
            ? <>◉ Storage is BRIMMED — harvest now, then grow <button className="hv-advice-link" onClick={() => navBus.go('hive')}>Storage Tissue in the Hive</button> or Harvest Capacity below.</>
            : a.rawHours / a.capHours > 0.8
              ? <>◉ Storage is nearly full — plan a harvest, or grow Capacity so nothing is wasted.</>
              : v.suggestion && v.suggestion.kind === 'buy'
                ? <>✦ Recommended growth: {v.suggestion.node.glyph} {v.suggestion.node.name} · {v.suggestion.cost.toLocaleString('en-US')} Chitin.</>
                : v.suggestion && v.suggestion.kind === 'gate'
                  ? <>✦ Next horizon: {v.suggestion.node.name} — keep progressing to open it.</>
                  : <>✦ The organism hums along — grow any organ to raise the yield.</>}
        </div>
      </section>

      {/* The evolution tree — infinite, soft-scaled, progression-gated */}
      <section aria-label="Idle evolution tree">
        <div className="hv-sec-h">
          <span className="hv-sec-t">Hive Evolution</span>
          <span className="hv-sec-s">{v.chitin.toLocaleString('en-US')} <CurrencyIcon id="hiveMaterials" size={12} title="Chitin" /> · every node grows forever, ever slower, ever pricier</span>
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
