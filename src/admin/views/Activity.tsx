import { useMemo, useState } from 'react';
import { STAGE_LABEL } from '../../store/records';
import { ENDING_LABEL, fmtAgo, fmtDate, useAdmin, Visitor } from '../store';
import { Avatar, Card, Empty, Icon, IconName } from '../ui';
import { openVisitor } from '../Admin';

type Kind = 'visit' | 'stage' | 'ending' | 'status' | 'note' | 'owner' | 'tag';
interface Event {
  key: string;
  t: number;
  v: Visitor;
  kind: Kind;
  text: string;
  author?: string;
}
const ICON: Record<Kind, IconName> = {
  visit: 'user',
  stage: 'flag',
  ending: 'sparkle',
  status: 'columns',
  note: 'note',
  owner: 'users',
  tag: 'tag',
};
const GROUPS: { id: 'all' | 'journey' | 'team'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'journey', label: 'Visitor journeys' },
  { id: 'team', label: 'Team actions' },
];

function useEvents(visitors: Visitor[]) {
  const activity = useAdmin((s) => s.crm.activity);
  return useMemo(() => {
    const byId = new Map(visitors.map((v) => [v.id, v]));
    const out: Event[] = [];
    for (const v of visitors) {
      for (const j of v.journey) {
        if (j.stage === 'intro') out.push({ key: `${v.id}-in`, t: v.startedAt, v, kind: 'visit', text: 'started a session' });
        else if (j.stage === 'ending' && v.ending)
          out.push({ key: `${v.id}-end`, t: v.startedAt + j.t * 1000, v, kind: 'ending', text: `chose the ending “${ENDING_LABEL[v.ending]}”` });
        else if (j.stage !== 'credits') out.push({ key: `${v.id}-${j.stage}-${j.t}`, t: v.startedAt + j.t * 1000, v, kind: 'stage', text: `reached ${STAGE_LABEL[j.stage]}` });
      }
    }
    for (const a of activity) {
      const v = byId.get(a.visitor);
      if (v) out.push({ key: a.id, t: a.t, v, kind: a.kind, text: a.kind === 'note' ? `note: “${a.text}”` : a.text, author: a.author });
    }
    return out.sort((a, b) => b.t - a.t);
  }, [visitors, activity]);
}

export function ActivityFeed({ visitors, limit, compact, group = 'all' }: { visitors: Visitor[]; limit?: number; compact?: boolean; group?: 'all' | 'journey' | 'team' }) {
  const all = useEvents(visitors);
  const events = all
    .filter((e) => group === 'all' || (group === 'team' ? !!e.author : !e.author))
    .slice(0, limit ?? 300);
  if (!events.length) return <p className="muted small">Nothing yet.</p>;
  return (
    <ol className={`feed ${compact ? 'is-compact' : ''}`}>
      {events.map((e) => (
        <li key={e.key} onClick={() => openVisitor(e.v.id)}>
          <span className={`feed-icon k-${e.kind}`}>
            <Icon name={ICON[e.kind]} size={13} />
          </span>
          <span className="feed-body">
            {e.author ? (
              <>
                <strong>{e.author}</strong> · <span className="mono">{e.v.code}</span> {e.text}
              </>
            ) : (
              <>
                <span className="mono strong">{e.v.code}</span> {e.text}
              </>
            )}
          </span>
          <time className="muted" title={fmtDate(e.t)}>
            {fmtAgo(e.t)}
          </time>
        </li>
      ))}
    </ol>
  );
}

export default function Activity({ visitors }: { visitors: Visitor[] }) {
  const [group, setGroup] = useState<'all' | 'journey' | 'team'>('all');
  if (!visitors.length) return <Empty>No activity yet.</Empty>;
  const live = visitors.filter((v) => v.live);
  return (
    <div className="activity">
      <Card
        title="Timeline"
        action={
          <div className="chips">
            {GROUPS.map((g) => (
              <button key={g.id} className={`chip ${group === g.id ? 'is-on' : ''}`} onClick={() => setGroup(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
        }
      >
        <ActivityFeed visitors={visitors} group={group} />
      </Card>
      <Card title="Live now">
        {live.length === 0 ? (
          <p className="muted small">Nobody is in the experience right now.</p>
        ) : (
          <ul className="live-list">
            {live.map((v) => (
              <li key={v.id} onClick={() => openVisitor(v.id)}>
                <Avatar v={v} size="sm" />
                <span className="mono">{v.code}</span>
                <span className="muted">{STAGE_LABEL[v.stage]}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
