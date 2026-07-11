// Codex screen — the Collection layer's face, and a genuine PROGRESSION dashboard (docs/COLLECTION.md).
// For each category it renders a RANK badge (Bronze→Ascendant), a completion bar, a reward TRACK with
// milestone pips, the live per-category BONUSES, and the collection's POWER contribution — plus a
// rank-up CELEBRATION (with a Power-gain popup + fanfare) fired for any promotions since the last
// visit (meta.pollCollectionRankUps, session-diffed). Read-only over meta.collection(); self-
// contained (inline-styled + one injected <style> for the celebration keyframes).

import { useEffect, useMemo, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { RANK_COLORS, rankMilestones } from '../core/collection';
import type { BonusLine, CollectionCategory, CollectionEntry, CollectionRank, CollectionRankUp, RewardKind } from '../core/collection';
import type { CutsceneDef } from '../core/cutscenes';
import { drawCutsceneStill } from '../render/cutsceneScenes';
import { CutscenePlayer } from './CutscenePlayer';
import { MobileSection } from './components/MobileSection';
import { useLayoutProfile } from './layoutProfile';

const REWARD_ICON: Record<RewardKind, string> = { title: '✦', badge: '◈', portrait: '☻', theme: '◧', cosmetic: '✷', bonus: '▲' };
const MILES = rankMilestones(); // [{ rank, at }] — the reward-track pip positions (single source)

const KEYFRAMES = `
@keyframes codexFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes codexPop { 0% { transform: scale(0.82); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
@keyframes codexPow { 0% { transform: scale(0.5); opacity: 0 } 55% { transform: scale(1.18) } 100% { transform: scale(1); opacity: 1 } }
@keyframes codexBadge { 0% { transform: scale(0.4) rotate(-12deg); opacity: 0 } 70% { transform: scale(1.15) rotate(4deg) } 100% { transform: scale(1) rotate(0); opacity: 1 } }
`;

/** One Memory Archive card — the cutscene as a collectible: painted thumbnail art (its own
 *  opening tableau), the memory's name, its small permanent passive, and ▶ Watch when
 *  unlocked; locked cards show the silhouette + the unlock hint (docs/CUTSCENES.md §archive). */
function MemoryCard({ def, unlocked, onPlay }: { def: CutsceneDef; unlocked: boolean; onPlay: () => void }): JSX.Element {
  const cvRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    cv.width = 260;
    cv.height = 96;
    drawCutsceneStill(ctx, cv.width, cv.height, def);
    if (!unlocked) {
      // the locked silhouette: dim the still to a rumor of itself
      ctx.fillStyle = 'rgba(3,5,9,0.82)';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
  }, [def, unlocked]);
  return (
    <div className={`mem-card${unlocked ? '' : ' is-locked'}`} style={{ ['--mc' as string]: def.palette.glow }}>
      <canvas ref={cvRef} className="mem-art" aria-hidden />
      <div className="mem-body">
        <span className="mem-kind">{def.kind === 'mega' ? '☠ MEGA MEMORY' : '◈ STORY MEMORY'}</span>
        <span className="mem-title">{unlocked ? def.title : '· · ·'}</span>
        <span className="mem-sub">{unlocked ? def.subtitle : def.unlockHint}</span>
        <span className="mem-boost">{unlocked ? `✦ ${def.boost.label}` : '✦ Unlock for a small permanent boost'}</span>
      </div>
      {unlocked ? (
        <button className="mem-play" onClick={onPlay} aria-label={`Watch ${def.title}`}>▶ Watch</button>
      ) : (
        <span className="mem-lock" aria-hidden>🔒</span>
      )}
    </div>
  );
}

/** The Memory Archive — every story cutscene as a collectible, replayable forever. */
function MemoryArchive(): JSX.Element {
  const memories = useMemo(() => meta.cutscenesView(), []);
  const [playing, setPlaying] = useState<CutsceneDef | null>(null);
  const portrait = useLayoutProfile().profile === 'portrait';
  const unlocked = memories.filter((m) => m.unlocked).length;
  const grid = (
    <div className="mem-grid">
      {memories.map((m) => (
        <MemoryCard key={m.def.id} def={m.def} unlocked={m.unlocked} onPlay={() => { audio.cue('ui'); setPlaying(m.def); }} />
      ))}
    </div>
  );
  return (
    <>
      {portrait ? (
        // Portrait: the full-art memory wall folds — it was most of the codex's scroll.
        <MobileSection title="Memory Archive" hint="Story cutscenes replay forever — each grants a small passive." count={`${unlocked}/${memories.length}`}>
          {grid}
        </MobileSection>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '14px 0 8px' }}>
            <h3 style={{ margin: 0, fontSize: 16, letterSpacing: '0.06em' }}>Memory Archive</h3>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{unlocked}/{memories.length} recovered · story cutscenes replay forever · each grants a small passive</span>
          </div>
          {grid}
        </>
      )}
      {playing && (
        <CutscenePlayer def={playing} onDone={() => { setPlaying(null); music.play('menu'); }} />
      )}
    </>
  );
}

function RankBadge({ rank, size = 11 }: { rank: CollectionRank; size?: number }): JSX.Element {
  const c = RANK_COLORS[rank];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: `${size * 0.2}px ${size * 0.7}px`, borderRadius: 999,
      fontSize: size, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: c, background: `${c}22`, border: `1px solid ${c}66`,
    }}>{rank}</span>
  );
}

function Bar({ pct, color }: { pct: number; color: string }): JSX.Element {
  return (
    <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${color}aa, ${color})`, transition: 'width 0.6s ease' }} />
    </div>
  );
}

/** The reward track: a filled line with a pip per earnable rank; reached pips glow in the rank color. */
function RewardTrack({ completion, rankIndex }: { completion: number; rankIndex: number }): JSX.Element {
  return (
    <div style={{ position: 'relative', height: 20, margin: '9px 2px 3px' }}>
      <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: 8, left: 0, width: `${Math.round(completion * 100)}%`, height: 3, background: 'linear-gradient(90deg,#5ad1ff,#ffd24d)', borderRadius: 2, transition: 'width 0.6s ease' }} />
      {MILES.map((m, i) => {
        const reached = rankIndex >= i + 1; // milestone i (0-based) is rank index i+1 (Bronze=1)
        const c = RANK_COLORS[m.rank];
        const translate = i === 0 ? '0' : i === MILES.length - 1 ? '-100%' : '-50%';
        return (
          <div key={m.rank} title={`${m.rank} — ${Math.round(m.at * 100)}%`}
            style={{ position: 'absolute', left: `${Math.round(m.at * 100)}%`, top: 1, transform: `translateX(${translate})` }}>
            <div style={{
              width: 15, height: 15, borderRadius: '50%',
              background: reached ? c : 'rgba(255,255,255,0.10)',
              border: `2px solid ${reached ? c : 'rgba(255,255,255,0.22)'}`,
              boxShadow: reached ? `0 0 8px ${c}` : 'none',
            }} />
          </div>
        );
      })}
    </div>
  );
}

function Bonuses({ lines }: { lines: BonusLine[] }): JSX.Element {
  if (lines.length === 0) return <div style={{ fontSize: 11, opacity: 0.45, marginTop: 8 }}>Cosmetic set — no combat bonus.</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {lines.map((b, i) => (
        <span key={i} style={{
          fontSize: 11.5, padding: '3px 8px', borderRadius: 6,
          background: b.power ? 'rgba(230,162,255,0.12)' : 'rgba(90,209,255,0.10)',
          border: `1px solid ${b.power ? 'rgba(230,162,255,0.35)' : 'rgba(90,209,255,0.25)'}`,
          color: b.power ? '#e6a2ff' : '#bfe9ff',
        }}><b>{b.value}</b> {b.label}</span>
      ))}
    </div>
  );
}

function tierColor(e: CollectionEntry): string {
  if (e.tier <= 0) return 'rgba(255,255,255,0.10)';
  const frac = e.maxTier > 1 ? e.tier / e.maxTier : 1;
  return frac >= 1 ? '#ffd24d' : frac >= 0.66 ? '#9be8ff' : frac >= 0.33 ? '#6fc8e6' : '#4f8aa0';
}

function EntryGrid({ entries }: { entries: CollectionEntry[] }): JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(126px, 1fr))', gap: 6, marginTop: 8 }}>
      {entries.map((e) => (
        <div key={e.id} title={`${e.name} — ${e.tierLabel}`} style={{
          display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', borderRadius: 6,
          background: 'rgba(255,255,255,0.04)', borderLeft: `3px solid ${tierColor(e)}`, opacity: e.tier <= 0 ? 0.45 : 1,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{e.tier <= 0 ? '???' : e.name}</span>
          <span style={{ fontSize: 10.5, opacity: 0.75 }}>{e.tierLabel}{e.maxTier > 1 && e.tier > 0 ? ` · ${e.tier}/${e.maxTier}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryCard({ c }: { c: CollectionCategory }): JSX.Element {
  const [open, setOpen] = useState(false);
  const portrait = useLayoutProfile().profile === 'portrait';
  const color = RANK_COLORS[c.rank];
  const nextText = c.nextRankAt == null ? 'Fully mastered'
    : c.rankIndex === 0 ? `${c.nextRank} — make a discovery`
    : `${c.nextRank} at ${Math.ceil(c.nextRankAt * 100)}%`;
  const body = (
    <>
      <RewardTrack completion={c.completion} rankIndex={c.rankIndex} />
      <div style={{ fontSize: 10.5, opacity: 0.6 }}>{c.rankIndex >= MILES.length ? 'Fully mastered ★' : `Next: ${nextText}`}</div>
      <Bonuses lines={c.bonuses} />
      <button onClick={() => setOpen((o) => !o)} style={{
        marginTop: 8, background: 'none', border: 'none', color: '#7fd7ff', cursor: 'pointer', fontSize: 11.5, padding: 0,
      }}>{open ? 'Hide entries ▴' : `Show ${c.total} entries ▾`}</button>
      {open && <EntryGrid entries={c.entries} />}
    </>
  );
  // Portrait: ~20 always-expanded category cards made the codex a 9-screen scroll — each
  // category folds to a header row (name · rank progress) and opens on demand.
  if (portrait) {
    return (
      <MobileSection title={c.name} hint={c.rankIndex >= MILES.length ? 'Fully mastered ★' : `${c.rank} · next: ${nextText}`} count={`${c.discovered}/${c.total} · ${Math.round(c.completion * 100)}%`}>
        {body}
      </MobileSection>
    );
  }
  return (
    <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}33` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, letterSpacing: '0.05em' }}>{c.name}</h3>
          <RankBadge rank={c.rank} />
        </div>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{c.discovered}/{c.total} · {Math.round(c.completion * 100)}%</span>
      </div>
      {body}
    </div>
  );
}

/** Celebration overlay — fires the fanfare + a Power-gain popup for promotions since the last visit. */
function RankUpCelebration({ rankUps, powerGain, onClose }: { rankUps: CollectionRankUp[]; powerGain: number; onClose: () => void }): JSX.Element {
  useEffect(() => { audio.resume(); audio.cue('rankup'); }, []);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,8,14,0.74)', backdropFilter: 'blur(3px)', animation: 'codexFade 0.3s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        minWidth: 300, maxWidth: 420, padding: '22px 26px', borderRadius: 14, textAlign: 'center',
        background: 'linear-gradient(160deg, rgba(28,20,44,0.98), rgba(12,16,26,0.98))',
        border: '1px solid rgba(230,162,255,0.4)', boxShadow: '0 12px 48px rgba(0,0,0,0.6)', animation: 'codexPop 0.5s cubic-bezier(.2,1.3,.4,1)',
      }}>
        <div style={{ fontSize: 11, letterSpacing: '0.28em', opacity: 0.7, marginBottom: 12 }}>CODEX RANK UP</div>
        {rankUps.map((r) => (
          <div key={r.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '8px 0', animation: 'codexBadge 0.6s ease both' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{r.categoryName}</span>
            <RankBadge rank={r.rank} size={14} />
          </div>
        ))}
        {powerGain > 0 && (
          <div style={{ marginTop: 10, fontSize: 24, fontWeight: 800, color: '#e6a2ff', animation: 'codexPow 0.7s ease both' }}>
            +{powerGain.toLocaleString()} Power
          </div>
        )}
        <button onClick={onClose} style={{
          marginTop: 16, padding: '8px 22px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          color: '#0a0e16', background: 'linear-gradient(90deg,#c9a2ff,#e6a2ff)', border: 'none',
        }}>Continue ▸</button>
      </div>
    </div>
  );
}

/** Codex as a dedicated headquarters screen. Reflects meta.collection() / meta.collectionRewards();
 * read-only, except it polls session rank-ups on mount to celebrate promotions. */
export function CollectionScreen(): JSX.Element {
  const view = useMemo(() => meta.collection(), []);
  const rewards = useMemo(() => meta.collectionRewards(), []);
  const [celebration, setCelebration] = useState<{ rankUps: CollectionRankUp[]; powerGain: number } | null>(null);

  useEffect(() => {
    const { rankUps, powerGain } = meta.pollCollectionRankUps();
    if (rankUps.length > 0) setCelebration({ rankUps, powerGain });
  }, []);

  return (
    <div className="collection" style={{ color: '#dfe8f2' }}>
      <style>{KEYFRAMES}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <div className="panel-title">Codex</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RankBadge rank={view.rank} size={12} />
          <span title="The collection's contribution to your Power Score" style={{ fontSize: 12.5, color: '#e6a2ff', fontWeight: 600 }}>
            ◆ Power ×{view.power.toFixed(2)}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 5 }}>
        {view.discovered}/{view.total} discovered · {Math.round(view.pct * 100)}% found · {Math.round(view.completion * 100)}% mastery
      </div>
      <Bar pct={view.completion} color={RANK_COLORS[view.rank]} />
      <div style={{ height: 14 }} />

      {view.categories.map((c) => <CategoryCard key={c.id} c={c} />)}

      <MemoryArchive />

      <h3 style={{ margin: '10px 0 8px', fontSize: 15, letterSpacing: '0.06em' }}>Identity Rewards</h3>
      {rewards.length === 0 ? (
        <div style={{ fontSize: 12.5, opacity: 0.7 }}>Complete a category to earn titles, badges, and cosmetics.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {rewards.map((r) => (
            <div key={r.id} title={r.desc} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
              background: 'rgba(255,210,77,0.10)', border: '1px solid rgba(255,210,77,0.35)', fontSize: 12.5,
            }}>
              <span style={{ color: '#ffd24d' }}>{REWARD_ICON[r.kind]}</span>
              <span>{r.name}</span>
              <span style={{ opacity: 0.55, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.kind}</span>
            </div>
          ))}
        </div>
      )}

      {celebration && <RankUpCelebration rankUps={celebration.rankUps} powerGain={celebration.powerGain} onClose={() => setCelebration(null)} />}
    </div>
  );
}
