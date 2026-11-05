// The opening film's MOUNT (docs/GAME-FEEL.md §intro) — loads ui/InitCutscene as its own chunk, so the
// boot bundle never carries the film (only a first boot or a Settings → Help replay fetches it).
// While the chunk arrives: a black stage that already holds the tutorial's cold-open clock
// (introState.useIntroPlaying). If the chunk can't load, the film is skipped — never a stuck black screen.

import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { lazyNamed } from './lazyNamed';
import { setIntroPlaying } from './introState';

const InitCutscene = lazyNamed(() => import('./InitCutscene'), 'InitCutscene');

function IntroHold(): JSX.Element {
  useEffect(() => { setIntroPlaying(true); }, []); // the film itself clears it on unmount
  return <div className="intro intro-hold" aria-hidden />;
}

class SkipOnError extends Component<{ onSkip: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: Error): void {
    console.error('[IntroMount] the opening film failed — skipping it:', error); // never swallow
    setIntroPlaying(false);
    this.props.onSkip();
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function IntroMount({ onDone }: { onDone: (dived?: boolean) => void }): JSX.Element {
  return (
    <SkipOnError onSkip={() => onDone()}>
      <Suspense fallback={<IntroHold />}>
        <InitCutscene onDone={onDone} />
      </Suspense>
    </SkipOnError>
  );
}
