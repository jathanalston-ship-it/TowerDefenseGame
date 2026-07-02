// Loot-fill toast (LOOT-PROGRESSION.md) — when the live Loot Meter completes a bio-container,
// a compact toast slides in from the edge: "Bio-Container Acquired · <Rarity> Container Earned ·
// Open it from the Genetic Vault", glowing in the container's rarity color with an animated icon.
// It NEVER interrupts gameplay (a corner overlay, pointer-through except the toast) and NEVER
// overlaps: containers earned in a burst QUEUE and show one at a time. Mounted once at the app root;
// driven by the `lootContainerEarned` gameEvent that meta.syncRunLoot emits during a run.

import { useEffect, useRef, useState } from 'react';
import { gameEvents } from '../core/events';
import { rarityRegistry } from '../core/loot';
import { audio } from '../audio/sound';

interface LootToast { id: number; rarity: string; name: string; color: string; big: boolean; banked: number; nextName: string }

const TOAST_MS = 3200; // on screen before auto-dismiss; the next queued toast follows

export function LootToaster(): JSX.Element | null {
  const [queue, setQueue] = useState<LootToast[]>([]);
  const idc = useRef(0);

  // Enqueue one toast per completed container. Rendering only the FRONT (below) guarantees they
  // never overlap; a burst simply lines up and plays out in order.
  useEffect(() => {
    const off = gameEvents.on('lootContainerEarned', ({ rarity, banked, next }) => {
      const def = rarityRegistry.get(rarity);
      const big = rarity === 'legendary' || rarity === 'exotic' || rarity === 'mythic';
      const nextName = rarityRegistry.get(next)?.name ?? 'Common';
      setQueue((q) => [...q, { id: idc.current++, rarity, name: def?.name ?? 'Common', color: def?.color ?? 'var(--r-common)', big, banked, nextName }]);
    });
    return off;
  }, []);

  const front = queue[0];
  const frontId = front?.id ?? -1;

  // Auto-dismiss the front toast; the effect re-arms whenever the front changes (next in queue).
  useEffect(() => {
    if (!front) return undefined;
    audio.cue(front.big ? 'jackpot' : 'reveal'); // subtle acquire chime; a big drop rings louder
    const t = setTimeout(() => setQueue((q) => q.slice(1)), TOAST_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId]);

  if (!front) return null;
  return (
    <div className="loot-toast-wrap" aria-live="polite">
      <div
        className={`loot-toast${front.big ? ' is-big' : ''}`}
        key={front.id}
        style={{ ['--rc' as string]: front.color }}
        onClick={() => setQueue((q) => q.slice(1))}
        role="status"
      >
        <span className="lt-icon" aria-hidden>◈</span>
        <span className="lt-body">
          <span className="lt-eyebrow">Bio-Container Earned!</span>
          <span className="lt-name" style={{ color: front.color }}>{front.name} Container</span>
          <span className="lt-sub">Vault: {front.banked} banked · meter reset — now filling {front.nextName}</span>
        </span>
      </div>
    </div>
  );
}
