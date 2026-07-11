// Mastery Profile — the DISPLAY surface for mastery-as-experience (MASTERY.md). Wear a
// title you've earned and read the lore your mastery uncovered. Pure identity: titles and
// lore are unlocked by leveling tower/hero Mastery (meta.finishRun); the minor permanent
// power stays the log curve in the labs. Reads the reactive save store.

import { meta } from '../state/meta';
import { masteryRewardById } from '../core/mastery';
import { titleName } from '../state/profile';
import { SIGILS, sigilById } from '../core/identity';

export function MasteryProfile(): JSX.Element {
  const save = meta.use();
  const titles = save.unlockedTitles;
  const lore = save.unlockedLore;
  const equippedName = save.equippedTitle ? titleName(save.equippedTitle) : null;

  return (
    <div className="panel">
      <div className="panel-title">Mastery Profile</div>
      <div className="panel-sub">
        Wear a title you’ve earned and read the lore your mastery uncovers — proof of the hours, not just a number.
      </div>

      <div className="mp-titlebar">
        <span className="mp-label">Worn title</span>
        <span className="mp-equipped">{equippedName ?? '— none —'}</span>
      </div>

      {titles.length > 0 ? (
        <div className="lab-fork-opts" style={{ flexWrap: 'wrap' }}>
          <button className={`fork-opt ${save.equippedTitle === null ? 'on' : ''}`} onClick={() => meta.equipTitle(null)}>
            None
          </button>
          {titles.map((id) => (
            <button
              key={id}
              className={`fork-opt ${save.equippedTitle === id ? 'on' : ''}`}
              onClick={() => meta.equipTitle(id)}
            >
              {titleName(id)}
            </button>
          ))}
        </div>
      ) : (
        <div className="mp-empty">No titles yet — raise a tower or hero to Mastery 25 to earn one.</div>
      )}

      {/* Commissioning SIGIL (docs/PROFILE.md §commissioning) — worn beside the name; unlike the
          founding-title oath, the sigil is freely re-chosen here any time. */}
      <div className="mp-titlebar">
        <span className="mp-label">Worn sigil</span>
        <span className="mp-equipped">{sigilById(save.profileSigil)?.name ?? '— none —'}</span>
      </div>
      <div className="lab-fork-opts" style={{ flexWrap: 'wrap' }}>
        <button className={`fork-opt ${save.profileSigil === null ? 'on' : ''}`} onClick={() => meta.setProfileSigil(null)}>
          None
        </button>
        {SIGILS.map((s) => (
          <button
            key={s.id}
            className={`fork-opt ${save.profileSigil === s.id ? 'on' : ''}`}
            title={s.blurb}
            onClick={() => meta.setProfileSigil(s.id)}
          >
            <i style={{ color: s.accent, fontStyle: 'normal' }} aria-hidden>{s.glyph}</i> {s.name}
          </button>
        ))}
      </div>

      <div className="mp-codex-h">Codex{lore.length > 0 ? ` · ${lore.length}` : ''}</div>
      {lore.length > 0 ? (
        <div className="mp-codex">
          {lore.map((id) => {
            const r = masteryRewardById(id);
            if (!r) return null;
            return (
              <div className="mp-lore" key={id}>
                <div className="mp-lore-t">{r.name}</div>
                <div className="mp-lore-b">{r.text}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mp-empty">No lore yet — Mastery 10 on any unit unlocks its first entry.</div>
      )}
    </div>
  );
}
