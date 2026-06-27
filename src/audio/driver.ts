// AudioDriver — turns the live run into sound WITHOUT touching the sim. Each render
// frame it diffs the render state + HUD snapshot (both already produced for the renderer)
// against the previous frame and fires registry SFX: new projectiles → fire, kills delta
// → death, integrity drop → breach, new towers → place, the sim's own event floats
// (SHRED / APEX! / DOWN) → their stings, and phase changes → stingers + music scene.
//
// Pure presentation: it only READS observable output and calls the AudioManager, so the
// deterministic core stays audio-free. One driver per run (GameView makes a fresh one).

import { audio } from './audio';
import type { RenderState } from '../core/game';
import type { Phase } from '../core/types';
import type { MusicScene } from './music';

function sceneFor(phase: Phase): MusicScene {
  if (phase === 'wave') return 'combat';
  if (phase === 'won') return 'won';
  if (phase === 'lost') return 'lost';
  return 'prep';
}

export class AudioDriver {
  private lastProjId = 0;
  private lastKills = 0;
  private lastIntegrity = Infinity;
  private lastTowers = 0;
  private lastPhase: Phase | null = null;
  private lastBonusSeq = 0;
  private readonly sounded = new WeakSet<object>(); // event floats already played
  private started = false;

  /** `kills` + `earlyBonusSeq` come from the live Game (not in RenderState); everything
   *  else is read off the render state already produced for the renderer. */
  frame(rs: RenderState, kills: number, earlyBonusSeq: number): void {
    // First frame: seed baselines (no "catch-up" burst), set the opening scene.
    if (!this.started) {
      this.lastKills = kills;
      this.lastIntegrity = rs.integrity;
      this.lastTowers = rs.towers.length;
      this.lastPhase = rs.phase;
      this.lastBonusSeq = earlyBonusSeq;
      for (const p of rs.projectiles) if (p.id > this.lastProjId) this.lastProjId = p.id;
      for (const f of rs.floats) this.sounded.add(f);
      this.started = true;
      audio.setScene(sceneFor(rs.phase));
      return;
    }

    // Fire — new projectiles since last frame (ids only ever increase), per kind.
    let needle = false;
    let mortar = false;
    let maxId = this.lastProjId;
    for (const p of rs.projectiles) {
      if (p.id > this.lastProjId) {
        if (p.kind === 'needle') needle = true;
        else if (p.kind === 'mortar') mortar = true;
      }
      if (p.id > maxId) maxId = p.id;
    }
    this.lastProjId = maxId;
    if (needle) audio.play('fire_needle');
    if (mortar) audio.play('fire_mortar');

    // Deaths — coalesce the kills delta (cap a few/frame), pitch-vary so a wave of
    // deaths shimmers instead of machine-gunning one tone. Math.random here is
    // presentation-only — it never touches the sim's seeded RNG.
    const dk = kills - this.lastKills;
    this.lastKills = kills;
    if (dk > 0) for (let i = 0, n = Math.min(dk, 3); i < n; i++) audio.play('death', 0.85 + Math.random() * 0.4);

    // Breach — integrity dropped (something reached the line).
    if (rs.integrity < this.lastIntegrity) audio.play('breach');
    this.lastIntegrity = rs.integrity;

    // Placement — a new tower appeared on the board.
    if (rs.towers.length > this.lastTowers) audio.play('place');
    this.lastTowers = rs.towers.length;

    // Signature events — the sim already emits these as battlefield floats.
    for (const f of rs.floats) {
      if (this.sounded.has(f)) continue;
      this.sounded.add(f);
      if (f.text === 'SHRED') audio.play('shred');
      else if (f.text === 'APEX!' || f.text === 'SLAM!') audio.play('apex');
      else if (f.text === 'DOWN') audio.play('hero_down');
    }

    // Early-start biomass bonus.
    if (earlyBonusSeq !== this.lastBonusSeq) {
      audio.play('bonus');
      this.lastBonusSeq = earlyBonusSeq;
    }

    // Phase transition → stinger + music scene.
    if (rs.phase !== this.lastPhase) {
      if (rs.phase === 'wave') audio.play('wave_start');
      else if (rs.phase === 'draft') audio.play('wave_clear');
      else if (rs.phase === 'won') audio.play('victory');
      else if (rs.phase === 'lost') audio.play('defeat');
      audio.setScene(sceneFor(rs.phase));
      this.lastPhase = rs.phase;
    }
  }
}
