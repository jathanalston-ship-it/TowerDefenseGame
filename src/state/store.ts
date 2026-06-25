// Minimal external store bridged to React via useSyncExternalStore (React 18) —
// avoids a state-management dependency and keeps store logic usable outside React.

import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T): void;
  subscribe(fn: () => void): () => void;
  use(): T;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  const subscribe = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const get = (): T => state;
  const set = (next: T): void => {
    if (next === state) return;
    state = next;
    for (const l of listeners) l();
  };
  const use = (): T => useSyncExternalStore(subscribe, get, get);

  return { get, set, subscribe, use };
}
