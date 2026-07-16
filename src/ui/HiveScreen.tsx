// THE HIVE — the construction board (docs/HIVE-CONSTRUCTION.md). The laboratory's next eras
// are BUILT here: organ cards grouped by era (locked eras stay visible with their gate — the
// anticipation contract of PROGRESSION-GATING), live per-currency affordability chips over a
// factor-traced recipe, and a build ceremony that pays off into LabAtmosphere IMMEDIATELY
// (the store persist re-renders the hub shell — the new fixture layers simply appear).
// Constitution: organs are sidegrades (base transformation + fiction) — never combat power.

import { useState } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { labScore } from './homeBaseTiers';
import type { HiveOrganDef, RecipeKey } from '../core/hiveOrgans';
import { explainCost } from '../core/hiveOrgans';
import { HIVE_SYNERGIES, ORGAN_COUPLINGS, synergyLive } from '../core/hiveProduction';
import { HiveOrganism } from './components/HiveOrganism';
import { CurrencyIcon } from './components/CurrencyIcon';
import { Popup } from './components/Popup';

/** Recipe chip presentation per currency lane (icon component ids + names for tooltips). */
const LANE: Record<RecipeKey, { cur: Parameters<typeof CurrencyIcon>[0]['id'] | null; name: string; glyph?: string }> = {
  cores: { cur: 'genomeCores', name: 'Genome Cores' },
  essence: { cur: 'geneEssence', name: 'Gene Essence' },
  strain: { cur: 'towerShards', name: 'Strain Samples (any strain — richest stacks first)' },
  apex: { cur: 'heroShards', name: 'Apex Genome (any champion — richest stacks first)' },
  mutagen: { cur: null, name: 'Mutagen', glyph: '⬢' },
  scrap: { cur: null, name: 'Scrap', glyph: '⛭' },
  catalyst: { cur: null, name: 'Catalyst', glyph: '✦' },
};

const ERAS: { era: 0 | 1 | 2 | 3; name: string; gate: string; at: number }[] = [
  { era: 0, name: 'NASCENT', gate: 'available from the first spore', at: 0 },
  { era: 1, name: 'GROWING', gate: 'the lab reaches its GROWING era', at: 16 },
  { era: 2, name: 'THRIVING', gate: 'the lab reaches its THRIVING era', at: 45 },
  { era: 3, name: 'ASCENDANT', gate: 'the lab reaches its ASCENDANT era', at: 90 },
];

export function HiveScreen(): JSX.Element {
  meta.use();
  const v = meta.hiveView();
  const score = labScore(meta.get());
  const idle = meta.idleView();
  const builtLedger = meta.get().hive.built;
  const [ceremony, setCeremony] = useState<{ def: HiveOrganDef; tier: number } | null>(null);

  const build = (def: HiveOrganDef, tier: number): void => {
    if (meta.buildOrgan(def.id)) {
      audio.cue('power'); // the growth cue — the same family as a permanent acquisition
      music.stinger('unlock');
      setCeremony({ def, tier });
    }
  };

  return (
    <div className="hive">
      <div className="hive-head">
        <div>
          <div className="hive-title">⬡ THE HIVE — GROWTH</div>
          <div className="hive-sub">
            Grow the organism deliberately. Every organ consumes a MIX of resources,
            <b> transforms the base you see behind every screen</b>, and <b>feeds its production</b> —
            the harvest is this body's output (docs: fully-grown pairs reveal hidden synergies).
          </div>
        </div>
        <div className="hive-era-chip">ERA {v.era} · {ERAS[v.era].name}</div>
      </div>

      {/* The living organism — the same body the Production view harvests */}
      <HiveOrganism built={builtLedger} fillFrac={idle.accrual.capHours > 0 ? idle.accrual.rawHours / idle.accrual.capHours : 0} producing={!idle.accrual.full} view="growth" />

      {ERAS.map(({ era, name, gate, at }) => {
        const organs = v.organs.filter((o) => o.def.era === era);
        if (organs.length === 0) return null;
        const reached = v.era >= era;
        return (
          <section className={`hive-era${reached ? '' : ' is-locked'}`} key={era} aria-label={`Era ${era} organs`}>
            <div className="hive-era-h">
              <span className="hive-era-t">{reached ? '◈' : '🔒'} ERA {era} · {name}</span>
              {!reached && (
                <span className="hive-era-gate">unlocks when {gate} — development {Math.floor(score)}/{at}</span>
              )}
            </div>
            <div className="hive-grid" data-guide="hive-grid">
              {organs.map(({ def, built, next }) => (
                <div className={`hive-organ${built > 0 ? ' is-built' : ''}${next?.affordable ? ' is-afford' : ''}`} key={def.id}>
                  <div className="hive-organ-top">
                    <span className="hive-organ-icon" aria-hidden>{def.icon}</span>
                    <span className="hive-organ-name">{def.name}</span>
                    {def.tiers > 1 && (
                      <span className="hive-pips" aria-label={`Tier ${built} of ${def.tiers}`}>
                        {Array.from({ length: def.tiers }, (_, i) => <i key={i} className={i < built ? 'on' : ''} />)}
                      </span>
                    )}
                  </div>
                  <div className="hive-organ-blurb">{def.blurb}</div>
                  <div className="hive-organ-perk">◇ {def.perk}</div>
                  {(() => {
                    const c = ORGAN_COUPLINGS.find((x) => x.organ === def.id);
                    const syn = HIVE_SYNERGIES.find((x) => x.a === def.id || x.b === def.id);
                    const synLive = syn ? synergyLive(builtLedger, syn) : false;
                    return (
                      <>
                        {c && <div className="hive-organ-prod" title={c.line}>⬣ {c.line}</div>}
                        {syn && (
                          <div className={`hive-organ-syn${synLive ? ' is-live' : ''}`} title={synLive ? syn.note : 'Fully grow both partner organs to reveal a hidden efficiency.'}>
                            {synLive ? `✦ ${syn.name} — LIVE` : '✦ Pairs with another organ — a hidden efficiency waits at full growth.'}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {next ? (
                    <>
                      <div className="hive-recipe">
                        {next.lines.map((l) => (
                          <span className={`hive-chip${l.ok ? ' ok' : ' short'}`} key={l.key}
                            title={`${LANE[l.key].name} — ${explainCost(l)} (held ${l.held.toLocaleString()})`}>
                            {LANE[l.key].cur
                              ? <CurrencyIcon id={LANE[l.key].cur!} size={11} title="" />
                              : <i aria-hidden>{LANE[l.key].glyph}</i>}
                            {l.amount.toLocaleString()}
                          </span>
                        ))}
                      </div>
                      <button className={`hive-build${next.affordable ? ' primary' : ''}`}
                        disabled={!next.affordable}
                        onClick={() => build(def, next.tier)}>
                        {v.era >= def.era
                          ? def.tiers > 1 ? <>Grow — tier {['I', 'II', 'III'][next.tier - 1]}</> : <>Grow</>
                          : 'Era-locked'}
                      </button>
                    </>
                  ) : (
                    <div className="hive-maxed">✓ Fully grown</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="hive-note">
        Strain Samples / Apex Genome recipes drain from your RICHEST stacks first — kinds you have
        nearly saved for an Evolution are touched last. Organs change the base and its mood, never combat power.
      </div>

      {/* Build ceremony — the reveal beat; the lab behind is ALREADY wearing the new organ. */}
      {ceremony && (
        <Popup>
          <div className="hive-ceremony-veil" onClick={() => setCeremony(null)}>
            <div className="hive-ceremony" role="dialog" aria-label={`${ceremony.def.name} grown`} onClick={(e) => e.stopPropagation()}>
              <div className="intro-eyebrow">⬡ THE HIVE GROWS</div>
              <div className="hive-ceremony-icon" aria-hidden>{ceremony.def.icon}</div>
              <div className="hive-ceremony-name">
                {ceremony.def.name}{ceremony.def.tiers > 1 ? ` · ${['I', 'II', 'III'][ceremony.tier - 1]}` : ''}
              </div>
              <div className="hive-ceremony-blurb">{ceremony.def.blurb}</div>
              <div className="hive-ceremony-perk">{ceremony.def.perk}</div>
              <button className="primary" onClick={() => setCeremony(null)}>Return to the lab ▸</button>
            </div>
          </div>
        </Popup>
      )}
    </div>
  );
}
