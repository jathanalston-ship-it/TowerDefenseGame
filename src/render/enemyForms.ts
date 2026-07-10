// ENEMY BODY FORMS (docs/ENEMIES.md §visual language) — procedural CREATURE silhouettes that replace
// the flat 5-polygon enemy bodies. Each archetype gets an authored bio-form (a grub, a winged moth, a
// plated crab, a volatile bulb …) drawn as a shaded silhouette + anatomy (legs / wings / eyes /
// segments) + a subtle idle animation, so the ~40-kind roster reads as distinct organisms rather than
// recolored shapes. Per-kind colour + a stable `variant` seed drive structural variety, so variants
// within an archetype (runner vs mite vs larva) differ in build, not just hue.
//
// COSMETIC ONLY — the renderer is outside the deterministic sim, so nothing here touches gameplay or
// the golden tests. LOD: the battlefield renderer only calls this below PERF.lodEnemyCount (else a
// flat fallback shape), so each form stays lean (~8–14 canvas ops, no per-enemy gradients).

type Ctx = CanvasRenderingContext2D;

export type BodyForm =
  | 'grub'      // swarm — soft segmented larva
  | 'dart'      // fast — sleek arrowhead flier/sprinter
  | 'beetle'    // heavy — hard domed carapace
  | 'crab'      // shielded — low shell with a front shield-plate
  | 'polyp'     // regen — pulsating gelatinous sac
  | 'mole'      // burrower — clawed tunneller
  | 'moth'      // flying — flapping winged drifter
  | 'broodsac'  // summoner — egg-sac with visible embryos
  | 'frond'     // support — floating anemone with healing tendrils
  | 'bulb'      // suicide — volatile bulb with an unstable core
  | 'mortar'    // artillery — dug-in bombard with a raised barrel
  | 'maw';      // apex/elite — a fanged bruiser mass

export interface BodyOpts {
  seed: number;  // per-KIND structural variant (stable across a kind's instances)
  phase: number; // per-INSTANCE animation offset (e.id) so a swarm doesn't animate in lockstep
  rim: string;   // tier-keyed outline colour (normal / elite / boss)
  flying?: boolean;
  vx?: number;   // per-frame screen velocity (renderer motion tracker) → bank + walking bob
  vy?: number;
  emerge?: number; // 0..1 spawn-emerge scale (1 = fully born)
  flinch?: number; // 0..1 just-took-a-hit (renderer hitFlash) → recoil squash away from the line
  moving?: number; // 0..1 locomotion intensity (set internally from vx/vy; drawers read it for gaits)
}

// ── Colour shading (memoized — colours are per-kind, so ~40 distinct keys, not per-enemy) ──────────
const shadeCache = new Map<string, string>();
/** Darken (f<0) or lighten-toward-white (f>0) a hex colour → an `rgb()` string. */
function shade(hex: string, f: number): string {
  const key = hex + f;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { const k = 1 + f; r *= k; g *= k; b *= k; }
  const out = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  shadeCache.set(key, out);
  return out;
}

/** Two glowing eyes (dark socket + bright pupil), centred on (cx,cy), `spread` apart, `sz` pupils. */
function eyes(ctx: Ctx, cx: number, cy: number, spread: number, sz: number, glow = '#fff'): void {
  for (const s of [-1, 1]) {
    ctx.fillStyle = 'rgba(10,8,14,0.85)';
    ctx.beginPath();
    ctx.arc(cx + s * spread, cy, sz * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx + s * spread, cy, sz, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Fill + rim a path already built on ctx (the shared "solid, threat-ranked unit" treatment). */
function fillRim(ctx: Ctx, body: string, rim: string, lw: number): void {
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** One specular GLINT stroke — the wet-chitin highlight that sells a hard shell (2 ops). */
function glint(ctx: Ctx, x: number, y: number, r: number, c: string, tilt = -0.6): void {
  ctx.strokeStyle = shade(c, 0.65);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, tilt - 0.55, tilt + 0.25);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

/** Paired antennae — two arcing feelers with tip-buds; `sway` animates them (4 ops). */
function antennae(ctx: Ctx, x: number, y: number, r: number, c: string, sway: number): void {
  ctx.strokeStyle = shade(c, -0.3);
  ctx.lineWidth = Math.max(1, r * 0.08);
  for (const s of [-1, 1]) {
    const tx = x + s * r * (0.5 + 0.12 * Math.sin(sway + s));
    const ty = y - r * (1.1 + 0.1 * Math.cos(sway * 1.3 + s));
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.16, y - r * 0.42);
    ctx.quadraticCurveTo(x + s * r * 0.55, y - r * 0.9, tx, ty);
    ctx.stroke();
    ctx.fillStyle = shade(c, 0.45);
    ctx.beginPath();
    ctx.arc(tx, ty, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Per-form drawers ───────────────────────────────────────────────────────────────────────────

function grub(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const segs = 2 + (o.seed % 3); // runner/mite/larva differ in segment count
  const move = o.moving ?? 0;
  const wig = Math.sin(t * 7 + o.phase) * r * 0.12 * (0.5 + 0.5 * move);
  // INCHWORM gait: the body compresses and extends along the crawl axis with speed
  const inch = 1 + move * 0.14 * Math.sin(t * 8 + o.phase);
  // little leg nubs down each side, wiggling harder at speed
  ctx.strokeStyle = shade(c, -0.4);
  ctx.lineWidth = Math.max(1, r * 0.16);
  for (let i = 0; i < segs + 1; i++) {
    const ly = y - r * 0.5 + (i / segs) * r;
    const lw = Math.sin(t * 9 + o.phase + i) * r * (0.1 + 0.14 * move);
    ctx.beginPath(); ctx.moveTo(x - r * 0.6, ly); ctx.lineTo(x - r * 0.95, ly + lw + r * 0.2);
    ctx.moveTo(x + r * 0.6, ly); ctx.lineTo(x + r * 0.95, ly + lw + r * 0.2); ctx.stroke();
  }
  // plump body (taller than wide), leaning with the wiggle, breathing with the crawl
  ctx.beginPath();
  ctx.ellipse(x + wig, y, r * 0.7 * (2 - inch), r * inch, 0, 0, Math.PI * 2);
  fillRim(ctx, c, o.rim, Math.max(1.2, r * 0.12));
  antennae(ctx, x + wig, y - r * 0.4, r * 0.7, c, t * 3 + o.phase);
  // segmentation rings
  ctx.strokeStyle = shade(c, -0.3);
  ctx.lineWidth = Math.max(1, r * 0.1);
  for (let i = 1; i < segs; i++) {
    const sy = y - r * 0.5 + (i / segs) * r;
    ctx.beginPath();
    ctx.ellipse(x + wig, sy, r * 0.66, r * 0.16, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  eyes(ctx, x + wig, y - r * 0.5, r * 0.28, r * 0.12, shade(c, 0.6));
}

function dart(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  // motion streaks trailing UP (they descend); jitter with speed
  ctx.strokeStyle = shade(c, 0.2);
  ctx.lineWidth = Math.max(1, r * 0.14);
  for (const s of [-0.5, 0, 0.5]) {
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(x + s * r * 0.6, y - r * 1.1);
    ctx.lineTo(x + s * r * 0.6, y - r * (1.8 + 0.4 * Math.abs(Math.sin(t * 12 + o.phase)))); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // swept-back fins
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.2);
  ctx.lineTo(x + r * 1.05, y + r * 0.5); ctx.lineTo(x + r * 0.3, y + r * 0.35);
  ctx.lineTo(x - r * 0.3, y + r * 0.35); ctx.lineTo(x - r * 1.05, y + r * 0.5);
  ctx.closePath();
  fillRim(ctx, shade(c, -0.25), o.rim, Math.max(1, r * 0.1));
  // sleek arrowhead body pointing DOWN (toward the line)
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.05);
  ctx.lineTo(x + r * 0.5, y - r * 0.35);
  ctx.quadraticCurveTo(x, y - r * 0.75, x - r * 0.5, y - r * 0.35);
  ctx.closePath();
  fillRim(ctx, c, o.rim, Math.max(1.2, r * 0.12));
  // forward visor-eye
  ctx.fillStyle = shade(c, 0.65);
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 0.22, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
}

function beetle(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const plates = 3 + (o.seed % 3);
  const move = o.moving ?? 0;
  // stubby legs — braced at rest, SCUTTLING at speed (alternating tripod rhythm)
  ctx.strokeStyle = shade(c, -0.45);
  ctx.lineWidth = Math.max(1.2, r * 0.16);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ly = y - r * 0.4 + i * r * 0.42;
      const kick = Math.sin(t * (5 + move * 9) + o.phase + i * 2.1 + (s > 0 ? Math.PI : 0)) * r * (0.06 + 0.16 * move);
      ctx.beginPath(); ctx.moveTo(x + s * r * 0.75, ly); ctx.lineTo(x + s * r * 1.15, ly + r * 0.28 + kick); ctx.stroke();
    }
  }
  // small head poking down-front
  ctx.beginPath(); ctx.arc(x, y + r * 0.72, r * 0.34, 0, Math.PI * 2);
  fillRim(ctx, shade(c, -0.2), o.rim, Math.max(1, r * 0.1));
  eyes(ctx, x, y + r * 0.72, r * 0.18, r * 0.08, '#ff5a4a');
  // domed carapace (wide rounded hex)
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + Math.cos(a) * r * (1 + 0.06 * Math.cos(a * 2));
    const py = y + Math.sin(a) * r * 0.92;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  fillRim(ctx, c, o.rim, Math.max(1.4, r * 0.14));
  // central ridge + plate seams (armoured segments)
  ctx.strokeStyle = shade(c, -0.35);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.8); ctx.lineTo(x, y + r * 0.55); ctx.stroke();
  for (let i = 1; i < plates; i++) {
    const py = y - r * 0.7 + (i / plates) * r * 1.3;
    ctx.beginPath(); ctx.moveTo(x - r * 0.75, py); ctx.quadraticCurveTo(x, py + r * 0.14, x + r * 0.75, py); ctx.stroke();
  }
  // dome highlight + a wet-chitin glint sweeping the carapace
  ctx.fillStyle = shade(c, 0.4);
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(x - r * 0.28, y - r * 0.42, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  glint(ctx, x, y - r * 0.1, r, c);
  // apex variants get a brow horn
  if (o.seed % 4 === 0) {
    ctx.fillStyle = shade(c, -0.3);
    ctx.beginPath(); ctx.moveTo(x - r * 0.18, y + r * 0.5); ctx.lineTo(x, y + r * 1.15); ctx.lineTo(x + r * 0.18, y + r * 0.5); ctx.closePath(); ctx.fill();
  }
}

function crab(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const move = o.moving ?? 0;
  // two claws framing the shell — SNAPPING open/shut as it advances
  ctx.fillStyle = shade(c, -0.2);
  ctx.strokeStyle = o.rim;
  ctx.lineWidth = Math.max(1, r * 0.09);
  for (const s of [-1, 1]) {
    const cx = x + s * r * 0.95, cy = y + r * 0.1 + Math.sin(t * 4 + o.phase) * r * 0.05;
    const snap = Math.max(0, Math.sin(t * (3 + move * 6) + o.phase + s)) * (0.4 + 0.6 * move);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * r * 0.1, cy - r * 0.3);
    ctx.lineTo(cx + s * r * (0.35 + snap * 0.14), cy - r * (0.05 + snap * 0.14));
    ctx.lineTo(cx + s * r * 0.1, cy);
    ctx.closePath(); ctx.fill();
  }
  // low wide carapace
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
  fillRim(ctx, c, o.rim, Math.max(1.4, r * 0.14));
  // segmentation
  ctx.strokeStyle = shade(c, -0.35);
  ctx.lineWidth = Math.max(1, r * 0.09);
  for (const sx of [-0.4, 0, 0.4]) {
    ctx.beginPath(); ctx.moveTo(x + sx * r, y - r * 0.55); ctx.lineTo(x + sx * r * 1.15, y + r * 0.5); ctx.stroke();
  }
  // the defining FRONT shield-plate, facing the line (downfield), lit by remaining integrity
  const flick = 0.6 + 0.4 * Math.abs(Math.sin(t * 3 + o.phase));
  ctx.fillStyle = shade(c, 0.25);
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.55, r * 0.85, r * 0.4, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = `rgba(150,210,255,${0.5 * flick})`;
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 0.92, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  glint(ctx, x - r * 0.2, y - r * 0.2, r * 0.9, c);
  eyes(ctx, x, y - r * 0.15, r * 0.26, r * 0.1, shade(c, 0.6));
}

function polyp(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const p = 1 + 0.08 * Math.sin(t * 3 + o.phase); // gelatinous pulse
  const cilia = 7 + (o.seed % 4);
  // knitting cilia around the rim
  ctx.strokeStyle = shade(c, 0.2);
  ctx.lineWidth = Math.max(1, r * 0.09);
  for (let i = 0; i < cilia; i++) {
    const a = (i / cilia) * Math.PI * 2 + t * 0.4;
    const wob = 1 + 0.25 * Math.sin(t * 6 + i + o.phase);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    ctx.lineTo(x + Math.cos(a) * r * 1.25 * wob, y + Math.sin(a) * r * 1.25 * wob);
    ctx.stroke();
  }
  // translucent sac
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(x, y, r * p, 0, Math.PI * 2);
  fillRim(ctx, shade(c, 0.1), o.rim, Math.max(1.2, r * 0.12));
  ctx.globalAlpha = 1;
  // inner nucleus (the regenerating heart) + refracted bubbles drifting inside the jelly
  ctx.fillStyle = shade(c, -0.35);
  ctx.beginPath(); ctx.arc(x, y, r * 0.42 * p, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(c, 0.5);
  ctx.beginPath(); ctx.arc(x - r * 0.12, y - r * 0.12, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(c, 0.6);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 2; i++) {
    const bp = ((t * 0.25 + i * 0.5 + o.phase * 0.1) % 1);
    ctx.beginPath();
    ctx.arc(x + Math.sin(i * 4 + o.phase) * r * 0.35, y + r * 0.55 - bp * r * 1.1, r * 0.07 * (1 - bp * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function mole(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  // torpedo body, pointed down-front
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.1);
  ctx.quadraticCurveTo(x + r * 0.85, y + r * 0.2, x + r * 0.55, y - r * 0.9);
  ctx.quadraticCurveTo(x, y - r * 1.1, x - r * 0.55, y - r * 0.9);
  ctx.quadraticCurveTo(x - r * 0.85, y + r * 0.2, x, y + r * 1.1);
  ctx.closePath();
  fillRim(ctx, c, o.rim, Math.max(1.3, r * 0.13));
  // segmented back
  ctx.strokeStyle = shade(c, -0.35);
  ctx.lineWidth = Math.max(1, r * 0.1);
  for (let i = 0; i < 3; i++) {
    const sy = y - r * 0.4 + i * r * 0.42;
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, sy); ctx.quadraticCurveTo(x, sy + r * 0.12, x + r * 0.5, sy); ctx.stroke();
  }
  // big digging claws at the front, scooping HARD at speed — with kicked-up soil
  const move = o.moving ?? 0;
  const dig = Math.sin(t * (6 + move * 6) + o.phase) * r * (0.1 + 0.2 * move);
  ctx.fillStyle = shade(c, 0.3);
  ctx.strokeStyle = o.rim; ctx.lineWidth = Math.max(1, r * 0.08);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.3, y + r * 0.7);
    ctx.lineTo(x + s * (r * 0.85 + dig), y + r * 1.15);
    ctx.lineTo(x + s * r * 0.45, y + r * 0.95);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (move > 0.25) {
    ctx.fillStyle = 'rgba(64,51,42,0.6)';
    for (let i = 0; i < 3; i++) {
      const sp = ((t * 1.6 + i / 3 + o.phase * 0.2) % 1);
      ctx.beginPath();
      ctx.arc(x + Math.sin(i * 5 + o.phase) * r * 0.8, y + r * 1.05 + sp * r * 0.5, 1.5 * (1 - sp), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  eyes(ctx, x, y - r * 0.2, r * 0.2, r * 0.08, '#ffcf6a');
}

function moth(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const flap = Math.sin(t * 10 + o.phase); // wingbeat
  const angular = o.seed % 2 === 0; // gargoyle-ish bat wings vs soft moth wings
  const wingW = r * (0.85 + 0.35 * (1 - Math.abs(flap))); // narrow at the top of the beat
  ctx.fillStyle = shade(c, 0.1);
  ctx.strokeStyle = o.rim;
  ctx.lineWidth = Math.max(1, r * 0.09);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (angular) {
      ctx.moveTo(x + s * r * 0.2, y - r * 0.2);
      ctx.lineTo(x + s * (r * 0.4 + wingW), y - r * 0.5 - flap * r * 0.2);
      ctx.lineTo(x + s * (r * 0.5 + wingW), y + r * 0.1);
      ctx.lineTo(x + s * (r * 0.3 + wingW * 0.5), y + r * 0.35);
      ctx.lineTo(x + s * r * 0.2, y + r * 0.15);
    } else {
      ctx.moveTo(x + s * r * 0.15, y);
      ctx.ellipse(x + s * (r * 0.35 + wingW * 0.5), y - r * 0.1, wingW * 0.7, r * 0.6, s * (0.3 + flap * 0.15), 0, Math.PI * 2);
    }
    ctx.closePath(); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
  }
  // slender body
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.32, r * 0.85, 0, 0, Math.PI * 2);
  fillRim(ctx, shade(c, -0.15), o.rim, Math.max(1.1, r * 0.11));
  // segmentation + feathered antennae + eyes
  ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = Math.max(1, r * 0.08);
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + i * r * 0.3); ctx.lineTo(x + r * 0.3, y + i * r * 0.3); ctx.stroke(); }
  antennae(ctx, x, y - r * 0.45, r * 0.6, c, t * 4 + o.phase);
  eyes(ctx, x, y - r * 0.55, r * 0.18, r * 0.09, shade(c, 0.6));
}

function broodsac(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const p = 1 + 0.06 * Math.sin(t * 2.4 + o.phase);
  const eggs = 3 + (o.seed % 3);
  // translucent bulbous sac
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.95 * p, r * p, 0, 0, Math.PI * 2);
  fillRim(ctx, shade(c, 0.05), o.rim, Math.max(1.4, r * 0.13));
  // membrane sheen + surface veins feeding the brood
  ctx.fillStyle = shade(c, 0.4); ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.3, r * 0.5, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shade(c, -0.3);
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(1, r * 0.06);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.2, y - r * 0.85);
    ctx.quadraticCurveTo(x + s * r * 0.75, y - r * 0.3, x + s * r * 0.45, y + r * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // embryos inside, pulsing toward the next birth
  ctx.fillStyle = shade(c, -0.4);
  for (let i = 0; i < eggs; i++) {
    const a = (i / eggs) * Math.PI * 2 + o.phase;
    const eb = 0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i + o.phase));
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, r * (0.15 + 0.06 * eb), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = shade(c, -0.25);
  ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill();
}

function frond(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const arms = 6 + (o.seed % 3);
  // waving healing tendrils radiating out
  ctx.strokeStyle = shade(c, 0.25);
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.lineCap = 'round';
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const sway = Math.sin(t * 2.5 + i + o.phase) * 0.4;
    const mx = x + Math.cos(a + sway) * r * 0.9, my = y + Math.sin(a + sway) * r * 0.9;
    const tx = x + Math.cos(a + sway * 1.6) * r * 1.5, ty = y + Math.sin(a + sway * 1.6) * r * 1.5;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4);
    ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
    ctx.fillStyle = shade(c, 0.4);
    ctx.beginPath(); ctx.arc(tx, ty, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'butt';
  // soft glowing core
  const p = 1 + 0.1 * Math.sin(t * 3 + o.phase);
  ctx.beginPath(); ctx.arc(x, y, r * 0.55 * p, 0, Math.PI * 2);
  fillRim(ctx, shade(c, 0.1), o.rim, Math.max(1.2, r * 0.12));
  ctx.fillStyle = shade(c, 0.55);
  ctx.beginPath(); ctx.arc(x, y, r * 0.26 * p, 0, Math.PI * 2); ctx.fill();
}

function bulb(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const unst = 0.5 + 0.5 * Math.abs(Math.sin(t * 5 + o.phase)); // volatility throb
  // fuse/stem on top
  ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.85); ctx.lineTo(x, y - r * 1.25); ctx.stroke();
  ctx.fillStyle = `rgba(255,${Math.round(140 + 90 * unst)},60,${0.6 + 0.4 * unst})`;
  ctx.beginPath(); ctx.arc(x, y - r * 1.3, r * (0.12 + 0.08 * unst), 0, Math.PI * 2); ctx.fill();
  // swollen bulb body
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.92, r, 0, 0, Math.PI * 2);
  fillRim(ctx, shade(c, -0.1), o.rim, Math.max(1.3, r * 0.13));
  // cracks of unstable inner light
  ctx.strokeStyle = `rgba(255,210,90,${0.35 + 0.5 * unst})`;
  ctx.lineWidth = Math.max(1, r * 0.1);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.1, y - r * 0.5);
    ctx.lineTo(x + s * r * 0.35, y);
    ctx.lineTo(x + s * r * 0.15, y + r * 0.5);
    ctx.stroke();
  }
  // glowing unstable core + light rays escaping through the shell at peak throb
  ctx.fillStyle = `rgba(255,${Math.round(120 + 100 * unst)},50,${0.7 + 0.3 * unst})`;
  ctx.beginPath(); ctx.arc(x, y, r * (0.28 + 0.1 * unst), 0, Math.PI * 2); ctx.fill();
  if (unst > 0.6) {
    ctx.strokeStyle = `rgba(255,220,120,${(unst - 0.6) * 1.4})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + t * 0.7 + o.phase;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4);
      ctx.lineTo(x + Math.cos(a) * r * (0.95 + unst * 0.3), y + Math.sin(a) * r * (0.95 + unst * 0.3));
      ctx.stroke();
    }
  }
}

function mortar(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  // braced legs, dug in
  ctx.strokeStyle = shade(c, -0.45); ctx.lineWidth = Math.max(1.3, r * 0.16);
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(x + s * r * 0.5, y + r * 0.3); ctx.lineTo(x + s * r * 1.05, y + r * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * r * 0.25, y + r * 0.5); ctx.lineTo(x + s * r * 0.6, y + r * 1.0); ctx.stroke();
  }
  // raised barrel/spout pointing up-back (it lobs shells over the field)
  const chg = 0.5 + 0.5 * Math.abs(Math.sin(t * 2 + o.phase));
  ctx.save();
  ctx.translate(x, y - r * 0.2);
  ctx.rotate(-0.35);
  ctx.fillStyle = shade(c, -0.25);
  ctx.strokeStyle = o.rim; ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath(); ctx.rect(-r * 0.28, -r * 1.15, r * 0.56, r * 1.15); ctx.fill(); ctx.stroke();
  ctx.fillStyle = `rgba(255,184,77,${0.25 + 0.6 * chg})`; // muzzle charge
  ctx.beginPath(); ctx.arc(0, -r * 1.1, r * (0.18 + 0.12 * chg), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // low armoured base
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.25, r, r * 0.62, 0, 0, Math.PI * 2);
  fillRim(ctx, c, o.rim, Math.max(1.4, r * 0.14));
  ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + r * 0.25); ctx.lineTo(x + r * 0.7, y + r * 0.25); ctx.stroke();
  glint(ctx, x - r * 0.15, y + r * 0.1, r * 0.8, c);
  eyes(ctx, x, y + r * 0.1, r * 0.24, r * 0.09, '#ffb84d');
}

function maw(ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts): void {
  const spikes = 5 + (o.seed % 3);
  const breathe = 1 + 0.04 * Math.sin(t * 2 + o.phase);
  // back spikes
  ctx.fillStyle = shade(c, -0.35);
  for (let i = 0; i < spikes; i++) {
    const a = -Math.PI + (i / (spikes - 1)) * Math.PI;
    const bx = x + Math.cos(a) * r * 0.85, by = y + Math.sin(a) * r * 0.85 - r * 0.2;
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.12, by); ctx.lineTo(x + Math.cos(a) * r * 1.4, by - r * 0.5); ctx.lineTo(bx + r * 0.12, by);
    ctx.closePath(); ctx.fill();
  }
  // heavy body
  ctx.beginPath();
  ctx.ellipse(x, y, r * breathe, r * 1.02 * breathe, 0, 0, Math.PI * 2);
  fillRim(ctx, c, o.rim, Math.max(1.6, r * 0.15));
  // heavy brow
  ctx.fillStyle = shade(c, -0.3);
  ctx.beginPath(); ctx.moveTo(x - r * 0.75, y - r * 0.1); ctx.quadraticCurveTo(x, y - r * 0.5, x + r * 0.75, y - r * 0.1);
  ctx.lineTo(x + r * 0.7, y + r * 0.1); ctx.quadraticCurveTo(x, y - r * 0.25, x - r * 0.7, y + r * 0.1); ctx.closePath(); ctx.fill();
  glint(ctx, x - r * 0.1, y - r * 0.25, r * 0.9, c);
  eyes(ctx, x, y - r * 0.05, r * 0.32, r * 0.11, '#ff4d4d');
  // gaping fanged maw (facing the line) — with a hanging saliva strand
  const gape = r * (0.32 + 0.06 * Math.sin(t * 3 + o.phase));
  ctx.fillStyle = 'rgba(20,6,10,0.9)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.55, r * 0.6, gape, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(210,225,235,0.4)';
  ctx.lineWidth = 1;
  const sal = r * (0.2 + 0.12 * Math.abs(Math.sin(t * 1.7 + o.phase)));
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y + r * 0.55 - gape * 0.5);
  ctx.quadraticCurveTo(x - r * 0.18, y + r * 0.55 + sal * 0.5, x - r * 0.22, y + r * 0.55 + sal);
  ctx.stroke();
  ctx.fillStyle = shade(c, 0.7);
  for (let i = -2; i <= 2; i++) {
    const fx = x + i * r * 0.24;
    ctx.beginPath(); ctx.moveTo(fx - r * 0.07, y + r * 0.55 - gape * 0.7); ctx.lineTo(fx, y + r * 0.55 - gape * 0.1); ctx.lineTo(fx + r * 0.07, y + r * 0.55 - gape * 0.7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx - r * 0.07, y + r * 0.55 + gape * 0.7); ctx.lineTo(fx, y + r * 0.55 + gape * 0.1); ctx.lineTo(fx + r * 0.07, y + r * 0.55 + gape * 0.7); ctx.closePath(); ctx.fill();
  }
}

const DRAWERS: Record<BodyForm, (ctx: Ctx, x: number, y: number, r: number, c: string, t: number, o: BodyOpts) => void> = {
  grub, dart, beetle, crab, polyp, mole, moth, broodsac, frond, bulb, mortar, maw,
};

// ── SPAWN INTROS (docs/ENEMIES.md §8.2) — each archetype BIRTHS with its own animation: a mode-
//    specific entrance transform + a birth VFX, driven by the emerge progress p∈[0,1]. Distinct per
//    archetype so a spawn reads as a crafted moment, not a uniform scale-in. ─────────────────────────
type SpawnMode = 'hatch' | 'erupt' | 'bloom' | 'assemble' | 'phase' | 'ignite';
const SPAWN_MODE: Record<BodyForm, SpawnMode> = {
  grub: 'hatch', dart: 'phase', beetle: 'assemble', crab: 'assemble', polyp: 'bloom', mole: 'erupt',
  moth: 'phase', broodsac: 'bloom', frond: 'bloom', bulb: 'ignite', mortar: 'assemble', maw: 'erupt',
};
/** easeOutBack — a slight overshoot so births POP into place instead of easing in limply. */
function back(p: number): number { const k = p - 1; return 1 + 2.70158 * k * k * k + 1.70158 * k * k; }

function drawSpawnIntro(ctx: Ctx, form: BodyForm, x: number, y: number, r: number, c: string, t: number, p: number, o: BodyOpts): void {
  const rgb = shade(c, 0); // "r,g,b" for the translucent birth VFX
  const fade = 1 - p; // the birth VFX fades as the body settles
  ctx.save();
  ctx.translate(x, y);
  switch (SPAWN_MODE[form]) {
    case 'hatch': { // grub — a spore shell cracks open and the larva squirms out
      const gap = p * r * 0.7;
      ctx.strokeStyle = `rgba(${shade(c, -0.35)},${fade})`; ctx.lineWidth = Math.max(1.5, r * 0.16);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * gap, 0, r * 0.95, s > 0 ? -Math.PI * 0.5 : Math.PI * 0.5, s > 0 ? Math.PI * 0.5 : Math.PI * 1.5); ctx.stroke(); }
      ctx.scale(back(p), back(p));
      break;
    }
    case 'erupt': { // mole/maw — bursts UP out of the ground through a mound of debris
      ctx.fillStyle = `rgba(${shade(c, -0.5)},${fade * 0.8})`;
      for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; const d = r * (0.6 + p * 1.1); ctx.beginPath(); ctx.arc(Math.cos(a) * d, r * 0.7 + Math.sin(a) * d * 0.4, r * 0.16 * fade + 1, 0, Math.PI * 2); ctx.fill(); }
      ctx.translate(0, (1 - p) * r * 0.9); // rise from below the surface
      ctx.scale(1, p); // stretch up out of the ground
      break;
    }
    case 'bloom': { // polyp/broodsac/frond — inflates from a point inside an expanding soft ring
      ctx.strokeStyle = `rgba(${rgb},${fade * 0.6})`; ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.beginPath(); ctx.arc(0, 0, r * (0.4 + p * 1.3), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(${shade(c, 0.5)},${fade * 0.5})`; ctx.beginPath(); ctx.arc(0, 0, r * 0.5 * fade, 0, Math.PI * 2); ctx.fill();
      ctx.scale(back(p), back(p));
      break;
    }
    case 'assemble': { // beetle/crab/mortar — carapace PLATES snap inward and lock together
      ctx.strokeStyle = `rgba(${shade(c, 0.2)},${fade})`; ctx.lineWidth = Math.max(1.5, r * 0.12);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const d = r * (1 + fade * 1.4); ctx.beginPath(); ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d); ctx.lineTo(Math.cos(a) * (d - r * 0.4), Math.sin(a) * (d - r * 0.4)); ctx.stroke(); }
      ctx.scale(p, p);
      break;
    }
    case 'phase': { // dart/moth — drops in from above through a phase-ripple + motion streaks
      ctx.strokeStyle = `rgba(${shade(c, 0.4)},${fade * 0.7})`; ctx.lineWidth = Math.max(1, r * 0.1);
      for (const sx of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(sx * r, -(1 - p) * r * 2 - r); ctx.lineTo(sx * r, -(1 - p) * r * 2 - r * 2.2); ctx.stroke(); }
      ctx.strokeStyle = `rgba(${rgb},${fade * 0.6})`; ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + p * 0.6), r * 0.3 * fade + 1, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.translate(0, -(1 - p) * r * 1.5); ctx.scale(0.7 + 0.3 * p, 0.7 + 0.3 * p);
      break;
    }
    case 'ignite': { // bulb — swells as its volatile core IGNITES in a bright flash of sparks
      const fl = Math.sin(Math.min(1, p * 1.4) * Math.PI); // flash peaks mid-birth
      ctx.fillStyle = `rgba(255,210,120,${fl * 0.7})`; ctx.beginPath(); ctx.arc(0, 0, r * (0.6 + p), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,200,90,${fl * 0.8})`; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + p * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(Math.cos(a) * r * (1 + p * 0.6), Math.sin(a) * r * (1 + p * 0.6)); ctx.stroke(); }
      ctx.scale(back(p), back(p));
      break;
    }
  }
  DRAWERS[form](ctx, 0, 0, r, c, t, o);
  ctx.restore();
}

/** Universal VOLUME pass — a lit crescent (toward the arena key light, up-left) + a shadow
 *  crescent (down-right) laid over any silhouette. Two arc strokes, no gradients, no clip:
 *  the cheapest paint that makes a flat body read as a rounded, lit organism. Stays inside
 *  the ~14-op LOD budget (adds 6). */
function volumePass(ctx: Ctx, x: number, y: number, r: number, c: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(c, 0.55);
  ctx.globalAlpha = 0.38;
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.68, Math.PI * 1.05, Math.PI * 1.62);
  ctx.stroke();
  ctx.strokeStyle = 'rgb(2,2,10)';
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(1, r * 0.2);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, Math.PI * 0.12, Math.PI * 0.62);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

/** Draw a procedural creature body of `form` at (x,y), radius `r`, in `color`. A spawning enemy
 *  (emerge<1) plays its archetype's BIRTH intro; otherwise it applies LOCOMOTION (bank + walking
 *  bob, from the renderer's motion tracker). Cosmetic + LOD-gated; still enemies take a fast path. */
export function drawEnemyBody(
  ctx: Ctx, form: BodyForm, x: number, y: number, r: number, color: string, t: number, o: BodyOpts,
): void {
  const emerge = o.emerge ?? 1;
  if (emerge < 1) { drawSpawnIntro(ctx, form, x, y, r, color, t, Math.max(0, emerge), o); return; } // BIRTH
  const vx = o.vx ?? 0, vy = o.vy ?? 0;
  const moving = Math.min(1, Math.hypot(vx, vy) / 2.2); // px/frame reference (rAF-steady)
  o.moving = moving; // drawers key their GAITS off this (leg cadence, claw snap, dig churn)
  const bank = Math.max(-0.38, Math.min(0.38, vx * 0.09)); // lean into lateral travel
  const bob = moving > 0.03 ? Math.sin(t * 9 + o.phase) * r * 0.05 * moving : 0;
  // FLINCH — a hit knocks the body back up-lane with a brief squash; reads as impact even
  // before the damage number lands. Driven by the renderer's hitFlash (0.09s), stateless.
  const flinch = o.flinch ?? 0;
  const knock = flinch * r * 0.14;
  if (bank === 0 && bob === 0 && flinch === 0) {
    DRAWERS[form](ctx, x, y, r, color, t, o); // fast path
    volumePass(ctx, x, y, r, color);
    return;
  }
  ctx.save();
  ctx.translate(x, y + bob - knock);
  if (bank) ctx.rotate(bank);
  if (flinch > 0) ctx.scale(1 + flinch * 0.09, 1 - flinch * 0.07); // impact squash
  DRAWERS[form](ctx, 0, 0, r, color, t, o);
  volumePass(ctx, 0, 0, r, color);
  ctx.restore();
}
