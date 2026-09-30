import { useRef, useState } from 'react';
import { STAGE_LABEL } from '../../store/records';
import { ENDING_LABEL, STATUS_LABEL, useAdmin, Visitor } from '../store';
import { Card, Icon } from '../ui';

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function downloadCsv(visitors: Visitor[]) {
  const cols: [string, (v: Visitor) => string | number][] = [
    ['username', (v) => v.username ?? ''],
    ['code', (v) => v.code],
    ['ip', (v) => v.net?.ip ?? ''],
    ['city', (v) => v.net?.city ?? ''],
    ['region', (v) => v.net?.region ?? ''],
    ['country', (v) => v.net?.country ?? ''],
    ['lat', (v) => v.net?.lat ?? ''],
    ['lon', (v) => v.net?.lon ?? ''],
    ['timezone', (v) => v.net?.timezone ?? ''],
    ['user_agent', (v) => v.net?.ua ?? ''],
    ['referrer', (v) => v.net?.referrer ?? ''],
    ['status', (v) => STATUS_LABEL[v.status]],
    ['score', (v) => v.score],
    ['owner', (v) => v.owner],
    ['furthest_stage', (v) => STAGE_LABEL[v.furthest]],
    ['ending', (v) => (v.ending ? ENDING_LABEL[v.ending] : '')],
    ['duration_s', (v) => v.duration],
    ['clicks', (v) => v.metrics.clicks],
    ['secrets', (v) => v.secrets.join(' ')],
    ['tags', (v) => v.tags.join(' ')],
    ['notes', (v) => v.notes.map((n) => n.text).join(' | ')],
    ['first_seen', (v) => new Date(v.startedAt).toISOString()],
    ['last_seen', (v) => new Date(v.updatedAt).toISOString()],
    ['device', (v) => (v.device.touch ? 'touch' : 'pointer')],
    ['locale', (v) => v.device.lang],
    ['demo', (v) => (v.demo ? 'yes' : '')],
  ];
  const esc = (x: string | number) => {
    const s = String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.map((c) => c[0]).join(','), ...visitors.map((v) => cols.map((c) => esc(c[1](v))).join(','))].join('\n');
  save(`alive-visitors-${stamp()}.csv`, body, 'text/csv');
}

export default function Settings({ visitors }: { visitors: Visitor[] }) {
  const a = useAdmin();
  const crm = useAdmin((s) => s.crm);
  const records = useAdmin((s) => s.records);
  const [mate, setMate] = useState('');
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const demo = records.filter((r) => r.demo).length;
  const source = useAdmin((s) => s.source);

  return (
    <div className="settings">
      <Card title="Team">
        <p className="muted small">Owners you can assign visitors to. Your name is used as the author of notes and changes.</p>
        <ul className="team">
          {crm.team.map((t) => (
            <li key={t}>
              <span className="avatar sm">{t.slice(0, 2).toUpperCase()}</span>
              <span>{t}</span>
              {crm.me === t ? (
                <span className="badge st-engaged">You</span>
              ) : t !== 'Unassigned' ? (
                <button className="link" onClick={() => a.setMe(t)}>
                  Act as
                </button>
              ) : null}
              {t !== 'Unassigned' && (
                <button className="icon-btn sm" onClick={() => a.removeTeammate(t)} aria-label={`Remove ${t}`}>
                  <Icon name="close" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            a.addTeammate(mate);
            setMate('');
          }}
        >
          <input value={mate} onChange={(e) => setMate(e.target.value)} placeholder="Add a teammate" aria-label="Teammate name" />
          <button className="btn" disabled={!mate.trim()}>
            Add
          </button>
        </form>
      </Card>

      <Card title="Data">
        <p className="muted small">
          {records.length} visitor records ({demo} demo).{' '}
          {source === 'remote'
            ? 'Real visitors are stored on the server; demo data, notes and tags stay in this browser.'
            : 'The server API is not reachable, so only plays from this browser are shown.'}
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => downloadCsv(visitors)}>
            <Icon name="download" /> Export CSV
          </button>
          <button className="btn" onClick={() => save(`alive-crm-${stamp()}.json`, JSON.stringify({ records, crm }, null, 2), 'application/json')}>
            <Icon name="download" /> Export JSON
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            <Icon name="upload" /> Import JSON
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setMsg(`Imported ${a.importJson(await f.text())} records.`);
              } catch {
                setMsg('That file is not a valid export.');
              }
              e.target.value = '';
            }}
          />
        </div>
        {msg && <p className="small">{msg}</p>}
      </Card>

      <Card title="Demo data">
        <p className="muted small">Fill the panel with generated visitors to try it out. They are marked “demo” and can be removed in one click.</p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => a.seedDemo(60)}>
            <Icon name="sparkle" /> Add 60 demo visitors
          </button>
          <button className="btn" disabled={!demo} onClick={() => a.clearDemo()}>
            Remove demo data
          </button>
        </div>
      </Card>

      <Card title="Danger zone" className="danger-card">
        <p className="muted small">
          Delete every visitor record, note and activity entry
          {source === 'remote' ? ', including all records on the server.' : ' in this browser.'}
        </p>
        <button
          className="btn danger"
          disabled={!records.length}
          onClick={() => confirm('Delete all visitor data? This cannot be undone.') && a.clearAll()}
        >
          <Icon name="trash" /> Delete everything
        </button>
      </Card>
    </div>
  );
}
