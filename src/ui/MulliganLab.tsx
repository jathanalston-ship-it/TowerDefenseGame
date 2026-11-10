// MULLIGAN LAB (docs/MULLIGANS.md §UI) — the graft wing. A master–detail bench in the Tower Lab's
// visual language: the HOST RAIL (one row per tower, organism status at a glance) selects one
// specimen for the SHOWCASE — a living graft chamber (the actual procedurally-generated organism
// idle-animating on its turret), the organism's identity + resolved package, the three GRAFT SITES
// (equip / upgrade / ascend / clear, every spend Power-previewed), and the sequenced-modifier
// library. All reads flow through mulliganLabView; all writes through the meta pipeline. Menu-only —
// never touches the sim.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { motionPrefs, onMotionPrefs, resolveMotion } from '../state/prefs';
import { TOWER_DEFS } from '../core/config';
import type { TowerKind } from '../core/types';
import { mulliganLabView, recommendModifiers } from '../state/mulliganLabModel';
import type { OwnedModifier, SlotView } from '../state/mulliganLabModel';
import { CLASS_ADAPTATIONS, MULLIGAN_RARITY, adaptationOf, resolveMulligan } from '../core/mulligan';
import { COMBAT_CLASSES, COMBAT_CLASS_ORDER } from '../core/combatClass';
import type { CombatClass } from '../core/types';
import type { MulliganReforgeMod } from '../core/mulliganReforge';
import { REFORGE_RARITY } from '../core/mulliganReforge';
import { angleForSegment, drawReforgeWheel } from '../render/reforgeWheel';
import { REFORGE_MODS } from '../core/mulliganReforge';
import { CURRENCIES } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';
import { drawTowerForm } from '../render/towerForms';
import { drawMulliganOrganism } from '../render/mulliganOrganism';
import { NucleusChambers } from './NucleusChambers';
import { TowerPortrait } from './TowerPortrait';
import { MobileSection } from './components/MobileSection';
import { Popup } from './components/Popup';
import { ProgressBar } from './components/ProgressBar';
import { PowerPreview } from './components/PowerScore';
import { audio } from '../audio/sound';
import './MulliganLab.css';

const SITE = ['A', 'B', 'C'];
/** §sorting — the library's sort modes (docs/MULLIGANS.md §UI). */
type ModSort = 'recommended' | 'class' | 'rarity' | 'power' | 'level' | 'host' | 'newest' | 'upgradeable';
const SORT_LABEL: Record<ModSort, string> = {
  recommended: 'Recommended', class: 'Class', rarity: 'Rarity', power: 'Power',
  level: 'Upgrade Level', host: 'Host Compatibility', newest: 'Newest', upgradeable: 'Upgradeable',
};

/** The graft chamber: the actual turret body with the resolved organism grafted on, idle-animated.
 *  DPR-crisp; draws a single static frame under prefers-reduced-motion (the organism is information,
 *  not ambience — it must still be visible); rAF self-pauses while the tab is hidden. */
function OrganismPreview({ kind }: { kind: TowerKind }): JSX.Element {
  const organism = meta.use().mulligans?.[kind];
  const ref = useRef<HTMLCanvasElement>(null);
  const SIZE = 220;
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const draw = (now: number): void => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const cx = SIZE / 2, cy = SIZE / 2, r = 46;
      const st = organism;
      const resolved = resolveMulligan(st, TOWER_DEFS[kind].combatClass);
      // The organism wraps the host: organs behind the body AND reaching over it (battlefield layering).
      if (st) drawMulliganOrganism(ctx, cx, cy, r, resolved, st.visualSeed, st.animSeed, now, 0);
      drawTowerForm(ctx, kind, cx, cy, r, TOWER_DEFS[kind].color, now, 0, 1);
      if (st) drawMulliganOrganism(ctx, cx, cy, r, resolved, st.visualSeed, st.animSeed, now, 0);
    };
    let raf = 0;
    let visible = true;
    let elapsed = 0;
    let previous: number | null = null;
    let prefs = motionPrefs();
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const loop = (nowMs: number): void => {
      if (previous !== null) elapsed += (nowMs - previous) / 1000;
      previous = nowMs;
      draw(elapsed);
      raf = requestAnimationFrame(loop);
    };
    const sync = (): void => {
      cancelAnimationFrame(raf);
      previous = null;
      if (!visible || document.hidden) return;
      if (resolveMotion(prefs, media?.matches ?? false).motion === 0) draw(0);
      else raf = requestAnimationFrame(loop);
    };
    draw(0);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer?.observe(cv);
    const offPrefs = onMotionPrefs((next) => { prefs = next; sync(); });
    media?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      offPrefs();
      media?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [kind, organism]);
  return <canvas ref={ref} className="mgl-canvas" style={{ width: SIZE, height: SIZE }} aria-hidden />;
}

/** The REFORGE WHEEL ceremony (docs/MULLIGANS.md §reforge): the roll is already decided
 *  (meta.reforgeMulligan) — this spins the bio-horror iris TO that result with an eased
 *  deceleration, lights the winning wedge, then presents the mod. Reduced motion skips
 *  straight to the result. */
function ReforgeWheelOverlay({ mod, onClose }: { mod: MulliganReforgeMod; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [landed, setLanded] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      if (!opener?.isConnected) return;
      const target = opener.matches(':disabled') ? opener.closest<HTMLElement>('.mgl-rf-slot') : opener;
      target?.focus();
    };
  }, []);
  useEffect(() => { if (landed) acceptRef.current?.focus(); }, [landed]);
  const SIZE = 300;
  const target = REFORGE_MODS.findIndex((m) => m.id === mod.id);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const finalAngle = angleForSegment(target) - 4 * Math.PI * 2; // four full revolutions in
    const t0 = performance.now();
    const DUR = 2600;
    let raf = 0;
    let done = false;
    let prefs = motionPrefs();
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const syncMotion = (): void => {
      if (done || resolveMotion(prefs, media?.matches ?? false).motion !== 0) return;
      done = true;
      cancelAnimationFrame(raf);
      drawReforgeWheel(ctx, SIZE, angleForSegment(target), 0.9, target);
      setLanded(true);
    };
    const loop = (now: number): void => {
      const p = Math.min(1, (now - t0) / DUR);
      const ease = 1 - Math.pow(1 - p, 3); // cubic ease-out — a heavy organ spinning down
      const angle = finalAngle * (1 - ease) + angleForSegment(target) * ease
        + (1 - ease) * 0; // finalAngle already encodes the revolutions
      drawReforgeWheel(ctx, SIZE, angle, now / 1000, p >= 1 ? target : -1);
      if (p >= 1) { done = true; setLanded(true); audio.cue('graftCrack'); return; }
      raf = requestAnimationFrame(loop);
    };
    const offPrefs = onMotionPrefs((next) => { prefs = next; syncMotion(); });
    media?.addEventListener('change', syncMotion);
    syncMotion();
    if (!done) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      offPrefs();
      media?.removeEventListener('change', syncMotion);
    };
  }, [target]);
  const tier = REFORGE_RARITY[mod.rarity];
  return (
    <Popup>
      <div ref={dialogRef} className="rfw-overlay" role="dialog" aria-modal="true" aria-label="Mulligan reforge" tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            (acceptRef.current ?? dialogRef.current)?.focus();
          }
        }} onClick={landed ? onClose : undefined}>
        <div className="rfw-card" onClick={(e) => e.stopPropagation()}>
          <div className="rfw-badge">⊛ REFORGE — THE WHEEL DECIDES</div>
          <canvas ref={ref} className="rfw-canvas" style={{ width: '100%', maxWidth: SIZE, height: 'auto' }} aria-hidden />
          {landed && (
            <div className="rfw-result" style={{ ['--rc' as string]: tier.color }}>
              <span className="rfw-rarity">{tier.label}</span>
              <span className="rfw-name">{mod.name}</span>
              <span className="rfw-desc">{mod.desc}</span>
              <span className="rfw-bound">⚠ This organism is now BOUND to its host — permanently.</span>
              <button ref={acceptRef} className="primary rfw-go" onClick={onClose}>Accept the graft ▸</button>
            </div>
          )}
          {!landed && <div className="rfw-spinning">the iris turns…</div>}
        </div>
      </div>
    </Popup>
  );
}

export function MulliganLab(): JSX.Element {
  const save = meta.use();
  const view = mulliganLabView(save);
  const [selected, setSelected] = useState<TowerKind>(view.towers[0].kind);
  const [armed, setArmed] = useState<number | null>(null); // explicitly armed graft site
  const [cls, setCls] = useState<'all' | CombatClass>('all'); // §classes — the library's primary lens
  const [sort, setSort] = useState<ModSort>('recommended');
  const [wheel, setWheel] = useState<MulliganReforgeMod | null>(null); // §reforge — the spinning ceremony
  // §adaptations — the COMPLETE CLASS ADAPTATION ceremony (set on the equip that completes it).
  const [adaptCeremony, setAdaptCeremony] = useState<{ cls: CombatClass; title: string; desc: string } | null>(null);
  const tv = view.towers.find((t) => t.kind === selected) ?? view.towers[0];

  // §gate — the pillar is sealed until three DISTINCT Mega Bosses have fallen (accounts
  // already holding pieces are grandfathered). The briefing sells the goal, not a wall.
  if (!view.unlocked) {
    return (
      <div className="panel mgl-panel">
        <div className="panel-title">Mulligan Lab</div>
        {/* The Nucleus's own chambers open BEFORE the tower graft wing (chamber 1 from the start —
            docs/NUCLEUS.md §gates), so the console lives above the mega-boss seal. */}
        <MobileSection
          title="Hive Nucleus"
          hint="The Hive grows its OWN organism — three chambers of support organs."
          count={`${Object.keys(save.nucleus.grown).length} organs`}
          defaultOpen
        >
          <NucleusChambers />
        </MobileSection>
        <div className="mgl-gate" role="status">
          <div className="mgl-gate-glyph" aria-hidden>⊛</div>
          <div className="mgl-gate-title">SEALED BEHIND APEX BIOLOGY</div>
          <p className="mgl-gate-copy">
            The graft wing unlocks when the hive has assimilated enough apex genome —
            slay <b>{view.gate.needed} distinct Mega Bosses</b> to open it. Once open,
            epic-or-better Bio-Containers begin dropping <b>Mulligan pieces</b>: graft three
            onto a tower and a living secondary organism awakens on it.
          </p>
          <div className="mgl-gate-bar">
            <ProgressBar value={view.gate.slain} max={view.gate.needed} color="var(--viral)" height={8} label="Mega Bosses slain" />
            <span className="mgl-gate-count">{view.gate.slain} / {view.gate.needed} unique Mega Bosses slain</span>
          </div>
          <p className="mgl-gate-hint">Mega Bosses anchor every 10th Campaign stage, every 20th Infinite wave, and every 5th Boss Rush wave.</p>
        </div>
      </div>
    );
  }

  // The armed site: an explicit pick wins; otherwise the first empty site is live, so a fresh
  // player can simply tap a modifier in the library and watch it take.
  const firstEmpty = tv.slots.find((s) => !s.filled)?.index ?? null;
  const armedSite = armed ?? firstEmpty;

  const selectTower = (k: TowerKind): void => { setSelected(k); setArmed(null); };
  const equip = (id: string): void => {
    if (armedSite == null) return;
    const hostCls = TOWER_DEFS[tv.kind].combatClass;
    const before = adaptationOf(meta.get().mulligans?.[tv.kind], hostCls).tier;
    if (meta.equipMulligan(tv.kind, armedSite, id)) {
      setArmed(null);
      const after = adaptationOf(meta.get().mulligans?.[tv.kind], hostCls).tier;
      if (after === 'full' && before !== 'full') {
        // The set completed — the organism SYNCHRONIZES (docs/MULLIGANS.md §adaptations).
        audio.cue('adapt');
        setAdaptCeremony({ cls: hostCls, title: CLASS_ADAPTATIONS[hostCls].title, desc: CLASS_ADAPTATIONS[hostCls].fullDesc });
      } else {
        audio.cue('graftSquelch');
      }
    }
  };
  const upgrade = (slot: number): void => { if (meta.upgradeMulligan(tv.kind, slot)) audio.cue('graftCrack'); };
  const ascend = (slot: number): void => { if (meta.ascendMulligan(tv.kind, slot)) audio.cue('splice'); };
  const unequip = (slot: number): void => { if (meta.unequipMulligan(tv.kind, slot)) { audio.cue('select'); setArmed(null); } };
  const spin = (slot: number): void => {
    const res = meta.reforgeMulligan(tv.kind, slot);
    if (res) { audio.cue('splice'); setWheel(res.mod); }
  };

  // Power preview before every spend (docs/DESIGN_LANGUAGE.md §3) — only an AWAKE organism moves
  // Power, so dormant slots skip the (full-model) computation entirely.
  const previewUpgrade = (s: SlotView): number => meta.previewPower((sv) => {
    const st = sv.mulligans[tv.kind];
    const cur = st?.slots[s.index];
    if (!st || !cur) return sv;
    const slots = st.slots.slice();
    slots[s.index] = { ...cur, level: cur.level + 1 };
    return { ...sv, mulligans: { ...sv.mulligans, [tv.kind]: { ...st, slots } } };
  }).score;
  const previewAscend = (s: SlotView): number => meta.previewPower((sv) => {
    const st = sv.mulligans[tv.kind];
    const cur = st?.slots[s.index];
    if (!st || !cur || !s.nextRarity) return sv;
    const slots = st.slots.slice();
    slots[s.index] = { ...cur, rarity: s.nextRarity };
    return { ...sv, mulligans: { ...sv.mulligans, [tv.kind]: { ...st, slots } } };
  }).score;

  // §recommendations — ranked for THIS host; the library highlights + sorts on it.
  const recos = recommendModifiers(save, tv.kind, 3);
  const recoRank = new Map(recos.map((r, i) => [r.id, i]));
  const recoReason = new Map(recos.map((r) => [r.id, r.reason]));
  const clsRank = (c: CombatClass): number => COMBAT_CLASS_ORDER.indexOf(c);
  const hostCls = tv.hostClass;
  const sorters: Record<ModSort, (a: OwnedModifier, b: OwnedModifier) => number> = {
    recommended: (a, b) => (recoRank.get(a.id) ?? 99) - (recoRank.get(b.id) ?? 99) || MULLIGAN_RARITY[b.rarity].tier - MULLIGAN_RARITY[a.rarity].tier,
    class: (a, b) => clsRank(a.cls) - clsRank(b.cls) || MULLIGAN_RARITY[b.rarity].tier - MULLIGAN_RARITY[a.rarity].tier,
    rarity: (a, b) => MULLIGAN_RARITY[b.rarity].tier - MULLIGAN_RARITY[a.rarity].tier,
    power: (a, b) => b.powerWeight * MULLIGAN_RARITY[b.rarity].powerMult - a.powerWeight * MULLIGAN_RARITY[a.rarity].powerMult,
    level: (a, b) => b.level - a.level,
    host: (a, b) => Number(b.cls === hostCls) - Number(a.cls === hostCls) || MULLIGAN_RARITY[b.rarity].tier - MULLIGAN_RARITY[a.rarity].tier,
    newest: (a, b) => b.dexIndex - a.dexIndex,
    upgradeable: (a, b) => Number(b.upgradeable) - Number(a.upgradeable) || b.level - a.level,
  };
  const mods = view.owned
    .filter((m) => cls === 'all' || m.cls === cls)
    .slice()
    .sort((a, b) => sorters[sort](a, b) || a.name.localeCompare(b.name));
  const curPower = meta.power().score;

  return (
    <div className="panel mgl-panel">
      <div className="mgl-head">
        <div>
          <div className="panel-title">Mulligan Lab</div>
          <div className="panel-sub">
            The graft wing. Assemble a biomechanical organism onto each tower from three genetic
            modifiers — it stays dormant until all three sites are filled, then awakens with its own
            body, behavior, and projectile.
          </div>
        </div>
        <div className="mgl-wallet">
          <span className="mgl-overflow" title={CURRENCIES.mulliganTissue.blurb}>
            <CurrencyIcon id="mulliganTissue" size={16} title="" /> {view.tissue.toLocaleString()}
            <em>Mulligan Tissue</em>
          </span>
          <span className="mgl-dexcount" title="Modifiers sequenced — epic+ Bio-Containers discover new ones">
            {view.discovered} / {view.total} sequenced
            <ProgressBar value={view.discovered} max={view.total} color="var(--viral)" height={4} label="modifiers sequenced" />
          </span>
        </div>
      </div>

      {/* ── The Hive's OWN organism (docs/NUCLEUS.md) — chambers above the tower grafts.
            Portrait: a collapsible section, so the tower graft wing (this screen's primary
            job) stays one thumb-scroll away instead of a console-length below the fold. ── */}
      <MobileSection
        title="Hive Nucleus"
        hint="The Hive grows its OWN organism — three chambers of support organs."
        count={`${Object.keys(save.nucleus.grown).length} organs`}
      >
        <NucleusChambers />
      </MobileSection>

      <div className="mgl-body">
        {/* ── Host rail: one row per tower, organism status at a glance (scales to a 100-tower roster) ── */}
        <div className="mgl-rail" data-guide="mulligan-rail" role="tablist" aria-label="Graft hosts">
          {view.towers.map((t) => (
            <button
              key={t.kind}
              role="tab"
              aria-selected={t.kind === selected}
              className={`mgl-item${t.kind === selected ? ' on' : ''}`}
              style={{ ['--tw' as string]: t.color }}
              onClick={() => selectTower(t.kind)}
            >
              <span className="mgl-item-portrait"><TowerPortrait color={t.color} stars={save.towerStars[t.kind] ?? 0} size={44} kind={t.kind} /></span>
              <span className="mgl-item-body">
                <span className="mgl-item-name" style={{ color: t.color }}>{t.name}</span>
                {t.active
                  ? <span className="mgl-item-sub is-awake">● Awake · ×{t.power.toFixed(2)}</span>
                  : <span className="mgl-item-sub">{t.filled > 0 ? `${t.filled}/3 grafted` : 'Dormant'}</span>}
              </span>
              {t.active && (
                <span className={`mgl-item-glyph${t.adaptation.tier === 'full' ? ' is-adapted' : ''}`} aria-hidden
                  style={t.adaptation.tier === 'full' ? { color: t.hostColor } : undefined}>
                  {t.adaptation.tier === 'full' ? '⟡' : '⊛'}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Showcase: one host's organism ── */}
        <div className="mgl-showcase" style={{ ['--tw' as string]: tv.color }}>
          <div className="mgl-hero">
            <div className={`mgl-chamber${tv.active ? ' is-awake' : ''}`} role="img" aria-label={`${tv.name} graft chamber${tv.active ? ' — organism awake' : ' — dormant'}`}>
              <span className={`mgl-chamber-tag${tv.active ? ' is-awake' : ''}`}>
                {tv.active ? `×${tv.power.toFixed(2)} POWER` : 'DORMANT'}
              </span>
              <OrganismPreview kind={tv.kind} />
            </div>
            <div className="mgl-id">
              <span className="mgl-eyebrow">Graft Host</span>
              <span className="mgl-name" style={{ color: tv.color }}>{tv.name}</span>
              <span className="mgl-identity">
                {tv.active
                  ? <>Awake — <b className="mgl-axis">{tv.dominant}</b> organism</>
                  : <>Graft {3 - tv.filled} more modifier{3 - tv.filled === 1 ? '' : 's'} to awaken the organism</>}
              </span>
              {tv.locked && <span className="mgl-bound" title="Reforged — this organism is permanently bound to this tower">⊛ REFORGED — BOUND</span>}
              <span className="mgl-sites" aria-label={`${tv.filled} of 3 graft sites filled`}>
                {tv.slots.map((s) => (
                  <span key={s.index} className={`mgl-site-pip${s.filled ? ' on' : ''}`} style={s.filled ? { ['--mg' as string]: s.rarityColor } : undefined}>
                    {SITE[s.index]}
                  </span>
                ))}
              </span>
              {tv.packageLines.length > 0 && (
                <span className="mgl-package">
                  {tv.packageLines.map((l) => <span className="mgl-pkg-chip" key={l}>{l}</span>)}
                </span>
              )}
              {/* §adaptations — the host-class synergy panel: match pips, tier, the running
                  bonus or the chase copy. THE reason to specialize (docs/MULLIGANS.md). */}
              <span className={`mgl-adapt${tv.adaptation.tier ? ` is-${tv.adaptation.tier}` : ''}`} style={{ ['--cc' as string]: tv.hostColor }}>
                <span className="mgl-adapt-head">
                  <b className="mgl-adapt-cls">{tv.hostGlyph} {tv.hostClass}</b>
                  <span className="mgl-adapt-pips" aria-label={`${tv.adaptation.matches} of 3 class matches`}>
                    {[0, 1, 2].map((i) => <i key={i} className={i < tv.adaptation.matches ? 'on' : ''} />)}
                  </span>
                  {tv.adaptation.tier === 'full' && <b className="mgl-adapt-badge">⟡ {tv.adaptation.title.toUpperCase()} — SYNCHRONIZED</b>}
                  {tv.adaptation.tier === 'minor' && <b className="mgl-adapt-badge is-minor">◐ MINOR ADAPTATION</b>}
                </span>
                <span className="mgl-adapt-line">
                  {tv.adaptation.activeDesc
                    ?? <>Match all three grafts to <b>{tv.hostClass}</b> for the Complete Adaptation: {tv.adaptation.goalDesc}</>}
                </span>
              </span>
            </div>
          </div>

          {/* ── Graft sites ── */}
          <div className="mgl-block">
            <div className="mgl-block-h">
              <span className="mgl-eyebrow">Graft Sites</span>
              <span className="mgl-block-hint">level with <CurrencyIcon id="geneEssence" size={12} title="Gene Essence" /> Gene Essence · ascend a maxed graft to the next rarity</span>
            </div>
            <div className="mgl-slots">
              {tv.slots.map((s) => s.filled ? (
                <div key={s.index} className="mgl-slot is-filled" style={{ ['--mg' as string]: s.rarityColor }}>
                  <div className="mgl-slot-top">
                    <span className="mgl-slot-site">{SITE[s.index]}</span>
                    {s.cls && (
                      <span className={`mgl-cls-chip${s.clsMatch ? ' is-match' : ''}`} style={{ ['--cc' as string]: s.clsColor }}
                        title={`${s.cls} — ${s.clsMatch ? 'matches the host class' : `host is ${tv.hostClass}`}`}>
                        {s.clsGlyph}
                      </span>
                    )}
                    <span className="mgl-slot-name">{s.name}</span>
                    <span className="mgl-slot-tier">{MULLIGAN_RARITY[s.rarity!].label} · Lv {s.level}/{s.maxLevel}</span>
                    {!tv.locked && <button className="mgl-clear" title="Clear this graft site (the modifier stays sequenced)" aria-label={`Clear site ${SITE[s.index]}`} onClick={() => unequip(s.index)}>✕</button>}
                  </div>
                  <ProgressBar value={s.level!} max={s.maxLevel!} color={s.rarityColor!} height={4} label={`${s.name} level`} />
                  <span className="mgl-slot-desc">{s.desc}</span>
                  <div className="mgl-slot-actions">
                    {!s.maxed && (
                      <button className="mgl-btn" disabled={!s.canAfford} onClick={() => upgrade(s.index)}
                        title={`${s.upgradeCost!.toLocaleString()} Gene Essence`}>
                        Level up · <CurrencyIcon id="geneEssence" size={12} title="" /> {s.upgradeCost!.toLocaleString()}
                      </button>
                    )}
                    {s.maxed && s.nextRarity && s.ascendCost != null && (
                      <button className="mgl-btn is-ascend" disabled={!s.ascendable} onClick={() => ascend(s.index)}
                        style={{ ['--mg' as string]: MULLIGAN_RARITY[s.nextRarity].color }}
                        title={`${s.ascendCost.toLocaleString()} Gene Essence`}>
                        Ascend → {MULLIGAN_RARITY[s.nextRarity].label} · <CurrencyIcon id="geneEssence" size={12} title="" /> {s.ascendCost.toLocaleString()}
                      </button>
                    )}
                    {s.maxed && !s.nextRarity && <span className="mgl-apex">APEX — fully ascended</span>}
                    {tv.active && !s.maxed && s.canAfford && <PowerPreview current={curPower} next={previewUpgrade(s)} />}
                    {tv.active && s.maxed && s.ascendable && <PowerPreview current={curPower} next={previewAscend(s)} />}
                  </div>
                </div>
              ) : (
                <button
                  key={s.index}
                  className={`mgl-slot is-empty${armedSite === s.index ? ' is-armed' : ''}`}
                  onClick={() => setArmed(armed === s.index ? null : s.index)}
                >
                  <span className="mgl-slot-site">{SITE[s.index]}</span>
                  <span className="mgl-slot-empty">
                    {armedSite === s.index ? 'Armed — choose a modifier from the library below' : 'Empty graft site'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Reforge Bay (§reforge): the ichor wheel — visible once the organism is AWAKE ── */}
          {tv.active && (
            <div className="mgl-block mgl-reforge">
              <div className="mgl-block-h">
                <span className="mgl-eyebrow">Reforge Bay</span>
                <span className="mgl-block-hint">
                  <CurrencyIcon id="ichor" size={12} title="Ichor" /> {view.ichor.toLocaleString()} ichor ·
                  {' '}{tv.reforge.usable} wheel slot{tv.reforge.usable === 1 ? '' : 's'} (combined graft rarity)
                </span>
              </div>
              {!tv.locked && (
                <p className="mgl-reforge-warn" role="note">
                  ⚠ The first spin <b>permanently binds</b> this organism to {tv.name} — its pieces can
                  never be moved or cleared again. Re-spins replace the slot's mod. There is no way back.
                </p>
              )}
              <div className="mgl-rf-slots">
                {tv.reforge.slots.map((r) => (
                  <div key={r.index} tabIndex={-1} className={`mgl-rf-slot${r.mod ? ' is-rolled' : ''}`} style={r.mod ? { ['--rc' as string]: r.mod.color } : undefined}>
                    <span className="mgl-rf-idx">{r.index + 1}</span>
                    {r.mod
                      ? <span className="mgl-rf-mod"><b>{r.mod.name}</b><i>{r.mod.rarity}</i><em>{r.mod.desc}</em></span>
                      : <span className="mgl-rf-empty">Unrolled</span>}
                    <button className="mgl-btn mgl-rf-spin" disabled={!r.affordable} onClick={() => spin(r.index)}
                      title={`Spin the wheel — ${r.cost} Ichor${r.mod ? ' (replaces the current mod)' : ''}`}>
                      {r.mod ? 'Re-spin' : 'Spin'} · <CurrencyIcon id="ichor" size={12} title="" /> {r.cost}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Sequenced-modifier library ── */}
          <div className="mgl-block">
            <div className="mgl-block-h">
              <span className="mgl-eyebrow">Sequenced Modifiers</span>
              <div className="mgl-cats" role="group" aria-label="Filter by class">
                <button className={`mgl-chip${cls === 'all' ? ' on' : ''}`} onClick={() => setCls('all')}>All</button>
                {COMBAT_CLASS_ORDER.map((c) => (
                  <button key={c} className={`mgl-chip mgl-chip-cls${cls === c ? ' on' : ''}`} style={{ ['--cc' as string]: COMBAT_CLASSES[c].color }}
                    onClick={() => setCls(c)} title={COMBAT_CLASSES[c].role}>
                    {COMBAT_CLASSES[c].glyph} {c}
                  </button>
                ))}
                <label className="mgl-sort">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as ModSort)} aria-label="Sort modifiers">
                    {(Object.keys(SORT_LABEL) as ModSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
                  </select>
                </label>
              </div>
            </div>
            {armedSite != null && view.owned.length > 0 && (
              <div className="mgl-arm-note" role="status">Grafting into site <b>{SITE[armedSite]}</b> — choose a modifier.</div>
            )}
            {armedSite == null && <div className="mgl-arm-note is-full">All graft sites full — clear a site to re-graft.</div>}
            {view.owned.length === 0 ? (
              <p className="mgl-empty">
                Nothing sequenced yet. Bio-Containers bleed <CurrencyIcon id="geneEssence" size={12} title="" /> Gene Essence;
                epic-or-better containers sequence a new modifier.
              </p>
            ) : (
              <div className="mgl-mods">
                {mods.map((m: OwnedModifier) => {
                  const reco = recoReason.get(m.id);
                  const tip = [
                    m.desc,
                    `${m.cls}: ${m.role}`,
                    reco ? `◎ ${reco}` : null,
                    m.bound ? `BOUND to ${m.hostName} (reforged)` : m.host && m.host !== tv.kind ? `Grafting here moves it off ${m.hostName}` : null,
                  ].filter(Boolean).join(' — ');
                  return (
                    <button key={m.id} className={`mgl-mod${m.bound ? ' is-bound' : ''}${reco ? ' is-reco' : ''}${m.cls === tv.hostClass ? ' is-match' : ''}`}
                      disabled={armedSite == null || m.bound || tv.locked}
                      onClick={() => equip(m.id)}
                      style={{ ['--mg' as string]: m.rarityColor, ['--cc' as string]: m.clsColor }}
                      title={tip}>
                      <span className="mgl-mod-glyph" aria-hidden>{m.clsGlyph}</span>
                      <span className="mgl-mod-name">{m.name}</span>
                      <span className="mgl-mod-sub">
                        <b className="mgl-mod-cls">{m.cls}</b> · {MULLIGAN_RARITY[m.rarity].label}
                        {m.level > 0 && <> · Lv {m.level}</>}
                        {m.upgradeable && <i className="mgl-mod-up" title="Upgrade affordable now"> ▲</i>}
                      </span>
                      {reco && <span className="mgl-mod-reco">◎ RECOMMENDED</span>}
                      {m.host && <span className={`mgl-mod-host${m.bound ? ' is-bound' : ''}`}>{m.bound ? '⊛ bound · ' : '→ '}{m.hostName}</span>}
                    </button>
                  );
                })}
                {mods.length === 0 && <p className="mgl-empty">No {cls === 'all' ? '' : `${cls} `}modifiers sequenced yet.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
      {wheel && <ReforgeWheelOverlay mod={wheel} onClose={() => setWheel(null)} />}
      {adaptCeremony && (
        <div className="evo-unlock mgl-adapt-cine" role="dialog" aria-label="Complete class adaptation" onClick={() => setAdaptCeremony(null)}>
          <div className="evo-rays" aria-hidden />
          <div className="evo-card mgl-adapt-card" onClick={(e) => e.stopPropagation()} style={{ ['--cc' as string]: COMBAT_CLASSES[adaptCeremony.cls].color }}>
            <div className="evo-eyebrow">⟡ COMPLETE CLASS ADAPTATION ⟡</div>
            <div className="mgl-adapt-cine-glyph" aria-hidden>{COMBAT_CLASSES[adaptCeremony.cls].glyph}</div>
            <h2 className="evo-title">{adaptCeremony.cls.toUpperCase()} SYNCHRONIZED</h2>
            <div className="mgl-adapt-cine-name">{adaptCeremony.title}</div>
            <p className="evo-blurb">{adaptCeremony.desc}</p>
            <p className="mgl-adapt-cine-foot">The organism has evolved — its crown is visible on the battlefield.</p>
            <button className="primary evo-continue" onClick={() => setAdaptCeremony(null)}>Continue</button>
          </div>
        </div>
      )}
    </div>
  );
}
