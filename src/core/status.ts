// Universal status-effect framework. Effects are DATA (a StatusEffectDef registry) +
// a small RULES ENGINE that applies / stacks / ticks them per each def's configurable
// rule. The point is ONE place to add an effect — a single def carrying its stacking
// rule, duration, max stacks, visuals, UI icon, and modifier hooks — run by one engine,
// instead of dozens of bespoke implementations. Pure (no Game/DOM): the sim decides
// WHEN to apply/read; this module owns HOW they stack, tick, and combine.

import { Registry } from './registry';

/** UI/category grouping (drives icon tint + how the HUD groups it). */
export type StatusCategory = 'dot' | 'control' | 'debuff' | 'buff';

/** How re-applying an already-active effect combines with the live instance. */
export type StackRule =
  | 'refresh' // reset duration to full (Corrosion, Disruption, Slow, Freeze)
  | 'stack' // +stacks up to maxStacks AND refresh duration (Fracture, Infection, Burn)
  | 'extend' // add another duration onto what remains (Poison)
  | 'ignore'; // first application wins; re-apply is a no-op until it expires (Stun)

export interface StatusEffectDef {
  id: string;
  name: string;
  category: StatusCategory;
  stack: StackRule;
  maxStacks: number; // 1 for non-stacking effects
  baseDuration: number; // seconds (0 = permanent until cleared/consumed)
  color: string; // aura / icon tint
  icon: string; // short HUD glyph (placeholder until sprite art)
  // ── Potency descriptors (read by aggregate()/tick); applied per stack ──
  dps?: number; // damage per second per stack (Burn / Poison / generic DoT)
  ignoresArmor?: boolean; // DoT bypasses armor (biological)
  slowPct?: number; // movement slow fraction (Slow / Freeze / Stun=1)
  damageTakenMult?: number; // +incoming-damage fraction per stack (Vulnerability)
  armorShred?: number; // flat armor removed per stack (Armor Break / Corrosion)
  disablesAttack?: boolean; // Stun / Freeze / Fear / Silence — can't act
  flees?: boolean; // Fear — the victim breaks off and scatters AWAY from the Hive while active
  refractorySec?: number; // post-expiry immunity window: the SAME effect can't reapply for this
  // long after it ends (kills perma-CC loops — chain-freeze/fear from stacked towers)
  hastePct?: number; // +action speed (buff: Haste)
  regenPerSec?: number; // heal per second (buff: Regeneration)
  shield?: number; // absorb pool (buff: Shield)
  /** Future modifier hook: open tags a card/relic/mutation can key off. */
  tags?: string[];
}

export const statusRegistry = new Registry<StatusEffectDef>('status', {
  idOf: (d) => d.id,
  validate: (d) => {
    const out: string[] = [];
    if (d.maxStacks < 1) out.push('maxStacks must be >= 1');
    if (d.baseDuration < 0) out.push('baseDuration must be >= 0');
    if (d.stack === 'stack' && d.maxStacks < 2) out.push("a 'stack' effect should allow maxStacks >= 2");
    return out;
  },
});

const def = (d: StatusEffectDef): StatusEffectDef => statusRegistry.register(d);

// ── The launch effect catalog (DATA — one line each, run by one engine) ──────
// The first four already live in the sim and are registered here so the framework is the
// single catalog (stacking rules + visuals + icons unified). The rest are framework-ready:
// applying one runs entirely through the engine below — no bespoke per-effect sim code.
export const STATUS_EFFECTS = {
  fracture: def({ id: 'fracture', name: 'Fracture', category: 'debuff', stack: 'stack', maxStacks: 6, baseDuration: 0, color: '#5ad1ff', icon: 'FR', armorShred: 2, damageTakenMult: 0.04 }),
  corrosion: def({ id: 'corrosion', name: 'Corrosion', category: 'dot', stack: 'refresh', maxStacks: 1, baseDuration: 3.0, color: '#96dc46', icon: 'CO', dps: 7, armorShred: 4, slowPct: 0.25 }),
  infection: def({ id: 'infection', name: 'Infection', category: 'dot', stack: 'stack', maxStacks: 8, baseDuration: 0, color: '#e24dff', icon: 'IN', dps: 2, ignoresArmor: true }),
  disruption: def({ id: 'disruption', name: 'Disruption', category: 'control', stack: 'refresh', maxStacks: 1, baseDuration: 1.6, color: '#7883ff', icon: 'DS', slowPct: 0.35, damageTakenMult: 0.25 }),
  // Framework-ready effects (no bespoke sim code — the engine runs them):
  poison: def({ id: 'poison', name: 'Poison', category: 'dot', stack: 'extend', maxStacks: 1, baseDuration: 4.0, color: '#9be24d', icon: 'PO', dps: 6, ignoresArmor: true }),
  burn: def({ id: 'burn', name: 'Burn', category: 'dot', stack: 'stack', maxStacks: 5, baseDuration: 3.0, color: '#ff8a3d', icon: 'BU', dps: 5 }),
  slow: def({ id: 'slow', name: 'Slow', category: 'control', stack: 'refresh', maxStacks: 1, baseDuration: 2.0, color: '#8fd6ff', icon: 'SL', slowPct: 0.4 }),
  armorBreak: def({ id: 'armorBreak', name: 'Armor Break', category: 'debuff', stack: 'refresh', maxStacks: 1, baseDuration: 3.0, color: '#ffd24d', icon: 'AB', armorShred: 999 }),
  stun: def({ id: 'stun', name: 'Stun', category: 'control', stack: 'ignore', maxStacks: 1, baseDuration: 1.0, color: '#ffe066', icon: 'ST', disablesAttack: true, slowPct: 1 }),
  // STRAIN static charge (docs/STRAIN.md — Neural Obelisk ladder): a pure ACCUMULATOR the
  // obelisk's discharge reads at its threshold. No aggregate fields ⇒ inert to move/vuln folds.
  charge: def({ id: 'charge', name: 'Static Charge', category: 'debuff', stack: 'stack', maxStacks: 12, baseDuration: 5.0, color: '#ffd24d', icon: 'CH' }),
  freeze: def({ id: 'freeze', name: 'Freeze', category: 'control', stack: 'refresh', maxStacks: 1, baseDuration: 1.5, color: '#7fe9ff', icon: 'FZ', disablesAttack: true, slowPct: 1, refractorySec: 3.5 }),
  fear: def({ id: 'fear', name: 'Fear', category: 'control', stack: 'refresh', maxStacks: 1, baseDuration: 1.5, color: '#c08aff', icon: 'FE', disablesAttack: true, flees: true, refractorySec: 4.0 }),
  silence: def({ id: 'silence', name: 'Silence', category: 'control', stack: 'refresh', maxStacks: 1, baseDuration: 2.0, color: '#b0b0c0', icon: 'SI', disablesAttack: true }),
  regen: def({ id: 'regen', name: 'Regeneration', category: 'buff', stack: 'refresh', maxStacks: 1, baseDuration: 5.0, color: '#7cfc9b', icon: 'RE', regenPerSec: 8 }),
  shield: def({ id: 'shield', name: 'Shield', category: 'buff', stack: 'refresh', maxStacks: 1, baseDuration: 6.0, color: '#9ad0ff', icon: 'SH', shield: 50 }),
  haste: def({ id: 'haste', name: 'Haste', category: 'buff', stack: 'refresh', maxStacks: 1, baseDuration: 4.0, color: '#ffd24d', icon: 'HA', hastePct: 0.3 }),
} as const;

// ── The rules engine (pure; operates on a list of live effects) ──────────────

/** A live effect instance carried by an entity. */
export interface ActiveStatus {
  id: string;
  stacks: number;
  remaining: number; // seconds left (Infinity = until cleared/consumed)
}

/** Apply (or re-apply) an effect to a status list per the def's stacking rule. */
export function applyStatus(list: ActiveStatus[], d: StatusEffectDef, amount = 1): void {
  const dur = d.baseDuration > 0 ? d.baseDuration : Infinity;
  const add = Math.max(1, amount);
  const cur = list.find((s) => s.id === d.id);
  // Refractory window (stacks 0 = the expired-effect marker counting down its immunity):
  // the same effect bounces off until the marker clears — perma-CC is impossible by design.
  if (cur && cur.stacks === 0 && d.refractorySec !== undefined) return;
  if (!cur) {
    list.push({ id: d.id, stacks: Math.min(d.maxStacks, add), remaining: dur });
    return;
  }
  switch (d.stack) {
    case 'refresh':
      cur.remaining = dur;
      cur.stacks = Math.min(d.maxStacks, Math.max(cur.stacks, add));
      break;
    case 'stack':
      cur.stacks = Math.min(d.maxStacks, cur.stacks + add);
      cur.remaining = dur;
      break;
    case 'extend':
      cur.remaining = cur.remaining === Infinity ? Infinity : cur.remaining + dur;
      break;
    case 'ignore':
      break; // first application wins
  }
}

/** Per-tick deltas the sim applies after ticking (DoT damage, regen heal). Control /
 * debuff potency is read separately via aggregate(). */
export interface StatusTick {
  dotDamage: number; // armor-respecting DoT this tick
  trueDamage: number; // armor-ignoring DoT this tick
  heal: number; // regen this tick
  /** Effect ids that JUST ended this tick (expired or entered refractory) — the on-break
   *  channel expiry verbs ride (resin slicks, shatter bursts, death knells). Allocated only
   *  when something actually expires, so the common path stays allocation-free. */
  expired?: string[];
}

/** Count effects down, drop expired, and return this tick's damage/heal deltas. */
export function tickStatuses(list: ActiveStatus[], dt: number): StatusTick {
  let dotDamage = 0;
  let trueDamage = 0;
  let heal = 0;
  let expired: string[] | undefined;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const d = statusRegistry.get(s.id);
    if (!d) {
      list.splice(i, 1);
      continue;
    }
    if (d.dps) {
      const amt = d.dps * s.stacks * dt;
      if (d.ignoresArmor) trueDamage += amt;
      else dotDamage += amt;
    }
    if (d.regenPerSec) heal += d.regenPerSec * dt;
    if (s.remaining !== Infinity) {
      s.remaining -= dt;
      if (s.remaining <= 0) {
        if (d.refractorySec !== undefined && s.stacks > 0) {
          s.stacks = 0; // becomes the inert refractory marker (aggregate/DoT skip stacks 0)
          s.remaining = d.refractorySec;
          (expired ??= []).push(s.id);
        } else if (s.stacks > 0) {
          list.splice(i, 1);
          (expired ??= []).push(s.id);
        } else {
          list.splice(i, 1); // a refractory marker quietly clearing — not an expiry event
        }
      }
    }
  }
  return { dotDamage, trueDamage, heal, expired };
}

/** Combined control/debuff state the sim reads each tick (movement, gating, vuln). */
export interface StatusAggregate {
  slowPct: number; // strongest slow wins (0..1)
  damageTakenMult: number; // additive vulnerability (sums across effects/stacks)
  armorShred: number; // total flat armor removed
  disabled: boolean; // any control effect prevents acting
  fleeing: boolean; // a flees-effect (Fear) is active — scatter away from the Hive
  hardStop: boolean; // a NON-flees control (Stun/Freeze) pins the body — movement fully stops
  hastePct: number;
}

export function aggregate(list: ActiveStatus[]): StatusAggregate {
  let slowPct = 0;
  let damageTakenMult = 0;
  let armorShred = 0;
  let disabled = false;
  let fleeing = false;
  let hardStop = false;
  let hastePct = 0;
  for (const s of list) {
    if (s.stacks <= 0) continue; // inert refractory marker — no potency while it counts down
    const d = statusRegistry.get(s.id);
    if (!d) continue;
    if (d.slowPct) slowPct = Math.max(slowPct, d.slowPct);
    if (d.damageTakenMult) damageTakenMult += d.damageTakenMult * s.stacks;
    if (d.armorShred) armorShred += d.armorShred * s.stacks;
    if (d.disablesAttack) {
      disabled = true;
      if (!d.flees) hardStop = true; // fear disables the ATTACK but the body still runs
    }
    if (d.flees) fleeing = true;
    if (d.hastePct) hastePct = Math.max(hastePct, d.hastePct);
  }
  return { slowPct, damageTakenMult, armorShred, disabled, fleeing, hardStop, hastePct };
}
