import { useMemo, useState } from 'react';
import { STAGE_LABEL, stageIndex } from '../../store/records';
import { ENDING_LABEL, fmtAgo, fmtDur, Status, STATUSES, STATUS_LABEL, useAdmin, Visitor } from '../store';
import { Avatar, displayName, Empty, Icon, matches, Place, Score, StatusBadge } from '../ui';
import { openVisitor } from '../Admin';
import { downloadCsv } from './Settings';

type SortKey = 'name' | 'location' | 'status' | 'score' | 'furthest' | 'duration' | 'updatedAt' | 'owner';

export default function Visitors({ visitors, search }: { visitors: Visitor[]; search: string }) {
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [ending, setEnding] = useState<string>('all');
  const [owner, setOwner] = useState<string>('all');
  const [starred, setStarred] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'updatedAt', dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState('');
  const team = useAdmin((s) => s.crm.team);
  const a = useAdmin();

  const rows = useMemo(() => {
    const f = visitors.filter(
      (v) =>
        matches(v, search) &&
        (status === 'all' || v.status === status) &&
        (ending === 'all' || (ending === 'none' ? !v.ending : v.ending === ending)) &&
        (owner === 'all' || v.owner === owner) &&
        (!starred || v.starred),
    );
    const val = (v: Visitor): string | number => {
      switch (sort.k) {
        case 'status':
          return STATUSES.indexOf(v.status);
        case 'name':
          return displayName(v).toLowerCase();
        case 'location':
          return v.net ? `${v.net.country} ${v.net.city}` : '~';
        case 'furthest':
          return stageIndex(v.furthest);
        default:
          return v[sort.k];
      }
    };
    return f.sort((x, y) => {
      const a = val(x);
      const b = val(y);
      return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
    });
  }, [visitors, search, status, ending, owner, starred, sort]);

  const ids = [...sel].filter((id) => rows.some((r) => r.id === id));
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const Th = ({ k, children, className = '' }: { k: SortKey; children: string; className?: string }) => (
    <th className={className} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 }))}>
        {children}
        <span className="sort-ind">{sort.k === k ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="visitors">
      <div className="toolbar">
        <div className="chips">
          <button className={`chip ${status === 'all' ? 'is-on' : ''}`} onClick={() => setStatus('all')}>
            All <span className="num">{visitors.length}</span>
          </button>
          {STATUSES.map((s) => (
            <button key={s} className={`chip ${status === s ? 'is-on' : ''}`} onClick={() => setStatus(s)}>
              <span className={`dot st-${s}`} /> {STATUS_LABEL[s]}{' '}
              <span className="num">{visitors.filter((v) => v.status === s).length}</span>
            </button>
          ))}
        </div>
        <div className="filters">
          <select value={ending} onChange={(e) => setEnding(e.target.value)} aria-label="Ending">
            <option value="all">Any ending</option>
            <option value="none">No ending</option>
            {Object.entries(ENDING_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
            <option value="all">Any owner</option>
            {team.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button className={`btn ghost ${starred ? 'is-on' : ''}`} onClick={() => setStarred((x) => !x)} aria-pressed={starred}>
            <Icon name="star" filled={starred} /> Starred
          </button>
          <button className="btn ghost" onClick={() => downloadCsv(rows)}>
            <Icon name="download" /> CSV
          </button>
        </div>
      </div>

      {ids.length > 0 && (
        <div className="bulk">
          <strong>{ids.length} selected</strong>
          <select value="" onChange={(e) => e.target.value && a.setStatus(ids, e.target.value as Status)} aria-label="Set status">
            <option value="">Set status…</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select value="" onChange={(e) => e.target.value && a.setOwner(ids, e.target.value)} aria-label="Assign owner">
            <option value="">Assign to…</option>
            {team.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              a.addTag(ids, bulkTag);
              setBulkTag('');
            }}
          >
            <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="Add tag" aria-label="Add tag" />
          </form>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(`Delete ${ids.length} visitor record(s)? This cannot be undone.`)) {
                a.remove(ids);
                setSel(new Set());
              }
            }}
          >
            <Icon name="trash" /> Delete
          </button>
          <button className="btn ghost" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>
          <p>No visitors match these filters.</p>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
                    aria-label="Select all"
                  />
                </th>
                <Th k="name">Visitor</Th>
                <Th k="location" className="hide-sm">Location</Th>
                <Th k="status">Status</Th>
                <Th k="score">Score</Th>
                <Th k="furthest">Furthest stage</Th>
                <th className="hide-md">Ending</th>
                <Th k="duration" className="hide-sm">Time</Th>
                <Th k="owner" className="hide-md">Owner</Th>
                <th className="hide-md">Tags</th>
                <Th k="updatedAt">Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className={sel.has(v.id) ? 'is-sel' : ''} onClick={() => openVisitor(v.id)}>
                  <td className="check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={sel.has(v.id)} onChange={() => toggle(v.id)} aria-label={`Select ${v.code}`} />
                  </td>
                  <td>
                    <span className="who">
                      <Avatar v={v} size="sm" />
                      <span>
                        <strong className="uname">{displayName(v)}</strong>
                        {v.starred && <span className="star-on"><Icon name="star" size={12} filled /></span>}
                        {v.live && <span className="live-tag">live</span>}
                        {v.demo && <span className="demo-tag">demo</span>}
                        <span className="sub">
                          <span className="mono">{v.code}</span> · {v.net?.ip || (v.device.touch ? 'Touch' : 'Desktop')}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="hide-sm">
                    <Place net={v.net} />
                  </td>
                  <td>
                    <StatusBadge s={v.status} />
                  </td>
                  <td>
                    <Score n={v.score} />
                  </td>
                  <td>{STAGE_LABEL[v.furthest]}</td>
                  <td className="hide-md">{v.ending ? ENDING_LABEL[v.ending] : <span className="muted">—</span>}</td>
                  <td className="hide-sm num">{fmtDur(v.duration)}</td>
                  <td className="hide-md">{v.owner === 'Unassigned' ? <span className="muted">—</span> : v.owner}</td>
                  <td className="hide-md">
                    <span className="tags">
                      {v.tags.slice(0, 2).map((t) => (
                        <span key={t} className="tag">
                          #{t}
                        </span>
                      ))}
                      {v.tags.length > 2 && <span className="muted small">+{v.tags.length - 2}</span>}
                    </span>
                  </td>
                  <td className="muted">{fmtAgo(v.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small foot-count">
        Showing {rows.length} of {visitors.length}
      </p>
    </div>
  );
}
