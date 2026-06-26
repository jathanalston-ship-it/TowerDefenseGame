import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Top-level safety net: if any descendant throws during render/lifecycle, show a
 * recovery screen instead of a blank page. Saved progress lives in localStorage and
 * is untouched by a render crash, so a reload recovers cleanly.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it — never swallow silently.
    console.error('[ErrorBoundary] Unhandled UI error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <h1>Something went wrong</h1>
          <p>
            The game hit an unexpected error. Your saved progress is safe in this browser —
            reloading will recover it.
          </p>
          <pre className="crash-msg">{error.message || String(error)}</pre>
          <button className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
