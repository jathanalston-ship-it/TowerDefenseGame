// Procedural Gene Card artwork — a deterministic SVG "specimen" derived from the card id, so every
// card has a distinct face today with zero hand-authored assets, and `def.art` / skins can replace
// it later (docs/GENE-EVOLUTION.md). A helix spine + id-hashed nucleotide blobs, tinted by the
// card's accent (its subject color) and framed by rarity. Pure + memo-friendly: same id ⇒ same art.

import type { CardRarity } from '../../core/types';
import { rarityColorOf } from '../../core/equipment';

// Delegates to the ONE canonical rarity map (core/equipment.ts) — card rarities are a subset.
export function geneRarityColor(r: CardRarity): string { return rarityColorOf(r); }

/** Tiny deterministic hash → [0,1) stream from the card id. */
function hashStream(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

export function GeneCardArt({ id, accent, rarity, size = 72 }: {
  id: string;
  accent: string; // the card's subject color (tower color / hero gold / …)
  rarity: CardRarity;
  size?: number;
}): JSX.Element {
  const rnd = hashStream(id);
  const rc = geneRarityColor(rarity);
  // A twisted helix: two phase-shifted strands + hashed nucleotide rungs.
  const phase = rnd() * Math.PI * 2;
  const amp = 8 + rnd() * 5;
  const strand = (shift: number): string => {
    const pts: string[] = [];
    for (let y = 6; y <= 58; y += 4) {
      const x = 32 + Math.sin(y / 9 + phase + shift) * amp;
      pts.push(`${pts.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y}`);
    }
    return pts.join(' ');
  };
  const rungs: { y: number; x1: number; x2: number }[] = [];
  for (let y = 10; y <= 54; y += 8) {
    rungs.push({ y, x1: 32 + Math.sin(y / 9 + phase) * amp, x2: 32 + Math.sin(y / 9 + phase + Math.PI) * amp });
  }
  const blobs = Array.from({ length: 4 }, () => ({
    cx: 10 + rnd() * 44, cy: 8 + rnd() * 48, r: 1.5 + rnd() * 2.5, o: 0.25 + rnd() * 0.4,
  }));
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ display: 'block' }}>
      <rect x="1.5" y="1.5" width="61" height="61" rx="10" fill="rgba(0,0,0,0.35)" stroke={rc} strokeWidth="1.5" />
      <rect x="4" y="4" width="56" height="56" rx="8" fill="none" stroke={accent} strokeOpacity="0.18" />
      {blobs.map((b, i) => <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={accent} opacity={b.o * 0.5} />)}
      <path d={strand(0)} fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" opacity="0.95" />
      <path d={strand(Math.PI)} fill="none" stroke={rc} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      {rungs.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y} x2={r.x2} y2={r.y} stroke={accent} strokeWidth="1" opacity="0.45" />
      ))}
    </svg>
  );
}
