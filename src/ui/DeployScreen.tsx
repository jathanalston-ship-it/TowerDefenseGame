// Deployment interstitial — the short breath between the Command Center and the battlefield.
// A run no longer THROWS you into combat: for ~1.6s the infection "deploys" (mode + target
// briefing, a DNA loader, one loading tip from the shared teacher), then the GameView mounts.
// Purely presentational — App owns the timer and the screen flip; this renders the moment.

import { useState } from 'react';
import { pickTip } from './tips';

export interface DeployInfo {
  title: string; // "STAGE 31 — VERDANT HIVE" / "INFINITE MODE" / "QUICK SKIRMISH"
  sub: string; // one context line ("The Descent · Standard" / "AI Director · infinite depth")
  accent: string; // biome/mode hue for the glow + bar
}

export function DeployScreen({ info }: { info: DeployInfo }): JSX.Element {
  const [tip] = useState(pickTip); // one tip per deployment
  return (
    <div className="deploy" style={{ ['--dp' as string]: info.accent }} role="status" aria-label="Deploying">
      <div className="deploy-core" aria-hidden>
        <span className="deploy-helix">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ ['--i' as string]: i } as React.CSSProperties} />
          ))}
        </span>
      </div>
      <div className="deploy-eyebrow">DEPLOYING THE INFECTION</div>
      <div className="deploy-title">{info.title}</div>
      <div className="deploy-sub">{info.sub}</div>
      <div className="deploy-bar" aria-hidden><span /></div>
      <div className="deploy-tip"><span className="deploy-tip-k">TIP</span>{tip}</div>
    </div>
  );
}
