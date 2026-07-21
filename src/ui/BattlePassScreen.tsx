// BATTLE PASS SCREEN (docs/BATTLEPASS.md §ui) — the season terminal, staged as a LIVING
// ceremony: the SeasonDef palette drives a full ambient layer (falling season-glyph petals,
// aurora bloom, a slow ray wheel), a rotating glyph medallion, an SVG season-progress ring
// around the level, a reward track threaded on a progress SPINE with a pulsing "you are
// here" beacon, per-claim burst FX, and a premium door with animated chrome. All motion is
// CSS transforms/opacity (LabAtmosphere's rule — no JS render loop) and stilled under
// prefers-reduced-motion. The LOGIC layer is unchanged: dual track, claim/claim-all, Ichor
// level buys, the rewarded-ad advance, the premium unlock (Ichor door + store route),
// completion % + pace ETA. Poll-on-tick keeps rotation + countdown live.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { meta } from '../state/meta';
import type { BattlePassView } from '../state/meta';
import { BP, rewardLabel, rewardShort } from '../core/battlePass';
import type { PassReward, SeasonDef } from '../core/battlePass';
import { seasonOfferFor } from '../core/premium';
import { wardrobeItem, WARDROBE_RARITY_COLOR } from '../core/wardrobe';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';
import { adProvider } from '../ads/provider';
import { telemetry } from '../net/telemetry';
import { NextUp } from './HubLanding';
import { navBus } from '../state/navBus';

function fmtLeft(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** The season pace estimate: XP earned per elapsed day → days to level 100 at that pace. */
function etaText(view: BattlePassView): string {
  if (view.level >= BP.levels) return 'complete';
  const elapsedDays = Math.max(0.25, (BP.rotationMs - view.endsInMs) / 86_400_000);
  if (view.xp <= 0) return '—';
  const rate = view.xp / elapsedDays;
  const days = (view.totalXp - view.xp) / rate;
  return days > 90 ? '90+ days at this pace' : `≈${Math.max(1, Math.ceil(days))}d at your pace`;
}

/** The living season backdrop — palette-driven, purely decorative, CSS-animated only.
 *  Petals are the season's own glyph drifting down; aurora blobs breathe in accent/glow.
 *  Deterministic per-index variation (no Math.random in render — stable across re-renders). */
function SeasonAtmo({ season }: { season: SeasonDef }): JSX.Element {
  const petals = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        left: 5 + ((i * 47 + 11) % 84), // scattered lanes, clear of both edges
        size: 9 + ((i * 7) % 12), // px glyph size
        dur: 14 + ((i * 13) % 14), // fall seconds
        delay: -((i * 17) % 26), // mid-flight on mount
        drift: ((i % 5) - 2) * 4, // sway px — envelope stays inside the atmo even at 320px wide
        spin: ((i % 2) ? 1 : -1) * (140 + ((i * 29) % 220)), // total rotation deg
        dim: 0.25 + ((i * 5) % 4) * 0.12,
      })),
    [],
  );
  return (
    <div className="bp-atmo" aria-hidden>
      <i className="bp-atmo-aurora is-a" />
      <i className="bp-atmo-aurora is-b" />
      <i className="bp-atmo-rays" />
      {petals.map((p, i) => (
        <span
          key={i}
          className="bp-petal"
          style={{
            left: `${p.left}%`,
            fontSize: p.size,
            opacity: p.dim,
            ['--pdur' as string]: `${p.dur}s`,
            ['--pdel' as string]: `${p.delay}s`,
            ['--pdrift' as string]: `${p.drift}px`,
            ['--pspin' as string]: `${p.spin}deg`,
          } as CSSProperties}
        >
          {season.glyph}
        </span>
      ))}
    </div>
  );
}

/** Season-progress ring around the level number (level / 100, animated sweep). */
function LevelRing({ level }: { level: number }): JSX.Element {
  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = Math.min(1, level / BP.levels);
  return (
    <div className="bp-ring" role="progressbar" aria-valuenow={level} aria-valuemin={0} aria-valuemax={BP.levels} aria-label="Season level">
      <svg viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="bpRingInk" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--bpx)" />
            <stop offset="100%" stopColor="var(--bp-glow, #fff)" />
          </linearGradient>
        </defs>
        <circle className="bp-ring-track" cx="32" cy="32" r={R} />
        <circle
          className="bp-ring-fill"
          cx="32" cy="32" r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
        />
      </svg>
      <span className="bp-ring-lv"><b>{level}</b><i>/{BP.levels}</i></span>
    </div>
  );
}

/** Icon + NAMED cargo per reward — every tile says what it holds (no icon-guessing). */
function RewardIcons({ rewards }: { rewards: PassReward[] }): JSX.Element {
  return (
    <span className="bp-ricons" aria-hidden>
      {rewards.slice(0, 2).map((r, i) => (
        <span className="bp-rchip" key={i}>
          <i className="bp-rchip-i">{rewardLabel(r).icon}</i>
          <em className="bp-rchip-t">{rewardShort(r)}</em>
        </span>
      ))}
    </span>
  );
}

function Cell({ level, track, view, selected, bursting, onSelect, onClaim }: {
  level: number;
  track: 'free' | 'premium';
  view: BattlePassView;
  selected: boolean;
  bursting: boolean;
  onSelect: () => void;
  onClaim: () => void;
}): JSX.Element {
  const rewards = view.tracks[track][level - 1];
  const claimed = (track === 'free' ? view.claimedFree : view.claimedPremium).has(level);
  const reached = level <= view.level;
  const preview = track === 'premium' && !view.premium && BP.freePremiumLevels.includes(level);
  const gated = track === 'premium' && !view.premium && !preview;
  const claimable = reached && !claimed && !(track === 'premium' && gated);
  const cosmetic = rewards.find((r) => r.kind === 'cosmetic');
  const rc = cosmetic && cosmetic.kind === 'cosmetic' ? WARDROBE_RARITY_COLOR[wardrobeItem(cosmetic.id)?.rarity ?? 'common'] : undefined;
  const cargo = rewards.map((r) => rewardLabel(r).label).join(' + '); // the tile SAYS what it holds
  return (
    <button
      className={[
        'bp-cell',
        claimed ? 'is-claimed' : '',
        claimable ? 'is-claimable' : '',
        !reached ? 'is-future' : '',
        gated ? 'is-gated' : '',
        level === BP.levels ? 'is-crown' : '',
        selected ? 'is-sel' : '',
      ].filter(Boolean).join(' ')}
      style={rc ? ({ ['--rc' as string]: rc } as CSSProperties) : undefined}
      onClick={() => { onSelect(); if (claimable) onClaim(); }}
      title={`Level ${level} ${track}: ${cargo}`}
      aria-label={`Level ${level} ${track} reward: ${cargo}${claimed ? ' (claimed)' : claimable ? ' (claimable)' : ''}`}
    >
      <span className="bp-cell-lv">{level}</span>
      <RewardIcons rewards={rewards} />
      {claimed && <span className="bp-cell-done" aria-hidden>✓</span>}
      {gated && <span className="bp-cell-lock" aria-hidden>🔒</span>}
      {preview && !claimed && <span className="bp-cell-star" aria-hidden>★</span>}
      {level === BP.levels && <span className="bp-cell-rays" aria-hidden />}
      {bursting && (
        <span className="bp-claimburst" aria-hidden>
          <i /><i /><i /><i /><i /><i />
        </span>
      )}
    </button>
  );
}

export function BattlePassScreen({ onStore }: { onStore?: () => void } = {}): JSX.Element {
  const save = meta.use(); // re-render on claims / xp
  const [now, setNow] = useState(() => Date.now());
  const [sel, setSel] = useState<number | null>(null);
  const [unclaimedOnly, setUnclaimedOnly] = useState(false);
  const [burst, setBurst] = useState<{ level: number; track: 'free' | 'premium'; key: number } | null>(null);
  const burstTimer = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    meta.pollBattlePass(now);
    const t = window.setInterval(() => { const n = Date.now(); setNow(n); meta.pollBattlePass(n); }, 30_000);
    return () => {
      window.clearInterval(t);
      if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = meta.battlePass(now);
  const season = view.season;

  // Center the track on the current level once per mount/level-up.
  useEffect(() => {
    const host = trackRef.current;
    if (!host) return;
    const cell = host.querySelector<HTMLElement>('.bp-col-current');
    if (cell) host.scrollLeft = Math.max(0, cell.offsetLeft - host.clientWidth * 0.4);
  }, [view.level]);

  // Claims present through the global claim popup (docs/NOTIFICATIONS.md §claim-popups):
  // a bold itemized receipt naming the level — the cell burst stays as local juice.
  const claim = (track: 'free' | 'premium', level: number): void => {
    const lines = meta.claimPassLevel(track, level, Date.now());
    if (lines) {
      audio.cue(level === BP.levels ? 'jackpot' : 'chest');
      // The claim BURST — a radial pop on the cell itself (re-keyed so chains re-fire).
      setBurst((b) => ({ level, track, key: (b?.key ?? 0) + 1 }));
      if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => setBurst(null), 750);
    }
  };
  const claimAll = (): void => {
    const lines = meta.claimAllPass(Date.now());
    if (lines.length > 0) {
      audio.cue('chest');
    }
  };

  const claimables = view.claimableFree.length + view.claimablePremium.length;
  const levels = useMemo(() => {
    const all = Array.from({ length: BP.levels }, (_, i) => i + 1);
    if (!unclaimedOnly) return all;
    return all.filter((l) =>
      (l <= view.level && !view.claimedFree.has(l))
      || ((view.premium || BP.freePremiumLevels.includes(l)) && l <= view.level && !view.claimedPremium.has(l)));
  }, [unclaimedOnly, view]);

  const claimedTotal = view.claimedFree.size + view.claimedPremium.size;
  const adsOn = adProvider.id !== 'none';

  return (
    <div className="bp" style={{ ['--bp' as string]: season.accent, ['--bp-glow' as string]: season.glow, ['--bp-bg' as string]: season.bg } as CSSProperties}>
      <SeasonAtmo season={season} />

      <header className="bp-head">
        {/* The season medallion — rotating themed ring, breathing glyph, three orbiters. */}
        <div className="bp-medal" aria-hidden>
          <i className="bp-medal-ring" />
          <i className="bp-medal-orbit"><b /><b /><b /></i>
          <span className="bp-glyph">{season.glyph}</span>
        </div>
        <div className="bp-title-block">
          <div className="bp-eyebrow">SEASON PASS · rotates {fmtLeft(view.endsInMs)}</div>
          <h1 className="bp-title">{season.name}</h1>
          <p className="bp-tagline">{season.tagline}</p>
        </div>
        <div className="bp-level-block">
          <LevelRing level={view.level} />
          <div className="bp-xp-block">
            <div className="bp-xpbar" role="progressbar" aria-valuenow={view.into} aria-valuemin={0} aria-valuemax={view.need} aria-label="Level progress">
              <i style={{ width: `${view.level >= BP.levels ? 100 : (view.into / Math.max(1, view.need)) * 100}%` }} />
            </div>
            <div className="bp-xpline">{view.level >= BP.levels ? 'MAX — season cleared' : `${view.into}/${view.need} XP · ${etaText(view)}`}</div>
          </div>
        </div>
      </header>

      {/* Loop handoff (docs/REWARD-ARCHITECTURE.md §chaining): with nothing claimable the
          season screen points at the next loop's ready action instead of dead-ending. */}
      {claimables === 0 && <NextUp save={save} exclude="season" go={(k) => navBus.go(k)} />}

      <div className="bp-controls">
        <button className="primary bp-claimall act-claim" data-guide="bp-claim" disabled={claimables === 0} onClick={claimAll}>
          Claim all{claimables > 0 ? ` (${claimables})` : ''}
        </button>
        {view.levelPrice !== null && (
          <button className="bp-buylv shop-buy" onClick={() => { if (meta.buyPassLevel(Date.now())) audio.cue('power'); }}>
            +1 level · <CurrencyIcon id="ichor" size={12} title="" /> {view.levelPrice}
          </button>
        )}
        {adsOn && view.adAvailable && (
          <button
            className="bp-ad"
            onClick={() => {
              telemetry.emit('ad', { d: 'bp:start' });
              void adProvider.show().then((r) => {
                telemetry.emit('ad', { d: `bp:${r === 'completed' ? 'complete' : 'abort'}` });
                if (r === 'completed' && meta.adAdvancePass(Date.now())) audio.cue('power');
              });
            }}
          >
            ▶ Free level (study)
          </button>
        )}
        <label className="bp-filter">
          <input type="checkbox" checked={unclaimedOnly} onChange={(e) => setUnclaimedOnly(e.target.checked)} />
          Unclaimed only
        </label>
        <span className="bp-completion">{Math.round((claimedTotal / (BP.levels * 2)) * 100)}% claimed</span>
      </div>

      {!view.premium && (
        <div className="bp-upsell">
          <span className="bp-upsell-mark" aria-hidden>{season.glyph}</span>
          <div className="bp-upsell-body">
            <div className="bp-upsell-h">PREMIUM TRACK — {season.name}</div>
            <p>20 exclusive cosmetics, 10 permanent economy passives, premium containers, and the Level-100 crown. Levels 1, 50 and 99 are free tastes — claim them below.</p>
          </div>
          <button
            className="primary bp-unlock"
            disabled={meta.get().ichor < BP.premiumIchor}
            onClick={() => {
              if (meta.buyPassPremium(Date.now())) {
                audio.cue('jackpot');
              }
            }}
          >
            Unlock · <CurrencyIcon id="ichor" size={13} title="" /> {BP.premiumIchor}
          </button>
          {onStore && (() => {
            // The real-money door — the SAME flag through the store (docs/BATTLEPASS.md §pricing).
            const sku = seasonOfferFor(save.premium.purchases);
            return (
              <button className="bp-unlock-usd" onClick={() => { audio.cue('ui'); onStore(); }}>
                or ${sku.priceUsd.toFixed(2)} in the Store{sku.listUsd !== undefined ? ' · first season −50%' : ''}
              </button>
            );
          })()}
        </div>
      )}

      <div className="bp-track" data-guide="bp-track" ref={trackRef}>
        <div className="bp-lane-labels" aria-hidden>
          <span className="bp-lane-l is-premium">PREMIUM</span>
          <span className="bp-lane-l">FREE</span>
        </div>
        <div className="bp-cols">
          {levels.map((l, i) => (
            <div
              className={`bp-col${l === view.level ? ' bp-col-current' : ''}${l <= view.level ? ' is-past' : ''}`}
              key={l}
              style={{ ['--i' as string]: Math.min(i, 24) } as CSSProperties}
            >
              {l === view.level && <span className="bp-beacon" aria-hidden>▾</span>}
              <Cell level={l} track="premium" view={view} selected={sel === l} bursting={burst?.level === l && burst.track === 'premium'} onSelect={() => setSel(l)} onClaim={() => claim('premium', l)} />
              <Cell level={l} track="free" view={view} selected={sel === l} bursting={burst?.level === l && burst.track === 'free'} onSelect={() => setSel(l)} onClaim={() => claim('free', l)} />
            </div>
          ))}
        </div>
      </div>

      {sel !== null && (
        <div className="bp-detail">
          <div className="bp-detail-h">LEVEL {sel}{sel === BP.levels ? ' — THE CROWN' : ''}</div>
          <div className="bp-detail-cols">
            {(['premium', 'free'] as const).map((track) => (
              <div className="bp-detail-track" key={track}>
                <div className={`bp-detail-k${track === 'premium' ? ' is-premium' : ''}`}>{track === 'premium' ? `${season.glyph} Premium` : 'Free'}</div>
                {view.tracks[track][sel - 1].map((r, i) => {
                  const { icon, label } = rewardLabel(r);
                  const item = r.kind === 'cosmetic' ? wardrobeItem(r.id) : undefined;
                  return (
                    <div className="bp-detail-line" key={i} style={item ? { color: WARDROBE_RARITY_COLOR[item.rarity] } : undefined}>
                      {icon} {label}{item ? ` — ${item.desc}` : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {view.completions > 0 && (
            <p className="bp-detail-note">Season completed ×{view.completions} — permanents already earned pay {BP.repeatReplacement.ichor} Ichor + {BP.repeatReplacement.cores} Cores instead. Perennial Bloom stacks: {view.stacks}.</p>
          )}
        </div>
      )}
    </div>
  );
}
