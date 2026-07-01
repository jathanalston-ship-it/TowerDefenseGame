// The tutorial MODE — its own screen (not baked into Campaign). It mounts a backdrop + the reusable
// TutorialOverlay, which is driven entirely by the tutorial session store. When the session ends
// (final checkpoint completed OR skipped → store null) it leaves back to the hub. The combat lessons
// (and the simplified, fail-safe encounter they run over) are authored later; this runner is the
// stable host. Framework rule: a tutorial LOSS calls tutorial.restartCheckpoint() — never a full
// restart — so lessons wire their loss handler to that.

import { useEffect, useRef } from 'react';
import { tutorial } from '../state/tutorial';
import { TutorialOverlay } from './tutorial/TutorialOverlay';

export function TutorialRunner({ onExit }: { onExit: () => void }): JSX.Element {
  const session = tutorial.use();
  // Leave only AFTER the session was active and then ended (avoids an immediate bounce if the store
  // hasn't been started yet on the first render).
  const wasActive = useRef(false);
  useEffect(() => {
    if (session) wasActive.current = true;
    else if (wasActive.current) onExit();
  }, [session, onExit]);

  return (
    <div className="tut-runner">
      <div className="tut-runner-bg" aria-hidden>
        <div className="tut-runner-title">Combat Tutorial</div>
      </div>
      <TutorialOverlay />
    </div>
  );
}
