// Centralized gameplay event bus. A tiny, typed pub/sub so future systems subscribe
// to gameplay moments instead of being wired into the sim by hand. The sim EMITS;
// nothing in the sim subscribes (so the deterministic core stays decoupled and the
// golden runs are byte-identical). Emission is gated by `hasListeners`, so a run with
// no subscribers does zero work — no payload allocation, no behavior change.
//
// Determinism note: handlers run synchronously, in subscription order, on the same
// thread/tick as the emit — so subscribers are deterministic too. By default there
// are none, which is why adding this changes no gameplay (golden invariant).

import type { EnemyKind, TowerKind } from './types';

/** The catalogue of gameplay events + their payloads (extend by adding a key). */
export interface GameEventMap {
  enemyKilled: { id: number; kind: EnemyKind; x: number; y: number; bounty: number; byTower: TowerKind | null; isBoss: boolean };
  towerPlaced: { id: number; kind: TowerKind; slot: number };
  towerSold: { id: number; kind: TowerKind; slot: number; refund: number };
  waveStarted: { wave: number; endless: boolean };
  waveCompleted: { wave: number; endless: boolean };
  bossKilled: { defId: string; name: string; x: number; y: number };
  bossPhase: { defId: string; name: string; phase: number }; // a boss MUTATED into its next phase (docs/BOSS-DESIGN.md §phases)
  cardChosen: { id: string; rarity: string };
  equipmentEquipped: { slot: string; defId: string; rarity: string };
  heroSpawned: { kind: string };
  heroAbilityUsed: { kind: string }; // a hero's active ability was cast (drives the Combat Tutorial)
  lootContainerEarned: { rarity: string; banked: number; next: string }; // a bio-container completed on the LIVE loot meter (banked = vault count including it; next = the box now filling) — drives the fill toast + meter ceremony
  projectileHit: { x: number; y: number; damage: number; targetId: number; byTower: TowerKind | null };
}

export type GameEventType = keyof GameEventMap;
type Handler<T> = (payload: T) => void;

export class EventBus<M> {
  private listeners = new Map<keyof M, Set<Handler<unknown>>>();

  /** Subscribe; returns an unsubscribe function. */
  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Handler<unknown>);
    return () => this.off(type, fn);
  }

  off<K extends keyof M>(type: K, fn: Handler<M[K]>): void {
    this.listeners.get(type)?.delete(fn as Handler<unknown>);
  }

  /** True if anyone is listening — let the emitter skip building a payload if not. */
  hasListeners<K extends keyof M>(type: K): boolean {
    const set = this.listeners.get(type);
    return set !== undefined && set.size > 0;
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<M[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** The single app-wide gameplay bus. The sim + meta emit here; UIs/systems subscribe. */
export const gameEvents = new EventBus<GameEventMap>();
