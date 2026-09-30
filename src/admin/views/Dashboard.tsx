import { useMemo, useState } from 'react';
import { Ending, STAGE_LABEL, STAGE_ORDER, stageIndex } from '../../store/records';
import { ENDING_LABEL, fmtAgo, fmtDur, STATUSES, Visitor } from '../store';
import { Avatar, Card, countryName, displayName, Empty, Place, Score, StatusBadge } from '../ui';
import { go, openVisitor } from '../Admin';
import { ActivityFeed } from './Activity';
import { VisitorMap } from './MapView';

const DAY = 86400000;
const ENDINGS: Ending[] = ['delete', 'live', 'observer'];

export default function Dashboard({ visitors }: { visitors: Visitor[] }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const recent = visitors.filter((v) => now - v.startedAt < 7 * DAY).length;
    const prior = visitors.filter((v) => now - v.startedAt >= 7 * DAY && now - v.startedAt < 14 * DAY).length;
    const done = visitors.filter((v) => v.ending).length;
    const warned = visitors.filter((v) => v.metrics.obeyedFirstWarning !== null);
    const obeyed = warned.filter((v) => v.metrics.obeyedFirstWarning).length;
    const avg = visitors.length ? visitors.reduce((a, v) => a + v.duration, 0) / visitors.length : 0;
    return {
      total: visitors.length,
      recent,
      prior,
      completion: visitors.length ? done / visitors.length : 0,
      avg,
      obedience: warned.length ? obeyed / warned.length : null,
    };
  }, [visitors]);

  if (!visitors.length) {
    return (
      <Empty>
        <h3>No visitors yet</h3>
        <p>
          Records appear here as people play <a href="./">the experience</a> in this browser. You can also load demo data to
          explore the panel.
        </p>
        <button className="btn primary" onClick={() => go('settings')}>
          Go to settings
        </button>
      </Empty>
    );
  }

  const delta = stats.recent - stats.prior;
  const top = [...visitors].sort((a, b) => b.score - a.score).slice(0, 6);

  return (
    <div className="dash">
      <div className="kpis">
        <Kpi label="Visitors" value={stats.total.toLocaleString()} sub={`${stats.recent} this week ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last`} />
        <Kpi label="Completion rate" value={pct(stats.completion)} sub="reached an ending" />
        <Kpi label="Avg. session" value={fmtDur(Math.round(stats.avg))} sub="time in the experience" />
        <Kpi label="Obeyed first warning" value={stats.obedience === null ? '—' : pct(stats.obedience)} sub="kept the cursor still" />
      </div>

      <div className="dash-grid">
        <Card title="New visitors · last 14 days" className="span-2">
          <DailyChart visitors={visitors} />
        </Card>
        <Card title="Pipeline" action={<a className="link" href="#/pipeline">Open board →</a>}>
          <ul className="pipe-sum">
            {STATUSES.map((s) => {
              const n = visitors.filter((v) => v.status === s).length;
              return (
                <li key={s}>
                  <StatusBadge s={s} />
                  <span className="pipe-bar">
                    <span style={{ width: `${(n / visitors.length) * 100}%` }} />
                  </span>
                  <span className="num">{n}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Journey funnel" className="span-2">
          <Funnel visitors={visitors} />
        </Card>
        <Card title="Endings chosen">
          <Endings visitors={visitors} />
        </Card>

        <Card title="Top leads" action={<a className="link" href="#/visitors">All visitors →</a>} className="span-2">
          <table className="mini-table">
            <tbody>
              {top.map((v) => (
                <tr key={v.id} onClick={() => openVisitor(v.id)}>
                  <td>
                    <span className="who">
                      <Avatar v={v} size="sm" />
                      <span className="strong">{displayName(v)}</span>
                    </span>
                  </td>
                  <td>
                    <StatusBadge s={v.status} />
                  </td>
                  <td className="muted">
                    <Place net={v.net} />
                  </td>
                  <td className="muted">{STAGE_LABEL[v.furthest]}</td>
                  <td>
                    <Score n={v.score} />
                  </td>
                  <td className="muted right">{fmtAgo(v.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Recent activity" action={<a className="link" href="#/activity">View all →</a>}>
          <ActivityFeed visitors={visitors} limit={7} compact />
        </Card>

        <Card title="Where visitors are" action={<a className="link" href="#/map">Open map →</a>} className="span-2">
          <VisitorMap visitors={visitors} height={300} />
        </Card>
        <Card title="Top countries">
          <TopCountries visitors={visitors} />
        </Card>
      </div>
    </div>
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function TopCountries({ visitors }: { visitors: Visitor[] }) {
  const c = new Map<string, number>();
  for (const v of visitors) if (v.net?.country) c.set(v.net.country, (c.get(v.net.country) ?? 0) + 1);
  const rows = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!rows.length) return <p className="muted small">No location data yet. Locations come from the server, per visitor IP.</p>;
  return (
    <ul className="rank">
      {rows.map(([cc, n]) => (
        <li key={cc}>
          <span className="cc">{cc}</span>
          <span>{countryName(cc)}</span>
          <span className="rank-bar">
            <span style={{ width: `${(n / rows[0][1]) * 100}%` }} />
          </span>
          <span className="num">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function DailyChart({ visitors }: { visitors: Visitor[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const out = Array.from({ length: 14 }, (_, i) => {
      const t = start.getTime() - (13 - i) * DAY;
      return { t, n: 0, done: 0 };
    });
    for (const v of visitors) {
      const i = Math.floor((v.startedAt - out[0].t) / DAY);
      if (i >= 0 && i < 14) {
        out[i].n++;
        if (v.ending) out[i].done++;
      }
    }
    return out;
  }, [visitors]);
  const max = Math.max(4, ...days.map((d) => d.n));
  const ticks = [0, Math.round(max / 2), max];
  const W = 640;
  const H = 180;
  const bw = W / days.length;
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 -8 ${W + 28} ${H + 32}`} role="img" aria-label="New visitors per day, last 14 days">
        {ticks.map((t) => {
          const y = H - (t / max) * H;
          return (
            <g key={t}>
              <line x1={28} x2={W + 28} y1={y} y2={y} className="grid" />
              <text x={22} y={y + 4} className="tick" textAnchor="end">
                {t}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const h = (d.n / max) * H;
          const x = 28 + i * bw + 3;
          return (
            <g key={d.t} onMouseEnter={() => setHover(i)}>
              <rect x={28 + i * bw} y={0} width={bw} height={H} fill="transparent" />
              {d.n > 0 && <path d={roundTop(x, H - h, bw - 6, h, 4)} className={`bar ${hover === i ? 'is-hover' : ''}`} />}
              {(i % 2 === 1 || days.length < 8) && (
                <text x={x + (bw - 6) / 2} y={H + 17} className="tick" textAnchor="middle">
                  {new Date(d.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${((28 + (hover + 0.5) * bw) / (W + 28)) * 100}%` }}>
          <strong>{new Date(days[hover].t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
          <span>{days[hover].n} visitors</span>
          <span className="muted">{days[hover].done} reached an ending</span>
        </div>
      )}
    </div>
  );
}

/** bar with 4px rounded top, square at the baseline */
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Funnel({ visitors }: { visitors: Visitor[] }) {
  // the gameplay stages that matter commercially; everyone "reaches" intro
  const steps = STAGE_ORDER.filter((s) => s !== 'intro' && s !== 'credits');
  const rows = steps.map((s) => ({ s, n: visitors.filter((v) => stageIndex(v.furthest) >= stageIndex(s)).length }));
  const total = visitors.length;
  return (
    <ol className="funnel">
      {rows.map((r, i) => {
        const prev = i ? rows[i - 1].n : total;
        const drop = prev ? 1 - r.n / prev : 0;
        return (
          <li key={r.s} title={`${STAGE_LABEL[r.s]}: ${r.n} of ${total} visitors (${pct(r.n / total)})`}>
            <span className="f-label">{STAGE_LABEL[r.s]}</span>
            <span className="f-track">
              <span className="f-bar" style={{ width: `${(r.n / total) * 100}%` }} />
            </span>
            <span className="num">{r.n}</span>
            <span className="f-drop num">{drop > 0.005 ? `−${pct(drop)}` : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Endings({ visitors }: { visitors: Visitor[] }) {
  const done = visitors.filter((v) => v.ending);
  if (!done.length) return <p className="muted small">Nobody has reached an ending yet.</p>;
  return (
    <div className="endings">
      <div className="stack" role="img" aria-label="Share of each ending">
        {ENDINGS.map((e) => {
          const n = done.filter((v) => v.ending === e).length;
          return n ? <span key={e} className={`seg end-${e}`} style={{ flexGrow: n }} title={`${ENDING_LABEL[e]}: ${n}`} /> : null;
        })}
      </div>
      <ul className="legend">
        {ENDINGS.map((e) => {
          const n = done.filter((v) => v.ending === e).length;
          return (
            <li key={e}>
              <span className={`swatch end-${e}`} />
              <span>{ENDING_LABEL[e]}</span>
              <span className="num">{n}</span>
              <span className="muted num">{pct(n / done.length)}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        {done.length} of {visitors.length} visitors finished.
      </p>
    </div>
  );
}
