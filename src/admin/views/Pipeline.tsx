import { useState } from 'react';
import { STAGE_LABEL } from '../../store/records';
import { fmtAgo, Status, STATUSES, STATUS_LABEL, useAdmin, Visitor } from '../store';
import { Avatar, Icon, matches, Score } from '../ui';
import { openVisitor } from '../Admin';

const HINT: Record<Status, string> = {
  new: 'Arrived, not yet past the intro',
  engaged: 'Exploring the page and early stages',
  qualified: 'Went through the descent',
  converted: 'Chose an ending',
  lost: 'Bounced early',
};

/** Kanban of visitors by status. Drag a card, or use its menu on touch. */
export default function Pipeline({ visitors, search }: { visitors: Visitor[]; search: string }) {
  const setStatus = useAdmin((s) => s.setStatus);
  const [over, setOver] = useState<Status | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const shown = visitors.filter((v) => matches(v, search));

  return (
    <div className="board">
      {STATUSES.map((s) => {
        const col = shown.filter((v) => v.status === s).sort((a, b) => b.score - a.score);
        const avg = col.length ? Math.round(col.reduce((a, v) => a + v.score, 0) / col.length) : 0;
        return (
          <section
            key={s}
            className={`col ${over === s ? 'is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              const v = visitors.find((x) => x.id === id);
              if (v && v.status !== s) setStatus([id], s);
              setOver(null);
              setDragging(null);
            }}
          >
            <header className="col-head">
              <span className={`dot st-${s}`} />
              <h2>{STATUS_LABEL[s]}</h2>
              <span className="num col-count">{col.length}</span>
            </header>
            <p className="col-hint">
              {HINT[s]}
              {col.length > 0 && <> · avg score {avg}</>}
            </p>
            <div className="col-body">
              {col.slice(0, 60).map((v) => (
                <article
                  key={v.id}
                  className={`kcard ${dragging === v.id ? 'is-drag' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', v.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragging(v.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onClick={() => openVisitor(v.id)}
                >
                  <div className="kcard-top">
                    <Avatar v={v} size="sm" />
                    <span className="mono">{v.code}</span>
                    {v.starred && (
                      <span className="star-on">
                        <Icon name="star" size={12} filled />
                      </span>
                    )}
                    {v.live && <span className="live-tag">live</span>}
                    <select
                      className="kcard-move"
                      value={s}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setStatus([v.id], e.target.value as Status)}
                      aria-label={`Move ${v.code}`}
                    >
                      {STATUSES.map((x) => (
                        <option key={x} value={x}>
                          {STATUS_LABEL[x]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="kcard-mid">
                    <span>{STAGE_LABEL[v.furthest]}</span>
                    <Score n={v.score} />
                  </div>
                  <div className="kcard-foot">
                    <span className="muted">{v.owner === 'Unassigned' ? 'Unassigned' : v.owner}</span>
                    {v.notes.length > 0 && (
                      <span className="muted">
                        <Icon name="note" size={12} /> {v.notes.length}
                      </span>
                    )}
                    <span className="muted">{fmtAgo(v.updatedAt)}</span>
                  </div>
                  {v.tags.length > 0 && (
                    <div className="tags">
                      {v.tags.map((t) => (
                        <span key={t} className="tag">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {col.length > 60 && <p className="muted small center">+{col.length - 60} more in Visitors</p>}
              {col.length === 0 && <p className="col-empty">Drop visitors here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
