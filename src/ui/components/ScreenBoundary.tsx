// PER-SCREEN ERROR BOUNDARY (docs/DEPLOYMENT.md §code-splitting) — one hub screen that fails
// (a lazy chunk that won't load on a flaky network or across a deploy, or a render crash) shows
// a local recovery card INSIDE the content area: the nav rail, the top bar and every other
// screen keep working. Retry remounts the screen with a fresh loader (lazyNamed already retried
// the import once on its own); Back walks the hub history. The app-level boundary in
// main.tsx stays the last-resort net for shell crashes.

import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { retryFailedScreens } from '../lazyNamed';

interface Props {
  children: ReactNode;
  onBack: () => void;
}
interface State {
  error: Error | null;
  attempt: number; // bumps on Retry → the screen subtree remounts from scratch
}

/** A failed dynamic import (vs. a render bug) — worded as a connection problem. */
function isChunkError(e: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch|error loading|ChunkLoadError/i.test(`${e.name} ${e.message}`);
}

export class ScreenBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ScreenBoundary] screen failed:', error, info.componentStack); // never swallow
  }

  private retry = (): void => {
    retryFailedScreens(); // a failed chunk gets a fresh loader (React.lazy cached the rejection)
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render(): ReactNode {
    const { error, attempt } = this.state;
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>;
    return (
      <div className="screen-err" role="alert">
        <div className="screen-err-k">⚠ This screen didn't load</div>
        <p className="screen-err-p">
          {isChunkError(error)
            ? 'The connection dropped while fetching it.'
            : 'It hit an unexpected error.'}{' '}
          Your progress is safe — try again, or head back.
        </p>
        <div className="screen-err-row">
          <button type="button" className="primary" onClick={this.retry}>↻ Retry</button>
          <button type="button" onClick={this.props.onBack}>‹ Back</button>
        </div>
      </div>
    );
  }
}
