// DESIGN INTELLIGENCE LAYER — the graph engine (docs/DIL.md). The project's knowledge is a typed,
// bidirectional graph: every system, content entity, concept, doc, tutorial, achievement and test
// is a NODE with stable id; every relationship is a typed EDGE with an automatic inverse. The graph
// is BUILT from the real registries (src/dev/dil/nodes.ts) plus curated design knowledge
// (knowledge.ts), so it can never drift from the shipped game — and querying it replaces
// repository-wide searching ("what does this affect?" is a lookup, not an investigation).
//
// Dev-only module: imported by tests, the CLI (npm run dil) and the doc generator — never by app code.

export type NodeKind =
  | 'system' // an engineering system (mirrors src/dev/systemRegistry.ts)
  | 'concept' // a cross-cutting design concept (power score, biomass, determinism, …)
  | 'tower' | 'hero' | 'enemy' | 'boss' | 'megaboss' | 'biome' // content entities (auto-ingested)
  | 'mode' // campaign / infinite / boss rush / daily
  | 'currency' // biomass, cores, shards, essence, materials, …
  | 'music' | 'doc' | 'guide' | 'tutorial' | 'help' | 'achievement' | 'test';

export interface DilNode {
  id: string; // stable slug: '<kind>:<key>' (e.g. 'tower:needle', 'concept:power-score')
  kind: NodeKind;
  name: string;
  summary: string; // one line — what this IS
  /** Where it lives (files/paths) when that's meaningful. */
  at?: string;
}

/** Forward edge kinds. Every kind has an INVERSE (below) so traversal is bidirectional:
 *  storing `A gates B` automatically answers `B gatedBy A`. */
export type EdgeKind =
  | 'dependsOn' // A needs B to function
  | 'provides' // A supplies a capability/value B consumes
  | 'consumes' // A reads/spends what B provides
  | 'unlocks' // A makes B available to the player
  | 'gates' // A blocks B until satisfied (progression)
  | 'displays' // A (UI/HUD) shows B
  | 'modifies' // A changes B's behavior/values at runtime
  | 'balances' // A is a tuning counterweight to B
  | 'references' // A mentions/links B
  | 'documents' // A (doc/guide) explains B
  | 'teaches' // A (tutorial/help) teaches B
  | 'tests' // A (test) validates B
  | 'rewards' // A pays out B (currency/content)
  | 'triggers' // A causes B to happen
  | 'visualizes' // A renders B's state
  | 'extends' // A builds on top of B (future hooks land here)
  | 'plans' // A is a PLANNED extension of B (not yet built)
  | 'conflictsWith' // symmetric: changing one endangers the other
  | 'partOf'; // A belongs to B (content → owning system)

export const EDGE_INVERSE: Record<EdgeKind, string> = {
  dependsOn: 'requiredBy',
  provides: 'providedBy',
  consumes: 'consumedBy',
  unlocks: 'unlockedBy',
  gates: 'gatedBy',
  displays: 'displayedBy',
  modifies: 'modifiedBy',
  balances: 'balancedBy',
  references: 'referencedBy',
  documents: 'documentedBy',
  teaches: 'taughtBy',
  tests: 'testedBy',
  rewards: 'rewardedBy',
  triggers: 'triggeredBy',
  visualizes: 'visualizedBy',
  extends: 'extendedBy',
  plans: 'plannedBy',
  conflictsWith: 'conflictsWith', // symmetric
  partOf: 'contains',
};
export const EDGE_KINDS = Object.keys(EDGE_INVERSE) as EdgeKind[];

export interface DilEdge {
  from: string;
  kind: EdgeKind;
  to: string;
  /** Why — one short clause. Curated edges should carry this; ingested edges may omit it. */
  note?: string;
}

export interface EdgeView { kind: string; other: string; note?: string; direction: 'out' | 'in' }

export class DilGraph {
  private nodes = new Map<string, DilNode>();
  private out = new Map<string, DilEdge[]>();
  private inc = new Map<string, DilEdge[]>();
  readonly edges: DilEdge[] = [];

  addNode(n: DilNode): void {
    if (this.nodes.has(n.id)) throw new Error(`DIL: duplicate node id '${n.id}'`);
    this.nodes.set(n.id, n);
  }

  /** Idempotent add for ingestion passes that may see the same entity twice. */
  ensureNode(n: DilNode): void {
    if (!this.nodes.has(n.id)) this.nodes.set(n.id, n);
  }

  addEdge(from: string, kind: EdgeKind, to: string, note?: string): void {
    const e: DilEdge = { from, kind, to, note };
    this.edges.push(e);
    if (!this.out.has(from)) this.out.set(from, []);
    this.out.get(from)!.push(e);
    if (!this.inc.has(to)) this.inc.set(to, []);
    this.inc.get(to)!.push(e);
  }

  node(id: string): DilNode | undefined { return this.nodes.get(id); }
  allNodes(): DilNode[] { return [...this.nodes.values()]; }
  byKind(kind: NodeKind): DilNode[] { return this.allNodes().filter((n) => n.kind === kind); }
  size(): { nodes: number; edges: number } { return { nodes: this.nodes.size, edges: this.edges.length }; }

  /** All relationships of a node, both directions, with inverse labels applied. */
  edgesOf(id: string): EdgeView[] {
    const o = (this.out.get(id) ?? []).map((e) => ({ kind: e.kind, other: e.to, note: e.note, direction: 'out' as const }));
    const i = (this.inc.get(id) ?? []).map((e) => ({ kind: EDGE_INVERSE[e.kind], other: e.from, note: e.note, direction: 'in' as const }));
    return [...o, ...i];
  }

  /** "Who <verb>s this?" — e.g. who('tests', 'tower:needle') → every test validating it. */
  who(kind: EdgeKind, targetId: string): DilNode[] {
    return (this.inc.get(targetId) ?? []).filter((e) => e.kind === kind).map((e) => this.nodes.get(e.from)!).filter(Boolean);
  }

  /** Transitive DOWNSTREAM impact: everything that (directly or through others) depends on,
   *  consumes, displays, is gated by … `id`. THE "what does changing this affect?" query. */
  affects(id: string, maxDepth = 6): { node: DilNode; via: string; depth: number }[] {
    return this.walk(id, 'in', maxDepth);
  }

  /** Transitive UPSTREAM requirements: everything `id` is built on. */
  requires(id: string, maxDepth = 6): { node: DilNode; via: string; depth: number }[] {
    return this.walk(id, 'out', maxDepth);
  }

  private walk(id: string, dir: 'in' | 'out', maxDepth: number): { node: DilNode; via: string; depth: number }[] {
    // Impact flows against structural edges: if A dependsOn/consumes/displays/visualizes B,
    // changing B affects A. Documentation/test edges are reported at depth 1 only (they
    // matter for the checklist, not for transitive blast radius).
    const STRUCTURAL: EdgeKind[] = ['dependsOn', 'consumes', 'displays', 'visualizes', 'modifies', 'extends', 'gates', 'unlocks', 'rewards', 'triggers', 'partOf', 'provides'];
    const seen = new Set<string>([id]);
    const outList: { node: DilNode; via: string; depth: number }[] = [];
    let frontier = [id];
    for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
      const next: string[] = [];
      for (const cur of frontier) {
        const edges = dir === 'in' ? (this.inc.get(cur) ?? []) : (this.out.get(cur) ?? []);
        for (const e of edges) {
          if (depth > 1 && !STRUCTURAL.includes(e.kind)) continue;
          const otherId = dir === 'in' ? e.from : e.to;
          if (seen.has(otherId)) continue;
          seen.add(otherId);
          const n = this.nodes.get(otherId);
          if (!n) continue;
          outList.push({ node: n, via: dir === 'in' ? EDGE_INVERSE[e.kind] : e.kind, depth });
          next.push(otherId);
        }
      }
      frontier = next;
    }
    return outList;
  }

  /** Gap query: nodes of `kind` with NO incoming edge of `edgeKind` — e.g. missing('tower',
   *  'documents') = every tower nothing documents; missing('system','tests') = untested systems. */
  missing(kind: NodeKind, edgeKind: EdgeKind): DilNode[] {
    return this.byKind(kind).filter((n) => !(this.inc.get(n.id) ?? []).some((e) => e.kind === edgeKind));
  }

  /** Substring search over ids, names and summaries (the CLI's `find`). */
  find(text: string): DilNode[] {
    const q = text.toLowerCase();
    return this.allNodes().filter((n) => n.id.includes(q) || n.name.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q));
  }

  /** Integrity: dangling edge endpoints + fully orphaned nodes (no edges at all). Docs are
   *  exempt from the orphan rule — an unreferenced doc is INVENTORY the gap report surfaces
   *  for review, not a graph error. */
  validate(): string[] {
    const problems: string[] = [];
    for (const e of this.edges) {
      if (!this.nodes.has(e.from)) problems.push(`edge from missing node '${e.from}' (${e.kind} → ${e.to})`);
      if (!this.nodes.has(e.to)) problems.push(`edge to missing node '${e.to}' (${e.from} ${e.kind} →)`);
    }
    for (const n of this.nodes.values()) {
      if (n.kind === 'doc') continue;
      if (!(this.out.get(n.id)?.length || this.inc.get(n.id)?.length)) problems.push(`orphan node '${n.id}' — nothing connects to it`);
    }
    return problems;
  }
}
