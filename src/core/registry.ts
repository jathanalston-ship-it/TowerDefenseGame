// Centralized content registry — the single mechanism EVERY content type plugs into
// (towers, heroes, enemies, cards, equipment, bosses, biomes). It exists so the game
// scales to hundreds of entries without hand-maintained master lists:
//
//   • Self-registration — content calls `register(def)`; there is no hardcoded order
//     array. Iteration order == registration order (deterministic, stable for saves).
//   • Validation — each registry can carry a per-def validator; `validate()` runs it.
//   • Versioning — `CONTENT_VERSION` + per-entry `version` let migrations reason about
//     stale content; aliases map renamed ids onto current ones.
//   • Modding — registration is open at runtime; entries carry a `source` ('core'|'mod')
//     and may be namespaced (`mod:id`). Nothing here is sealed.
//   • Save compatibility — content is referenced by STABLE string id; `resolve()` walks
//     aliases and `has()` lets the save layer drop unknown ids gracefully.
//
// Pure data structure: no DOM, no sim, no content imports — so every content module can
// depend on it without cycles.

/** Content-def schema version. Bump when a *def shape* changes (drives migrations). */
export const CONTENT_VERSION = 1;

export type ContentSource = 'core' | 'mod';

/** Bookkeeping attached to each registered entry (never part of the def itself). */
export interface ContentMeta {
  source: ContentSource; // 'core' (built-in) or 'mod' (registered at runtime)
  version: number; // content version the entry targets (defaults to CONTENT_VERSION)
  deprecated: boolean; // kept only for save back-compat; hidden from new content rolls
}

export interface RegistryOptions<T> {
  /** Extract the stable string id from a def (e.g. `d => d.kind` or `d => d.id`). */
  idOf: (def: T) => string;
  /** Optional invariant check; returns problem messages (empty = valid). */
  validate?: (def: T) => string[];
}

export interface RegisterOptions {
  source?: ContentSource;
  version?: number;
  deprecated?: boolean;
}

/**
 * An ordered, id-keyed collection of content defs of one type. Generic over the def
 * shape; the id is extracted via `idOf`, so existing defs keyed by `kind` or `id` plug
 * in unchanged.
 */
export class Registry<T> {
  private readonly map = new Map<string, T>();
  private readonly order: string[] = []; // registration order — the canonical iteration
  private readonly metaById = new Map<string, ContentMeta>();
  private readonly aliases = new Map<string, string>(); // legacy id -> canonical id
  private readonly idOf: (def: T) => string;
  private readonly validator?: (def: T) => string[];

  constructor(public readonly name: string, opts: RegistryOptions<T>) {
    this.idOf = opts.idOf;
    this.validator = opts.validate;
  }

  /** Register one def. Throws on a duplicate id (authoring / mod collision). */
  register(def: T, opts: RegisterOptions = {}): T {
    const id = this.idOf(def);
    if (!id) throw new Error(`[registry:${this.name}] entry is missing an id`);
    if (this.map.has(id)) throw new Error(`[registry:${this.name}] duplicate id '${id}'`);
    this.map.set(id, def);
    this.order.push(id);
    this.metaById.set(id, {
      source: opts.source ?? 'core',
      version: opts.version ?? CONTENT_VERSION,
      deprecated: opts.deprecated ?? false,
    });
    return def;
  }

  /** Bulk register, preserving iteration order (e.g. all core defs of a Record). */
  registerAll(defs: Iterable<T>, opts: RegisterOptions = {}): void {
    for (const d of defs) this.register(d, opts);
  }

  /** Map a legacy/renamed id onto a current canonical id (save compatibility). */
  alias(legacyId: string, currentId: string): void {
    this.aliases.set(legacyId, currentId);
  }

  /** Resolve an id through aliases to a registered canonical id, or undefined. */
  resolve(id: string): string | undefined {
    if (this.map.has(id)) return id;
    const aliased = this.aliases.get(id);
    return aliased !== undefined && this.map.has(aliased) ? aliased : undefined;
  }

  has(id: string): boolean {
    return this.resolve(id) !== undefined;
  }

  get(id: string): T | undefined {
    const canonical = this.resolve(id);
    return canonical !== undefined ? this.map.get(canonical) : undefined;
  }

  /** Like `get`, but throws on an unknown id (use where content MUST exist). */
  require(id: string): T {
    const def = this.get(id);
    if (def === undefined) throw new Error(`[registry:${this.name}] unknown id '${id}'`);
    return def;
  }

  metaOf(id: string): ContentMeta | undefined {
    const canonical = this.resolve(id);
    return canonical !== undefined ? this.metaById.get(canonical) : undefined;
  }

  /** Ids in registration order (a fresh array — safe to keep). */
  ids(): string[] {
    return this.order.slice();
  }

  /** Defs in registration order. */
  all(): T[] {
    return this.order.map((id) => this.map.get(id)!);
  }

  /** All non-deprecated defs (what new content rolls / drafts should sample). */
  active(): T[] {
    return this.order.filter((id) => !this.metaById.get(id)!.deprecated).map((id) => this.map.get(id)!);
  }

  get size(): number {
    return this.order.length;
  }

  /** Run this registry's validator over every entry; returns prefixed problems. */
  validate(): string[] {
    if (!this.validator) return [];
    const out: string[] = [];
    for (const id of this.order) {
      for (const p of this.validator(this.map.get(id)!)) out.push(`${this.name} '${id}': ${p}`);
    }
    return out;
  }
}
