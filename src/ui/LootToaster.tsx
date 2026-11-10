// Loot-fill toast (LOOT-PROGRESSION.md) — when the live Loot Meter completes a bio-container,
// a compact toast slides in from the edge: "Bio-Container Acquired · <Rarity> Container Earned ·
// Open it from the Genetic Vault", glowing in the container's rarity color with an animated icon.
// It NEVER interrupts gameplay (a corner overlay, pointer-through except the toast) and NEVER
// overlaps: containers earned in a burst QUEUE and show one at a time. Mounted once at the app root;
// driven by the `lootContainerEarned` gameEvent that meta.syncRunLoot emits during a run.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gameEvents } from '../core/events';
import { rarityRegistry } from '../core/loot';
import { audio } from '../audio/sound';

interface LootToast { id: number; rarity: string; name: string; color: string; big: boolean; banked: number; nextName: string }

const TOAST_MS = 3200; // on screen before auto-dismiss; the next queued toast follows

export function LootToaster(): JSX.Element | null {
  const [queue, setQueue] = useState<LootToast[]>([]);
  const idc = useRef(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const focusedControl = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!front) return undefined;
    audio.cue(front.big ? 'jackpot' : 'reveal'); // subtle acquire chime; a big drop rings louder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId]);

  // Reading pauses expiry, not the reward cue. Leaving gives a full reading interval.
  useEffect(() => {
    if (!front || hovered || focused) return;
    const t = setTimeout(() => setQueue(q => q[0]?.id === frontId ? q.slice(1) : q), TOAST_MS);
    return () => clearTimeout(t);
  }, [frontId, hovered, focused]);

  useLayoutEffect(() => {
    if (focusedControl.current && !focusedControl.current.isConnected && document.activeElement === document.body) {
      const target = dismissRef.current ?? previousFocus.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
    if (!front) {
      focusedControl.current = null;
      setHovered(false);
      setFocused(false);
    }
  }, [frontId]);

  if (!front) return null;
  return (
    <div className="loot-toast-wrap" aria-live="polite"
      onPointerEnter={e => { if (e.pointerType !== 'touch') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={e => {
        if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.isConnected && !e.currentTarget.contains(e.relatedTarget)) previousFocus.current = e.relatedTarget;
        focusedControl.current = e.target as HTMLElement;
        setFocused(true);
      }}
      onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    >
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
        <button ref={dismissRef} type="button" className="lt-dismiss" aria-label={`Dismiss ${front.name} container notification`}
          onClick={e => { e.stopPropagation(); setQueue(q => q.slice(1)); }}>×</button>
      </div>
    </div>
  );
}
