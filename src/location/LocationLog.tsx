import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VisitorRecord } from '../store/records';

/**
 * /location - a plain log of every visit: when, from which IP, where, on what
 * device, and from which page. Reads /api/visitors with the admin password
 * (shared with /admin.html for the browser session).
 */
const TOKEN_KEY = 'alive:admin-token';
const REFRESH_MS = 15000;

const read = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};
const write = (t: string) => {
  try {
    t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

let regions: Intl.DisplayNames | null = null;
const country = (cc: string) => {
  if (!cc) return '';
  try {
    regions ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regions.of(cc.toUpperCase()) || cc;
  } catch {
    return cc;
  }
};

function device(r: VisitorRecord) {
  const ua = r.net?.ua || '';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const kind = r.device.touch ? 'Mobile' : 'Desktop';
  return { main: [br, os].filter(Boolean).join(' on ') || kind, sub: `${kind} · ${r.device.w}×${r.device.h}` };
}

/** only ever link to plain web pages; the referrer comes from the visitor's browser */
const safeUrl = (url: string) => {
  try {
    return /^https?:$/.test(new URL(url).protocol) ? url : '';
  } catch {
    return '';
  }
};

function referrer(url: string) {
  if (!url) return 'Direct';
  try {
    const u = new URL(url);
    return u.host === location.host ? 'Direct' : u.host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const fmtTime = (t: number) =>
  new Date(t).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

type State = { kind: 'loading' } | { kind: 'login'; error?: string } | { kind: 'error'; error: string } | { kind: 'ok'; rows: VisitorRecord[]; at: number };

export default function LocationLog() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [pw, setPw] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async (tried?: boolean) => {
    let res: Response;
    try {
      res = await fetch('/api/visitors', { headers: { Authorization: `Bearer ${read()}` }, cache: 'no-store' });
    } catch {
      return setState({ kind: 'error', error: 'Could not reach the server.' });
    }
    if (res.status === 401) return setState({ kind: 'login', error: tried ? 'Wrong password.' : undefined });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return setState({ kind: 'error', error: data?.error || `The visitor API is not available (${res.status}).` });
    const rows = (data.records as VisitorRecord[]).sort((a, b) => b.startedAt - a.startedAt);
    setState({ kind: 'ok', rows, at: Date.now() });
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const rows = useMemo(() => {
    if (state.kind !== 'ok') return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return state.rows;
    return state.rows.filter((r) =>
      [r.username, r.net?.ip, r.net?.city, r.net?.region, r.net?.country, country(r.net?.country || ''), r.net?.referrer]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [state, q]);

  if (state.kind === 'loading') return <p className="loc-center">Loading…</p>;

  if (state.kind === 'login') {
    return (
      <form
        className="loc-login"
        onSubmit={(e) => {
          e.preventDefault();
          write(pw);
          load(true);
        }}
      >
        <h1>Visitor locations</h1>
        <p>This page lists IP addresses and locations. Enter the admin password.</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Admin password" autoFocus autoComplete="current-password" />
        {state.error && <p className="loc-error">{state.error}</p>}
        <button disabled={!pw}>Sign in</button>
      </form>
    );
  }

  if (state.kind === 'error') return <p className="loc-center loc-error">{state.error}</p>;

  const countries = new Set(state.rows.map((r) => r.net?.country).filter(Boolean)).size;

  return (
    <div className="loc">
      <header className="loc-head">
        <div>
          <h1>Visitor locations</h1>
          <p>
            {state.rows.length} visits from {countries} {countries === 1 ? 'country' : 'countries'} · updated{' '}
            {new Date(state.at).toLocaleTimeString()} · refreshes every {REFRESH_MS / 1000}s
          </p>
        </div>
        <div className="loc-actions">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by IP, city, country…" aria-label="Filter" />
          <a href="/admin.html">Admin</a>
          <button
            onClick={() => {
              write('');
              setState({ kind: 'login' });
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="loc-table-wrap">
        <table className="loc-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>IP address</th>
              <th>Location</th>
              <th>Device</th>
              <th>Referrer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const n = r.net;
              const d = device(r);
              return (
                <tr key={r.id}>
                  <td data-label="Time">
                    <span className="main">{fmtTime(r.startedAt)}</span>
                    {r.username && <span className="sub">{r.username}</span>}
                  </td>
                  <td data-label="IP address" className="mono">
                    {n?.ip || '—'}
                    {n?.lastIp && <span className="sub">then {n.lastIp}</span>}
                  </td>
                  <td data-label="Location">
                    {n && (n.city || n.country) ? (
                      <>
                        <span className="main">
                          {n.country && <span className="cc">{n.country}</span>}
                          {[n.city, n.region].filter(Boolean).join(', ') || country(n.country)}
                        </span>
                        <span className="sub">
                          {country(n.country)}
                          {n.lat != null && n.lon != null && (
                            <>
                              {' · '}
                              <a href={`https://www.openstreetmap.org/?mlat=${n.lat}&mlon=${n.lon}#map=10/${n.lat}/${n.lon}`} target="_blank" rel="noreferrer">
                                {n.lat.toFixed(2)}, {n.lon.toFixed(2)}
                              </a>
                            </>
                          )}
                        </span>
                      </>
                    ) : (
                      <span className="muted">Unknown</span>
                    )}
                  </td>
                  <td data-label="Device">
                    <span className="main">{d.main}</span>
                    <span className="sub">{d.sub}</span>
                  </td>
                  <td data-label="Referrer" className="ref">
                    {n?.referrer && referrer(n.referrer) !== 'Direct' ? (
                      safeUrl(n.referrer) ? (
                        <a href={safeUrl(n.referrer)} target="_blank" rel="noreferrer noopener">
                          {referrer(n.referrer)}
                        </a>
                      ) : (
                        <span>{n.referrer}</span>
                      )
                    ) : (
                      <span className="muted">Direct</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="loc-empty">{q ? 'No visits match that filter.' : 'No visits recorded yet.'}</p>}
      </div>
    </div>
  );
}
