// Codex screen — the Collection layer's face, and a genuine PROGRESSION dashboard (docs/COLLECTION.md).
// Three wings under one masthead (no infinite scroll): CODEX — a compact category tile grid that
// drills into a per-category detail (rank badge, completion bar, reward TRACK with milestone pips,
// live BONUSES, the entry grid); MEMORIES — the cutscene archive; REWARDS — earned identity items.
// A rank-up CELEBRATION (Power-gain popup + fanfare) fires for any promotions since the last visit
// (meta.pollCollectionRankUps, session-diffed). Read-only over meta.collection().

import { useEffect, useMemo, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { RANK_COLORS, rankMilestones } from '../core/collection';
import type { BonusLine, CollectionCategory, CollectionEntry, CollectionRank, CollectionRankUp, RewardKind } from '../core/collection';
import type { CutsceneDef } from '../core/cutscenes';
import { drawCutsceneStill } from '../render/cutsceneScenes';
import { CutscenePlayer } from './CutscenePlayer';

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

/** The Memory Archive wing — every story cutscene as a collectible, replayable forever. */
function MemoryArchive({ memories }: { memories: ReturnType<typeof meta.cutscenesView> }): JSX.Element {
  const [playing, setPlaying] = useState<CutsceneDef | null>(null);
  const unlocked = memories.filter((m) => m.unlocked).length;
  return (
    <>
      <div className="cx-wing-sub">
        {unlocked}/{memories.length} recovered · story cutscenes replay forever · each grants a small passive
      </div>
      <div className="mem-grid">
        {memories.map((m) => (
          <MemoryCard key={m.def.id} def={m.def} unlocked={m.unlocked} onPlay={() => { audio.cue('ui'); setPlaying(m.def); }} />
        ))}
      </div>
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

/** Next-rank line for a category — shared by the tile hint and the detail header. */
function nextRankText(c: CollectionCategory): string {
  if (c.nextRankAt == null || c.rankIndex >= MILES.length) return 'Fully mastered ★';
  if (c.rankIndex === 0) return `${c.nextRank} — make a discovery`;
  return `${c.nextRank} at ${Math.ceil(c.nextRankAt * 100)}%`;
}

/** One compact category tile — the codex browses as a wall of these; tap to drill in. */
function CategoryTile({ c, onOpen }: { c: CollectionCategory; onOpen: () => void }): JSX.Element {
  const color = RANK_COLORS[c.rank];
  return (
    <button className="cx-tile" style={{ ['--cxc' as string]: color }} onClick={onOpen}>
      <span className="cx-tile-top">
        <b className="cx-tile-name">{c.name}</b>
        <RankBadge rank={c.rank} size={10} />
      </span>
      <span className="cx-tile-bar" aria-hidden><i style={{ width: `${Math.round(c.completion * 100)}%` }} /></span>
      <span className="cx-tile-foot">
        <span>{c.discovered}/{c.total} · {Math.round(c.completion * 100)}%</span>
        <i className="cx-tile-go" aria-hidden>▸</i>
      </span>
    </button>
  );
}

/** The drilled-in category page: back row, header, reward track, bonuses, every entry. */
function CategoryDetail({ c, onBack }: { c: CollectionCategory; onBack: () => void }): JSX.Element {
  const color = RANK_COLORS[c.rank];
  return (
    <div className="cx-detail" style={{ ['--cxc' as string]: color }}>
      <button className="cx-back" onClick={onBack}>‹ All categories</button>
      <div className="cx-detail-head">
        <div className="cx-detail-title">
          <h3>{c.name}</h3>
          <RankBadge rank={c.rank} />
        </div>
        <span className="cx-detail-count">{c.discovered}/{c.total} · {Math.round(c.completion * 100)}%</span>
      </div>
      <RewardTrack completion={c.completion} rankIndex={c.rankIndex} />
      <div style={{ fontSize: 10.5, opacity: 0.6 }}>{c.rankIndex >= MILES.length ? 'Fully mastered ★' : `Next: ${nextRankText(c)}`}</div>
      <Bonuses lines={c.bonuses} />
      <EntryGrid entries={c.entries} />
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

const CX_TABS = [
  { id: 'codex', glyph: '▤', label: 'Codex' },
  { id: 'memories', glyph: '▣', label: 'Memories' },
  { id: 'rewards', glyph: '✦', label: 'Rewards' },
] as const;
type CxTab = (typeof CX_TABS)[number]['id'];

/** Codex as a dedicated headquarters screen. Reflects meta.collection() / meta.collectionRewards();
 * read-only, except it polls session rank-ups on mount to celebrate promotions. */
export function CollectionScreen(): JSX.Element {
  const view = useMemo(() => meta.collection(), []);
  const rewards = useMemo(() => meta.collectionRewards(), []);
  const memories = useMemo(() => meta.cutscenesView(), []);
  const [celebration, setCelebration] = useState<{ rankUps: CollectionRankUp[]; powerGain: number } | null>(null);
  const [tab, setTab] = useState<CxTab>('codex');
  const [openCat, setOpenCat] = useState<string | null>(null);
  const open = view.categories.find((c) => c.id === openCat) ?? null;
  const memUnlocked = memories.filter((m) => m.unlocked).length;

  useEffect(() => {
    const { rankUps, powerGain } = meta.pollCollectionRankUps();
    if (rankUps.length > 0) setCelebration({ rankUps, powerGain });
  }, []);

  return (
    <div className="collection cx" style={{ color: '#dfe8f2' }}>
      <style>{KEYFRAMES}</style>

      {/* ── MASTHEAD — the whole collection at a glance ── */}
      <div className="cx-mast">
        <div className="cx-mast-id">
          <div className="panel-title">Bio-Dex Codex</div>
          <div className="cx-mast-sub">
            {view.discovered}/{view.total} discovered · {Math.round(view.pct * 100)}% found · {Math.round(view.completion * 100)}% mastery
          </div>
        </div>
        <div className="cx-mast-stats">
          <RankBadge rank={view.rank} size={12} />
          <span className="cx-mast-power" title="The collection's contribution to your Power Score">
            ◆ Power ×{view.power.toFixed(2)}
          </span>
        </div>
      </div>
      <Bar pct={view.completion} color={RANK_COLORS[view.rank]} />

      {/* ── SUB-NAV — three wings, no infinite scroll ── */}
      <div className="wing-tabs cx-tabs" role="tablist" aria-label="Codex pages" style={{ ['--wingc' as string]: 'var(--viral)' }}>
        {CX_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`wing-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => { setTab(t.id); setOpenCat(null); }}
          >
            <span className="wing-tab-glyph" aria-hidden>{t.glyph}</span>
            <span className="wing-tab-body">
              <b>{t.label}</b>
              <i>{t.id === 'codex' ? `${view.categories.length} categories`
                : t.id === 'memories' ? `${memUnlocked}/${memories.length} recovered`
                : `${rewards.length} earned`}</i>
            </span>
          </button>
        ))}
      </div>

      {tab === 'codex' && (open ? (
        <CategoryDetail c={open} onBack={() => setOpenCat(null)} />
      ) : (
        <>
          <div className="cx-wing-sub">Every category ranks Bronze → Ascendant — open one for its reward track, bonuses and entries.</div>
          <div className="cx-tiles">
            {view.categories.map((c) => <CategoryTile key={c.id} c={c} onOpen={() => { audio.cue('ui'); setOpenCat(c.id); }} />)}
          </div>
        </>
      ))}

      {tab === 'memories' && <MemoryArchive memories={memories} />}

      {tab === 'rewards' && (
        <>
          <div className="cx-wing-sub">Identity rewards earned from category ranks — titles, badges and cosmetics.</div>
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
        </>
      )}

      {celebration && <RankUpCelebration rankUps={celebration.rankUps} powerGain={celebration.powerGain} onClose={() => setCelebration(null)} />}
    </div>
  );
}
