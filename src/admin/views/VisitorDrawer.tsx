import { useEffect, useState } from 'react';
import { STAGE_LABEL, STAGE_ORDER, stageIndex } from '../../store/records';
import { ENDING_LABEL, fmtAgo, fmtDate, fmtDur, Status, STATUSES, STATUS_LABEL, useAdmin, Visitor } from '../store';
import { Avatar, Icon, Score, StatusBadge } from '../ui';

const SECRET_LABEL: Record<string, string> = {
  still: 'Kept still when asked',
  edge: 'Tried to leave through the edge',
  restraint: "Didn't click the button",
  glyph: 'Found the hidden glyph',
  'exit-first': 'Killed Exit first',
};

type Tab = 'overview' | 'journey' | 'notes';

export default function VisitorDrawer({ v, onClose }: { v: Visitor; onClose: () => void }) {
  const a = useAdmin();
  const team = useAdmin((s) => s.crm.team);
  const [tab, setTab] = useState<Tab>('overview');
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  const m = v.metrics;
  const facts: [string, string][] = [
    ['Session time', fmtDur(v.duration)],
    ['Clicks', m.clicks.toLocaleString()],
    ['Cursor travel', `${Math.round(m.cursorDistance).toLocaleString()} px`],
    ['Scroll distance', `${Math.round(m.scrollDistance).toLocaleString()} px`],
    ['Hesitations', String(m.hesitations)],
    ['Longest still', `${m.longestStill}s`],
    ['First warning', m.obeyedFirstWarning === null ? '—' : m.obeyedFirstWarning ? 'Obeyed' : 'Disobeyed'],
    ['Pressed “don’t click”', stageIndex(v.furthest) >= stageIndex('transform') ? (m.dontClickPressed ? 'Yes' : 'No') : '—'],
    ['Predictions right', m.predictionTotal ? `${m.predictionHits} / ${m.predictionTotal}` : '—'],
    ['Caught in chase', String(m.chaseCaught)],
    ['Deaths', String(m.deaths)],
    ['Boss damage', `${m.bossProgress}%`],
  ];

  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={`Visitor ${v.code}`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <Avatar v={v} size="lg" />
          <div className="drawer-title">
            <h2 className="mono">
              {v.code}
              {v.live && <span className="live-tag">live</span>}
              {v.demo && <span className="demo-tag">demo</span>}
            </h2>
            <p className="muted small">
              First seen {fmtDate(v.startedAt)} · last seen {fmtAgo(v.updatedAt)}
            </p>
          </div>
          <button className="icon-btn" onClick={() => a.toggleStar(v.id)} aria-pressed={v.starred} aria-label="Star">
            <span className={v.starred ? 'star-on' : ''}>
              <Icon name="star" filled={v.starred} />
            </span>
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <div className="drawer-fields">
          <label>
            <span>Status</span>
            <select value={v.status} onChange={(e) => a.setStatus([v.id], e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Owner</span>
            <select value={v.owner} onChange={(e) => a.setOwner([v.id], e.target.value)}>
              {!team.includes(v.owner) && <option>{v.owner}</option>}
              {team.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Score</span>
            <Score n={v.score} />
          </div>
          <div className="field">
            <span>Ending</span>
            <strong>{v.ending ? ENDING_LABEL[v.ending] : '—'}</strong>
          </div>
        </div>

        <div className="drawer-tags">
          {v.tags.map((t) => (
            <span key={t} className="tag removable">
              #{t}
              <button onClick={() => a.removeTag(v.id, t)} aria-label={`Remove tag ${t}`}>
                ×
              </button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              a.addTag([v.id], tag);
              setTag('');
            }}
          >
            <input className="tag-input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ tag" aria-label="Add tag" />
          </form>
        </div>

        <nav className="tabs">
          {(['overview', 'journey', 'notes'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
              {t === 'notes' ? `Notes (${v.notes.length})` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        <div className="drawer-body">
          {tab === 'overview' && (
            <>
              <dl className="facts">
                {facts.map(([k, val]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
              <h3>Secrets found</h3>
              {v.secrets.length ? (
                <ul className="secrets">
                  {v.secrets.map((s) => (
                    <li key={s}>
                      <Icon name="sparkle" size={13} /> {SECRET_LABEL[s] ?? s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">None.</p>
              )}
              <h3>Device</h3>
              <p className="small">
                {v.device.touch ? 'Touch' : 'Pointer'} · {v.device.w}×{v.device.h} · {v.device.lang || 'unknown locale'}
                {v.device.low && ' · low-power mode'}
                {v.device.reduced && ' · reduced motion'}
              </p>
              <p className="muted small">
                Current status: <StatusBadge s={v.status} />
              </p>
            </>
          )}

          {tab === 'journey' && (
            <ol className="journey">
              {STAGE_ORDER.map((s) => {
                const hit = v.journey.find((j) => j.stage === s);
                const reached = stageIndex(s) <= stageIndex(v.furthest);
                return (
                  <li key={s} className={reached ? 'is-done' : ''}>
                    <span className="j-dot" />
                    <span className="j-name">{STAGE_LABEL[s]}</span>
                    <span className="muted num">{hit ? `+${fmtDur(hit.t)}` : reached ? '' : '—'}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {tab === 'notes' && (
            <div className="notes">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  a.addNote(v.id, note);
                  setNote('');
                }}
              >
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Write a note about this visitor…"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit();
                  }}
                />
                <button className="btn primary" disabled={!note.trim()}>
                  Add note
                </button>
              </form>
              {[...v.notes].reverse().map((n) => (
                <article key={n.id} className="note">
                  <header>
                    <strong>{n.author}</strong>
                    <span className="muted small">{fmtDate(n.t)}</span>
                    <button className="icon-btn sm" onClick={() => a.deleteNote(v.id, n.id)} aria-label="Delete note">
                      <Icon name="trash" size={13} />
                    </button>
                  </header>
                  <p>{n.text}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="drawer-foot">
          <button
            className="btn danger ghost"
            onClick={() => {
              if (confirm(`Delete ${v.code}? This cannot be undone.`)) {
                a.remove([v.id]);
                onClose();
              }
            }}
          >
            <Icon name="trash" /> Delete visitor
          </button>
        </footer>
      </aside>
    </div>
  );
}
