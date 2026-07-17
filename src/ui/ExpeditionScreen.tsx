// EXPEDITION COMMAND (docs/EXPEDITIONS.md §screen) — the benched-roster idle lane's own wing.
// Relocated out of the Hero Hall's basement (2026-07): away-missions are a daily-return habit,
// not a hero-editing detail, so they get a first-class screen — the AWAY TEAM (live countdowns,
// pulsing claims, an outcome ceremony) above the MISSION BOARD (risk-tiered offer cards with
// class affinity, mastery pips, projected multipliers per forager). Reads meta.expeditionsView();
// expedition time is hours, not frames — the screen ticks twice a minute.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { HERO_DEFS } from '../core/config';
import { RISK_TIERS } from '../core/expeditions';
import type { ExpeditionOutcome, ExpeditionReward, RareFind } from '../core/expeditions';
import type { HeroKind } from '../core/types';
import { HeroPortrait } from './components/HeroPortrait';
import { audio } from '../audio/sound';

function fmtEta(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

interface Spoils { hero: HeroKind; outcome: ExpeditionOutcome; reward: ExpeditionReward; find: RareFind | null }

const OUTCOME_LABEL: Record<ExpeditionOutcome, string> = {
  windfall: '⚡ WINDFALL', standard: 'STANDARD RETURN', setback: '⚠ SETBACK',
};

/** The claim ceremony card — the returning hero's haul, styled by outcome. */
function SpoilsCard({ s, onClose }: { s: Spoils; onClose: () => void }): JSX.Element {
  const def = HERO_DEFS[s.hero];
  return (
    <div className={`exb-spoils is-${s.outcome}`} role="status">
      <div className="exb-spoils-head">
        <b style={{ color: def.color }}>{def.name} returns</b>
        <span className="exb-spoils-outcome">{OUTCOME_LABEL[s.outcome]}</span>
        <button className="exb-spoils-x" onClick={onClose} aria-label="Dismiss">✕</button>
      </div>
      <div className="exb-spoils-haul">
        <span className="exb-haul-chip">◆ {s.reward.cores} Cores</span>
        <span className="exb-haul-chip">⌬ {s.reward.essence} Essence</span>
        {(s.reward.chitin ?? 0) > 0 && <span className="exb-haul-chip">⬣ {s.reward.chitin} Chitin</span>}
        <span className="exb-haul-chip">⊕ {s.reward.mats.mutagen} · ◳ {s.reward.mats.scrap} · ✷ {s.reward.mats.catalyst}</span>
        {s.find && <span className="exb-haul-chip is-find">✦ {s.find.name}!</span>}
      </div>
    </div>
  );
}

export function ExpeditionScreen(): JSX.Element {
  meta.use(); // reactive: sends/claims move the board live
  const [, tick] = useState(0);
  const [spoils, setSpoils] = useState<Spoils | null>(null);
  const spoilsTimer = useRef<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      window.clearInterval(id);
      if (spoilsTimer.current !== null) window.clearTimeout(spoilsTimer.current);
    };
  }, []);

  const view = meta.expeditionsView();
  const slotsTotal = view.active.length + view.slotsFree;
  const readyNow = view.active.filter((e) => e.claimable).length;

  const claim = (hero: HeroKind): void => {
    const r = meta.claimExpedition(hero);
    if (!r) return;
    audio.cue('chest');
    setSpoils({ hero, ...r });
    if (spoilsTimer.current !== null) window.clearTimeout(spoilsTimer.current);
    spoilsTimer.current = window.setTimeout(() => setSpoils(null), 9000);
  };

  return (
    <div className="exb">
      {/* ── MASTHEAD ── */}
      <div className="exb-mast">
        <div>
          <div className="panel-title">Expedition Command</div>
          <div className="panel-sub">
            Benched heroes forage while you fight. Matched-class foragers earn +25%; every completion
            builds mission mastery. Risky roads can windfall — or bite.
          </div>
        </div>
        <div className="exb-mast-chips">
          <span className={`exb-slots${view.slotsFree === 0 ? ' is-full' : ''}`}>
            ⇢ {view.active.length}/{slotsTotal} teams afield
          </span>
          {readyNow > 0 && <span className="exb-ready">⇠ {readyNow} ready to claim</span>}
        </div>
      </div>

      {spoils && <SpoilsCard s={spoils} onClose={() => setSpoils(null)} />}

      {/* ── AWAY TEAM — live missions, claim on return ── */}
      <section className="exb-away" aria-label="Away team">
        <div className="exb-h">Away Team</div>
        {view.active.length === 0 && (
          <div className="exb-empty">No teams afield — send a benched hero from the mission board below.</div>
        )}
        <div className="exb-away-grid">
          {view.active.map((e) => {
            const def = view.defs.find((d) => d.id === e.defId);
            const hd = HERO_DEFS[e.hero];
            return (
              <div className={`exb-mission${e.claimable ? ' is-ready' : ''}`} key={e.hero} style={{ ['--hc' as string]: hd.color }}>
                <div className="exb-mission-face" aria-hidden><HeroPortrait def={hd} size={52} /></div>
                <div className="exb-mission-body">
                  <div className="exb-mission-top">
                    <b style={{ color: hd.color }}>{hd.name}</b>
                    <span className="exb-mission-name">{def?.name ?? 'Expedition'}</span>
                    {def && <span className={`exb-risk r${def.risk}`}>{RISK_TIERS[def.risk].name}</span>}
                  </div>
                  {e.claimable ? (
                    <button className="primary exb-claim" onClick={() => claim(e.hero)}>⇠ Claim spoils</button>
                  ) : (
                    <div className="exb-eta">
                      <span className="exb-prog" aria-hidden><i style={{ width: `${Math.round(e.progress * 100)}%` }} /></span>
                      <span className="exb-eta-t">returns in <b>{fmtEta(e.remainingMs)}</b></span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── MISSION BOARD — the offer wall ── */}
      <section className="exb-board" aria-label="Mission board">
        <div className="exb-h">Mission Board</div>
        {view.slotsFree === 0 && (
          <div className="exb-empty">All away-slots filled — claim a returning team to send the next.</div>
        )}
        {view.slotsFree > 0 && view.benched.length === 0 && (
          <div className="exb-empty">No benched heroes — unlock more champions in the Hero Hall, or free a roster slot.</div>
        )}
        {view.slotsFree > 0 && view.benched.length > 0 && (
          <div className="exb-offers">
            {view.offers.map(({ def: d, masteryRuns, masteryBonus: mb, picks }) => (
              <div className="exb-offer" key={d.id} style={{ ['--rk' as string]: `var(--exb-r${d.risk})` }}>
                <div className="exb-offer-h">
                  <b>{d.name}</b>
                  <span className={`exb-risk r${d.risk}`}>{RISK_TIERS[d.risk].name}</span>
                  <span className="exb-hours">{d.hours}h</span>
                </div>
                <p className="exb-blurb">{d.blurb}</p>
                <div className="exb-meta">
                  <span className="exb-aff" title={`${d.affinity}-class heroes forage +25% here`}>◈ {d.affinity}</span>
                  <span className="exb-mastery" title="Each completion adds +2% (caps at +20%)">
                    {Array.from({ length: 10 }, (_, i) => (
                      <i key={i} className={`exb-pip${i < Math.min(masteryRuns, 10) ? ' on' : ''}`} aria-hidden />
                    ))}
                    {mb > 0 && <b>+{Math.round(mb * 100)}%</b>}
                  </span>
                </div>
                <div className="exb-pay">
                  +{d.reward.cores} Cores · +{d.reward.essence} Essence{(d.reward.chitin ?? 0) > 0 ? ` · +${d.reward.chitin} Chitin` : ''} · ⊕{d.reward.mats.mutagen} ◳{d.reward.mats.scrap}{d.reward.mats.catalyst > 0 ? ` ✷${d.reward.mats.catalyst}` : ''}
                </div>
                <div className="exb-send">
                  {picks.map((p) => {
                    const hd = HERO_DEFS[p.hero];
                    return (
                      <button
                        key={p.hero}
                        className={`exb-send-btn${p.affinity ? ' is-affine' : ''}`}
                        style={{ ['--hc' as string]: hd.color }}
                        title={`${hd.name}${p.stars > 0 ? ` ◈${p.stars}` : ''}${p.affinity ? ` — ${d.affinity} affinity` : ''} · ×${p.mult.toFixed(2)} rewards`}
                        onClick={() => { if (meta.startExpedition(d.id, p.hero)) audio.cue('ui'); }}
                      >
                        <span className="exb-send-face" aria-hidden><HeroPortrait def={hd} size={30} /></span>
                        <span className="exb-send-name">{hd.name}{p.affinity ? ' ◈' : ''}</span>
                        <i className="exb-mult">×{p.mult.toFixed(2)}</i>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
