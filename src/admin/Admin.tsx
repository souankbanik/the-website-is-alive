import { useEffect, useState } from 'react';
import { useAdmin, useVisitors } from './store';
import { Icon, IconName } from './ui';
import Dashboard from './views/Dashboard';
import Visitors from './views/Visitors';
import Pipeline from './views/Pipeline';
import Activity from './views/Activity';
import Settings from './views/Settings';
import VisitorDrawer from './views/VisitorDrawer';

export type View = 'dashboard' | 'visitors' | 'pipeline' | 'activity' | 'settings';
const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'visitors', label: 'Visitors', icon: 'users' },
  { id: 'pipeline', label: 'Pipeline', icon: 'columns' },
  { id: 'activity', label: 'Activity', icon: 'pulse' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

/** #/view or #/view/<visitorId> */
function parseHash() {
  const [, v, id] = location.hash.split('/');
  const view = (NAV.some((n) => n.id === v) ? v : 'dashboard') as View;
  return { view, id: id || null };
}

export function go(view: View, id?: string | null) {
  location.hash = `/${view}${id ? `/${id}` : ''}`;
}
export const openVisitor = (id: string) => go(parseHash().view, id);

export default function Admin() {
  const [route, setRoute] = useState(parseHash);
  const [search, setSearch] = useState('');
  const visitors = useVisitors();
  const reload = useAdmin((s) => s.reload);
  const me = useAdmin((s) => s.crm.me);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    addEventListener('hashchange', on);
    // keep "live" badges and durations fresh
    const id = setInterval(reload, 15000);
    return () => {
      removeEventListener('hashchange', on);
      clearInterval(id);
    };
  }, [reload]);

  const live = visitors.filter((v) => v.live).length;
  const open = route.id ? visitors.find((v) => v.id === route.id) : undefined;
  const title = NAV.find((n) => n.id === route.view)!.label;

  const onSearch = (q: string) => {
    setSearch(q);
    if (q && route.view !== 'visitors' && route.view !== 'pipeline') go('visitors');
  };

  return (
    <div className="crm">
      <aside className="side">
        <div className="brand">
          <span className="brand-dot" />
          <span>
            Alive <em>CRM</em>
          </span>
        </div>
        <nav className="side-nav">
          {NAV.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={route.view === n.id ? 'is-active' : ''}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.id === 'visitors' && <span className="side-count">{visitors.length}</span>}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="live-pill">
            <span className={`live-dot ${live ? 'is-on' : ''}`} />
            {live} live now
          </div>
          <a className="side-link" href="./" target="_blank" rel="noreferrer">
            <Icon name="external" /> Open the experience
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <h1>{title}</h1>
          <label className="search">
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search visitors, tags, notes…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </label>
          <div className="me" title="Signed in locally">
            <span className="avatar sm">{me.slice(0, 2).toUpperCase()}</span>
            <span className="me-name">{me}</span>
          </div>
        </header>

        <main className="content">
          {route.view === 'dashboard' && <Dashboard visitors={visitors} />}
          {route.view === 'visitors' && <Visitors visitors={visitors} search={search} />}
          {route.view === 'pipeline' && <Pipeline visitors={visitors} search={search} />}
          {route.view === 'activity' && <Activity visitors={visitors} />}
          {route.view === 'settings' && <Settings visitors={visitors} />}
        </main>
      </div>

      {open && <VisitorDrawer v={open} onClose={() => go(route.view)} />}
    </div>
  );
}
