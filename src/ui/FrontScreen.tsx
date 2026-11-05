// THE FRONT (docs/INFESTATION.md §front) — the territory-war screen. The living map
// (InfestationBoard, unchanged) keeps the pins and forecasts; this screen adds the WAR:
// today's hotspot + incursion, one-time tier spoils, weekly regional tribute, and Deploy
// (arms one run with the region's warp via state/frontDeploy + pins the feed). The home
// board's old full-size map collapsed into <FrontStrip/> (components/FrontStrip.tsx) — one line, deep-linking here.

import { useEffect } from 'react';
import { meta } from '../state/meta';
import { InfestationBoard } from './components/InfestationBoard';
import { rewardLabel } from '../core/battlePass';
import { REGIONS, REGION_WARPS } from '../core/infestation';
import { frontDeploy } from '../state/frontDeploy';
import { navBus } from '../state/navBus';
import { NextUp } from './HubLanding';
import './FrontScreen.css';

export function FrontScreen(): JSX.Element {
  meta.use();
  useEffect(() => { meta.pollFront(); }, []); // resolve any pending incursion bite on entry
  const v = meta.frontView();
  // Deploy = pin the feed + arm ONE run with the region warp, then head to the Mission Hub.
  const deploy = (sectorId: string): void => {
    meta.setInfestTarget(sectorId);
    frontDeploy.arm(sectorId);
    navBus.go('campaign');
  };
  return (
    <div className="front-screen">
      <div className="panel-head">
        <div>
          <div className="panel-title">The Front</div>
          <div className="panel-sub">
            Hold territory, and it pays. Every run feeds the war; the war bites back when ignored.
          </div>
        </div>
      </div>

      {/* Today on the Front — the hotspot and the incursion, above the fold. */}
      <section className="front-today" aria-label="Today on the Front">
        <span className="front-chip is-hot" title={`Feeds into ${v.hotspot.name} land ×${v.hotspot.mult} today`}>
          ☀ HOTSPOT · {v.hotspot.name} <em>({v.hotspot.regionName}) — feeds ×{v.hotspot.mult}</em>
        </span>
        {v.incursion && (
          <span className={`front-chip is-inc${v.incursion.defended ? ' is-held' : ''}`}>
            {v.incursion.defended
              ? <>⛨ DEFENDED · {v.incursion.name} holds</>
              : <>⚠ INCURSION · {v.incursion.name} — win a run that feeds it today or lose {v.incursion.bite}</>}
          </span>
        )}
        {v.incursion && !v.incursion.defended && (
          <button className="front-defend" onClick={() => deploy(v.incursion!.id)}>⛨ Defend {v.incursion.name}</button>
        )}
      </section>

      <InfestationBoard />

      {/* Spoils of war — one card per sector with unclaimed tier rewards. */}
      {v.tierClaims.length > 0 && (
        <section aria-label="Tier spoils">
          <div className="front-sec-h">SPOILS OF WAR — held ground mints its claim once</div>
          <div className="front-cards">
            {v.tierClaims.map((c) => (
              <div className="front-card" key={c.id}>
                <b>{c.name}</b>
                <span className="front-card-t">{c.tierName} secured</span>
                <span className="front-card-r">{c.rewards.map((r) => rewardLabel(r).label).join(' · ')}</span>
                <button className="primary" onClick={() => meta.claimFrontTier(c.id)}>Claim</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Weekly tribute — one card per region; held tiers scale the payout. */}
      <section aria-label="Weekly tribute" data-guide="front-tribute">
        <div className="front-sec-h">WEEKLY TRIBUTE — held tiers pay their keeper</div>
        <div className="front-cards">
          {v.tributes.map((t) => (
            <div className={`front-card${t.claimable ? '' : ' is-idle'}`} key={t.regionId}>
              <b>{t.name}</b>
              <span className="front-card-t">{t.heldTiers} / 16 tiers held</span>
              <span className="front-card-r">
                {t.rewards.length > 0 ? t.rewards.map((r) => rewardLabel(r).label).join(' · ') : 'Hold ground to earn tribute'}
              </span>
              <button className="primary" disabled={!t.claimable} onClick={() => meta.claimFrontTribute(t.regionId)}>
                {t.claimable ? 'Collect' : 'Collected'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Deploy — fight where you feed; each region twists the run its own way. */}
      <section aria-label="Deploy" data-guide="front-deploy">
        <div className="front-sec-h">DEPLOY — fight where you feed (one run, the region's rules)</div>
        <div className="front-cards">
          {REGIONS.map((r) => (
            <div className="front-card" key={r.id}>
              <b style={{ color: r.accent }}>{r.name}</b>
              <span className="front-card-r">{REGION_WARPS[r.id]?.blurb}</span>
              <button onClick={() => deploy(r.sectors[0].id)}>⛬ Deploy</button>
            </div>
          ))}
        </div>
      </section>

      {v.claimableCount === 0 && <NextUp save={meta.get()} exclude="infestation" go={(k) => navBus.go(k)} />}
    </div>
  );
}
