// BATTLE PASS SCREEN (docs/BATTLEPASS.md §ui) — the season terminal. Dual reward track
// (premium over free), 100 levels, large reward detail on select, claim/claim-all, Ichor
// level buys, the rewarded-ad advance (provider builds), the premium unlock (Ichor door +
// a store route), completion % + pace-based ETA, and the season's theme (accent/glyph)
// painted over the whole screen. Poll-on-tick keeps rotation + countdown live.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { meta } from '../state/meta';
import type { BattlePassView } from '../state/meta';
import { BP, rewardLabel } from '../core/battlePass';
import type { PassReward } from '../core/battlePass';
import { wardrobeItem, WARDROBE_RARITY_COLOR } from '../core/wardrobe';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';
import { adProvider } from '../ads/provider';

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

function RewardIcons({ rewards }: { rewards: PassReward[] }): JSX.Element {
  return (
    <span className="bp-ricons" aria-hidden>
      {rewards.slice(0, 2).map((r, i) => <i key={i}>{rewardLabel(r).icon}</i>)}
    </span>
  );
}

function Cell({ level, track, view, selected, onSelect, onClaim }: {
  level: number;
  track: 'free' | 'premium';
  view: BattlePassView;
  selected: boolean;
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
      aria-label={`Level ${level} ${track} reward${claimed ? ' (claimed)' : claimable ? ' (claimable)' : ''}`}
    >
      <span className="bp-cell-lv">{level}</span>
      <RewardIcons rewards={rewards} />
      {claimed && <span className="bp-cell-done" aria-hidden>✓</span>}
      {gated && <span className="bp-cell-lock" aria-hidden>🔒</span>}
      {preview && !claimed && <span className="bp-cell-star" aria-hidden>★</span>}
    </button>
  );
}

export function BattlePassScreen(): JSX.Element {
  meta.use(); // re-render on claims / xp
  const [now, setNow] = useState(() => Date.now());
  const [sel, setSel] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<{ icon: string; label: string }[] | null>(null);
  const [unclaimedOnly, setUnclaimedOnly] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    meta.pollBattlePass(now);
    const t = window.setInterval(() => { const n = Date.now(); setNow(n); meta.pollBattlePass(n); }, 30_000);
    return () => window.clearInterval(t);
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

  const claim = (track: 'free' | 'premium', level: number): void => {
    const lines = meta.claimPassLevel(track, level, Date.now());
    if (lines) {
      setReceipt(lines);
      audio.cue(level === BP.levels ? 'jackpot' : 'chest');
    }
  };
  const claimAll = (): void => {
    const lines = meta.claimAllPass(Date.now());
    if (lines.length > 0) { setReceipt(lines); audio.cue('chest'); }
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
      <header className="bp-head">
        <div className="bp-glyph" aria-hidden>{season.glyph}</div>
        <div className="bp-title-block">
          <div className="bp-eyebrow">SEASON PASS · rotates {fmtLeft(view.endsInMs)}</div>
          <h1 className="bp-title">{season.name}</h1>
          <p className="bp-tagline">{season.tagline}</p>
        </div>
        <div className="bp-level-block">
          <div className="bp-level">LV <b>{view.level}</b><span>/{BP.levels}</span></div>
          <div className="bp-xpbar" role="progressbar" aria-valuenow={view.level} aria-valuemin={0} aria-valuemax={BP.levels}>
            <i style={{ width: `${view.level >= BP.levels ? 100 : (view.into / Math.max(1, view.need)) * 100}%` }} />
          </div>
          <div className="bp-xpline">{view.level >= BP.levels ? 'MAX — season cleared' : `${view.into}/${view.need} XP · ${etaText(view)}`}</div>
        </div>
      </header>

      <div className="bp-controls">
        <button className="primary bp-claimall" disabled={claimables === 0} onClick={claimAll}>
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
              void adProvider.show().then((r) => {
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
          <div className="bp-upsell-body">
            <div className="bp-upsell-h">PREMIUM TRACK — {season.name}</div>
            <p>20 exclusive cosmetics, 10 permanent economy passives, premium containers, and the Level-100 crown. Levels 1, 50 and 99 are free tastes — claim them below.</p>
          </div>
          <button className="primary bp-unlock" disabled={meta.get().ichor < BP.premiumIchor} onClick={() => { if (meta.buyPassPremium(Date.now())) audio.cue('jackpot'); }}>
            Unlock · <CurrencyIcon id="ichor" size={13} title="" /> {BP.premiumIchor}
          </button>
        </div>
      )}

      {receipt && (
        <div className="bp-receipt" role="status" onClick={() => setReceipt(null)}>
          {receipt.slice(0, 8).map((l, i) => <span key={i}>{l.icon} {l.label}</span>)}
          {receipt.length > 8 && <span>+{receipt.length - 8} more</span>}
        </div>
      )}

      <div className="bp-track" ref={trackRef}>
        <div className="bp-lane-labels" aria-hidden>
          <span className="bp-lane-l is-premium">PREMIUM</span>
          <span className="bp-lane-l">FREE</span>
        </div>
        <div className="bp-cols">
          {levels.map((l) => (
            <div className={`bp-col${l === view.level ? ' bp-col-current' : ''}`} key={l}>
              <Cell level={l} track="premium" view={view} selected={sel === l} onSelect={() => setSel(l)} onClaim={() => claim('premium', l)} />
              <Cell level={l} track="free" view={view} selected={sel === l} onSelect={() => setSel(l)} onClaim={() => claim('free', l)} />
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
                <div className={`bp-detail-k${track === 'premium' ? ' is-premium' : ''}`}>{track === 'premium' ? '❁ Premium' : 'Free'}</div>
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
