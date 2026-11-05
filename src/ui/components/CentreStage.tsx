// CENTRE STAGE cards (docs/GAME-FEEL.md §centre-stage): the markup for every card the announcer
// (render/feel.ts) puts in the middle of the board. Shared by the live run (GameView) and the
// replay theater (SpectateView), so a card looks the same wherever it plays.

import type { CSSProperties } from 'react';
import { megaBossDef } from '../../core/megaboss';
import type { GameEventMap } from '../../core/events';
import type { Shown } from '../../render/feel';
import './CentreStage.css';

/** CENTRE STAGE cards (docs/GAME-FEEL.md §centre-stage) — everything that wants the middle of the
 *  board goes through ONE announcer (render/feel.ts ANNOUNCE: priorities + durations). */
export type StageCard =
  | { kind: 'wave'; label: string }
  | { kind: 'bossIntro'; name: string; epithet: string; kit: string[]; phases: number }
  | { kind: 'megaIntro'; name: string; title: string; glow: string }
  | { kind: 'tier'; tier: number }
  | { kind: 'weakPoint'; name: string; note: string }
  | { kind: 'bossFall'; name: string; epithet: string }
  | { kind: 'megaFall'; name: string; title: string; glow: string; sub: string };

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** The Mega fall card for a `megaKilled` event: organs ruptured · kill time · FLAWLESS. */
export function megaFallCard(e: GameEventMap['megaKilled']): StageCard {
  const def = megaBossDef(e.defId);
  const sub = [e.weakPoints > 0 ? `${e.weakPoints} ${e.weakPoints === 1 ? 'organ' : 'organs'} ruptured` : '', mmss(e.killSec), e.perfect ? 'FLAWLESS' : '']
    .filter(Boolean).join(' · ');
  return { kind: 'megaFall', name: def?.name ?? 'The organism', title: def?.title ?? '', glow: def?.palette.glow ?? '#ffd24d', sub };
}

/** The centre-stage card on show (docs/GAME-FEEL.md §centre-stage). Each card keeps its own look;
 *  `--stage-ms` hands it the announcer's duration so the CSS timeline and the slot always agree.
 *  The tier card is drawn on the canvas (render/assimilationFx.ts) — nothing to mount here. */
export function CentreStage({ shown }: { shown: Shown<StageCard> }): JSX.Element | null {
  const c = shown.item;
  const ms = { ['--stage-ms']: `${shown.ms}ms` } as CSSProperties;
  switch (c.kind) {
    case 'wave':
      return (
        <div className="wave-banner" key={shown.seq} style={ms} aria-hidden>
          <span className="wave-banner-t">{c.label}</span>
        </div>
      );
    case 'bossIntro':
      return (
        <div className="boss-intro" key={shown.seq} role="alert" style={ms}>
          <span className="boss-intro-eyebrow">◆ APEX THREAT DETECTED ◆</span>
          <span className="boss-intro-name">{c.name}</span>
          {c.epithet && <span className="boss-intro-epithet">— {c.epithet} —</span>}
          {c.kit.length > 0 && (
            <span className="boss-intro-kit" aria-label="Boss abilities">
              {c.kit.map((k) => <i key={k}>{k}</i>)}
            </span>
          )}
          <span className="boss-intro-sub">{c.phases > 1 ? `${c.phases}-phase organism — read the telegraphs` : 'Hold the line'}</span>
        </div>
      );
    case 'bossFall':
      return (
        <div className="boss-fall" key={shown.seq} role="status" style={ms}>
          <span className="boss-fall-name">{c.name}</span>
          <span className="boss-fall-sub">{c.epithet ? `${c.epithet} — FALLEN` : 'FALLEN'}</span>
        </div>
      );
    case 'megaIntro':
      return (
        <div className="mega-intro" key={shown.seq} role="alert" style={{ ...ms, ['--mega']: c.glow } as CSSProperties}>
          <span className="mega-intro-eyebrow">▼ BATTLEFIELD-SCALE ORGANISM ▼</span>
          <span className="mega-intro-name">{c.name}</span>
          <span className="mega-intro-title">{c.title}</span>
          <span className="mega-intro-sub">Burst its weak points — the battle continues beneath it</span>
        </div>
      );
    case 'megaFall':
      return (
        <div className="mega-intro mega-fall" key={shown.seq} role="status" style={{ ...ms, ['--mega']: c.glow } as CSSProperties}>
          <span className="mega-intro-eyebrow">◆ ORGANISM DESTROYED ◆</span>
          <span className="mega-intro-name">{c.name} FALLS</span>
          {c.title && <span className="mega-intro-title">{c.title}</span>}
          <span className="mega-intro-sub">{c.sub}</span>
        </div>
      );
    case 'weakPoint':
      return (
        <div className="wp-callout" key={shown.seq} role="status" style={ms}>
          <span className="wp-callout-name">{c.name} DESTROYED</span>
          <span className="wp-callout-note">{c.note}</span>
        </div>
      );
    case 'tier':
      return null;
  }
}
