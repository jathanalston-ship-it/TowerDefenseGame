// Universal modifier framework. ONE way to express every bonus — permanent or
// temporary, flat or scaling — so bonus math lives in a single, testable place
// instead of ad-hoc inline arithmetic. Supports: flat (+5 Range), percent (+10%
// Damage, summed then applied once), multiplier (×; folded left-to-right), plus
// conditional / temporary / persistent / runtime add+remove.
//
// Canonical formula:  (base + Σflat) × (1 + Σpercent) × ∏multipliers
//
// The multiplier fold is left-to-right in insertion order, and flat/percent default
// to 0 (so they are ×1 / +0 no-ops). That lets an existing "a*b*c" calculation be
// expressed as three multipliers and stay BIT-IDENTICAL — which is how the tower
// combat math migrates onto this system without any gameplay drift (golden invariant).

export type ModifierOp = 'flat' | 'percent' | 'mult';

export type ModifierContext = Record<string, unknown>;

export interface Modifier {
  op: ModifierOp;
  value: number;
  id?: string; // for runtime remove() / dedupe
  source?: string; // provenance (debug / UI)
  condition?: (ctx: ModifierContext) => boolean; // conditional — skipped when false
  remaining?: number; // temporary: seconds left (undefined ⇒ persistent)
}

/** The canonical bonus formula. Pure; no allocation needed by the caller. */
export function evalModifiers(base: number, mods: readonly Modifier[], ctx?: ModifierContext): number {
  let flat = 0;
  let percent = 0;
  let product = 1;
  for (const m of mods) {
    if (m.condition && !m.condition(ctx ?? {})) continue;
    if (m.op === 'flat') flat += m.value;
    else if (m.op === 'percent') percent += m.value;
    else product *= m.value;
  }
  return (base + flat) * (1 + percent) * product;
}

/** A pure multiplier chain (left-to-right). `combineMult(a,b,c) === a*b*c` exactly,
 * so it replaces inline multiplier products with no numeric change. */
export function combineMult(...factors: number[]): number {
  let p = 1;
  for (const f of factors) p *= f;
  return p;
}

/**
 * A live, mutable stack of modifiers on a single stat. Permanent and temporary
 * bonuses both live here; `tick` expires the temporary ones; `add`/`remove` are the
 * runtime hooks. Evaluate against a base whenever the stat is read.
 */
export class ModifierStack {
  private mods: Modifier[] = [];

  add(m: Modifier): this {
    this.mods.push(m);
    return this;
  }

  /** Add a self-expiring modifier (temporary buff/debuff). */
  addTemporary(op: ModifierOp, value: number, seconds: number, id?: string): this {
    this.mods.push({ op, value, remaining: seconds, id });
    return this;
  }

  remove(id: string): void {
    this.mods = this.mods.filter((m) => m.id !== id);
  }

  clear(): void {
    this.mods.length = 0;
  }

  get size(): number {
    return this.mods.length;
  }

  /** Advance temporary modifiers; drop the expired ones. Call once per tick. */
  tick(dt: number): void {
    let expired = false;
    for (const m of this.mods) {
      if (m.remaining !== undefined) {
        m.remaining -= dt;
        if (m.remaining <= 0) expired = true;
      }
    }
    if (expired) this.mods = this.mods.filter((m) => m.remaining === undefined || m.remaining > 0);
  }

  evaluate(base: number, ctx?: ModifierContext): number {
    return evalModifiers(base, this.mods, ctx);
  }
}
