// LIST ORGANIZATION framework (docs/UI-STANDARDS.md §lists) — ONE generic organizer for
// every long-list screen (tower rail, hero roster, Evolution HQ, Gene Archive, inventory…).
// The content targets (100 towers, 30 heroes, 1000 upgrades, 500 cards) make every flat
// list a future scroll-wall; this module turns "add organization to a screen" into DATA:
//
//   • a surface declares its SPEC — how a row is searched, its sort modes, its filter
//     chips, its optional group-by modes, and what always LEADS (favorites/pins);
//   • `organizeList` applies query → filters → sort → lead → grouping in one pass-set;
//   • the player's choices persist per surface via prefs.listOrgPrefs (device-local
//     curation, never in the save — the same contract as the Tower Lab bench prefs).
//
// Pure and UI-free: the shared control row (ui/components/ListControls.tsx) renders the
// spec; screens keep their own row markup. A future screen = one spec + one control row.

export interface ListSortDef<T> {
  id: string;
  label: string;
  /** Sort key. Numbers order DESCENDING by default (biggest first — power, stars, recency);
   *  strings order ASCENDING (a→z). Override with `dir`. */
  by: (row: T) => number | string;
  dir?: 'asc' | 'desc';
}

export interface ListFilterDef<T> {
  id: string;
  label: string;
  test: (row: T) => boolean;
  title?: string; // tooltip
}

export interface ListGroupDef<T> {
  id: string;
  label: string;
  keyOf: (row: T) => string;
  /** Fixed group order (unlisted keys append in first-appearance order). */
  groupOrder?: readonly string[];
  groupLabel?: (key: string) => string;
}

export interface ListOrgSpec<T> {
  /** The searchable text of a row (omit = the surface has no search box). */
  searchText?: (row: T) => string;
  /** sorts[0] is the default order (usually the authored/doctrine order). */
  sorts: ListSortDef<T>[];
  filters?: ListFilterDef<T>[];
  groups?: ListGroupDef<T>[];
  /** Rows with a HIGHER lead weight always float first within the chosen order
   *  (favorites/pins — curation beats sorting; ties keep the sort order). */
  lead?: (row: T) => number;
}

export interface ListOrgState {
  query: string;
  sort: string;
  filters: string[]; // ACTIVE filter ids (each ANDs its test)
  group: string | null; // active group-by mode (null = flat)
  collapsed: string[]; // collapsed group keys (the UI's fold state, persisted)
}

export interface ListGroupOut<T> {
  key: string;
  label: string;
  rows: T[];
}

export interface ListOrgOut<T> {
  rows: T[]; // the organized FLAT list (grouping never changes membership/order)
  groups: ListGroupOut<T>[] | null; // present when a group mode is active
  total: number; // rows in
  shown: number; // rows out (drives "N of M shown" + empty states)
}

export function defaultListState<T>(spec: ListOrgSpec<T>): ListOrgState {
  return { query: '', sort: spec.sorts[0]?.id ?? 'default', filters: [], group: null, collapsed: [] };
}

export function organizeList<T>(rows: readonly T[], spec: ListOrgSpec<T>, state: ListOrgState): ListOrgOut<T> {
  const q = state.query.trim().toLowerCase();
  const active = (spec.filters ?? []).filter((f) => state.filters.includes(f.id));
  let out = rows.filter((r) => {
    for (const f of active) if (!f.test(r)) return false;
    if (q && spec.searchText && !spec.searchText(r).toLowerCase().includes(q)) return false;
    return true;
  });

  const sort = spec.sorts.find((s) => s.id === state.sort) ?? spec.sorts[0];
  if (sort) {
    // Stable: decorate with the incoming index so equal keys keep their authored order.
    const keyed = out.map((row, i) => ({ row, i, k: sort.by(row) }));
    const dir = sort.dir ?? (typeof keyed[0]?.k === 'string' ? 'asc' : 'desc');
    const sgn = dir === 'asc' ? 1 : -1;
    keyed.sort((a, b) => {
      const cmp = typeof a.k === 'string' || typeof b.k === 'string'
        ? String(a.k).localeCompare(String(b.k))
        : (a.k as number) - (b.k as number);
      return cmp !== 0 ? sgn * cmp : a.i - b.i;
    });
    out = keyed.map((e) => e.row);
  }
  if (spec.lead) {
    const lead = spec.lead;
    const keyed = out.map((row, i) => ({ row, i, w: lead(row) }));
    keyed.sort((a, b) => (b.w - a.w) || (a.i - b.i));
    out = keyed.map((e) => e.row);
  }

  let groups: ListGroupOut<T>[] | null = null;
  const gdef = state.group ? spec.groups?.find((g) => g.id === state.group) : undefined;
  if (gdef) {
    const buckets = new Map<string, T[]>();
    for (const k of gdef.groupOrder ?? []) buckets.set(k, []);
    for (const row of out) {
      const k = gdef.keyOf(row);
      const list = buckets.get(k);
      if (list) list.push(row);
      else buckets.set(k, [row]);
    }
    groups = [...buckets.entries()]
      .filter(([, list]) => list.length > 0)
      .map(([key, list]) => ({ key, label: gdef.groupLabel?.(key) ?? key, rows: list }));
  }

  return { rows: out, groups, total: rows.length, shown: out.length };
}

/** Toggle helper for filter chips / collapsed groups (returns a NEW array). */
export function toggleIn(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
