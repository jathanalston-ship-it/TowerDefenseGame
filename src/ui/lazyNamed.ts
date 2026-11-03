// Code-split helper (docs/DEPLOYMENT.md §code-splitting): React.lazy wants a default export,
// but our screens are named exports. `lazyNamed(() => import('./X'), 'X')` keeps every screen's
// public API untouched. Keep this file dependency-free (React only).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<M extends Record<string, any>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
): M[K] extends ComponentType<infer P> ? LazyExoticComponent<ComponentType<P>> : never {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType<any> }))) as never;
}
