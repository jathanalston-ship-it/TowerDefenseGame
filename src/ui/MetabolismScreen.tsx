// MILESTONES — the Metabolism screen (docs/METABOLISM.md §screen). The recursive progression
// layer's ONE surface: four auto-grouped category sections (META_CATS), each track a
// progress-bar-dominant row toward its next lifetime threshold, with a Digest CTA the moment
// a tier is reached. Derive-first means veterans land here with a back-fill bundle waiting.
//
// Cognitive-load contract (docs/INFO-HIERARCHY.md): the hero Digest CTA is the screen's ONE
// attention animator (`mtb-hero-breathe`); rows express readiness with color only. Numbers on
// a row are the NEXT decision's inputs (value / next threshold); curve math lives behind the
// masthead <Detail>. Claims pay through meta.claimMetabolism → reward-toast ceremony.

import { meta } from '../state/meta';
import { META_CATS, METABOLISM, metabolismViews, toPassRewards } from '../state/metabolism';
import type { MetaCat, TrackView } from '../state/metabolism';
import { rewardShort } from '../core/battlePass';
import { audio } from '../audio/sound';
import { Detail } from './components/Detail';

const fmt = (n: number): string => n.toLocaleString('en-US');

/** The next tier's cargo as compact chips — the shared pass vocabulary plus the season lane. */
function RewardChips({ v }: { v: TrackView }): JSX.Element {
  const chips = [
    ...toPassRewards(v.nextRewards).map((r) => rewardShort(r)),
    ...v.nextRewards.filter((r) => r.type === 'bpXp').map((r) => `${r.qty} Season XP`),
  ];
  return (
    <span className="mtb-pay" title="What digesting the next tier pays">
      {chips.map((c, i) => <em key={i}>{c}</em>)}
    </span>
  );
}

function TrackRow({ v, onClaim }: { v: TrackView; onClaim: () => void }): JSX.Element {
  const span = Math.max(1, v.nextAt - v.prevAt);
  const fill = Math.max(0, Math.min(1, (v.value - v.prevAt) / span));
  return (
    <div className={`mtb-row${v.claimable > 0 ? ' is-ready' : ''}`}>
      <span className="mtb-glyph" aria-hidden>{v.def.glyph}</span>
      <div className="mtb-main">
        <div className="mtb-line1">
          <b className="mtb-name">{v.def.name}</b>
          {v.reached > 0 && <span className="mtb-tier" title={`${v.reached} tier${v.reached === 1 ? '' : 's'} reached lifetime`}>T{v.reached}</span>}
          <RewardChips v={v} />
        </div>
        <div className="mtb-bar" role="progressbar" aria-valuemin={v.prevAt} aria-valuemax={v.nextAt} aria-valuenow={Math.min(v.value, v.nextAt)} aria-label={v.def.name}>
          <span className="mtb-fill" style={{ width: `${Math.round(fill * 100)}%` }} />
        </div>
        <div className="mtb-line2">{fmt(v.value)} / {fmt(v.nextAt)} {v.def.unit}</div>
      </div>
      {v.claimable > 0 && (
        <button className="primary act-claim mtb-claim" onClick={onClaim}>
          ✓ Digest{v.claimable > 1 ? ` ×${v.claimable}` : ''}
        </button>
      )}
    </div>
  );
}

export function MetabolismScreen(): JSX.Element {
  meta.use();
  const views = metabolismViews(meta.get());
  const claimable = views.filter((v) => v.claimable > 0);
  const readyTiers = claimable.reduce((a, v) => a + v.claimable, 0);
  const digested = views.reduce((a, v) => a + v.claimed, 0);
  const hero = claimable[0] ?? null; // registry order: Conquest first — stable, no jumping
  const claim = (id: string): void => { audio.cue('ui'); meta.claimMetabolism(id); };
  const claimAll = (): void => { audio.cue('ui'); for (const v of claimable) meta.claimMetabolism(v.def.id); };
  return (
    <div className="screen mtb-screen">
      <header className="screen-h">
        <h2>Milestones</h2>
        <p className="screen-sub">
          The organism digests everything. Kills, discoveries, rituals — every lifetime feat
          crosses thresholds that pay forever. Nothing here is a grind; it is gratitude.
        </p>
        <div className="mtb-ledger">
          <span className="mtb-led-b"><b>{fmt(digested)}</b> tiers digested</span>
          <span className="mtb-led-b">{readyTiers > 0 ? <><b>{readyTiers}</b> ready now</> : 'all caught up'}</span>
          <Detail summary="how the ladder grows" className="mtb-dtl">
            Every track climbs a nice-number ladder forever — each tier needs ×{METABOLISM.thresholdGrowth} the
            last (rounded to designed numbers), while its payout grows only ×{METABOLISM.rewardGrowth}. Deeper
            tiers pay more in absolute terms, yet the reward per action always shrinks — the
            economy can never inflate from here.
          </Detail>
        </div>
      </header>

      {hero && (
        <div className="mtb-heroRow">
          <span className="mtb-hero-g" aria-hidden>{hero.def.glyph}</span>
          <div className="mtb-hero-t">
            <b>{hero.def.name}</b> crossed {fmt(hero.prevAt)} {hero.def.unit}
            <span className="mtb-hero-s">{META_CATS[hero.def.cat].glyph} {META_CATS[hero.def.cat].label} milestone reached</span>
          </div>
          {claimable.length > 1 && (
            <button className="mtb-all" onClick={claimAll}>Digest all ({readyTiers})</button>
          )}
          <button className="primary act-claim mtb-hero-cta" onClick={() => claim(hero.def.id)}>
            ✓ Digest{hero.claimable > 1 ? ` ×${hero.claimable}` : ''}
          </button>
        </div>
      )}

      {(Object.keys(META_CATS) as MetaCat[]).map((c) => {
        const rows = views.filter((v) => v.def.cat === c);
        const ready = rows.reduce((a, v) => a + v.claimable, 0);
        return (
          <section key={c} className="mtb-cat" data-guide="mtb-cats">
            <h3 className="mtb-cat-h">
              <span aria-hidden>{META_CATS[c].glyph}</span> {META_CATS[c].label}
              {ready > 0 && <em className="mtb-cat-n">{ready} ready</em>}
            </h3>
            <div className="mtb-rows">
              {rows.map((v) => <TrackRow key={v.def.id} v={v} onClaim={() => claim(v.def.id)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
