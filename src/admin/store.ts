import { useMemo } from 'react';
import { create } from 'zustand';
import {
  deleteRecord,
  Ending,
  loadRecords,
  newId,
  REC_PREFIX,
  saveRecord,
  STAGE_LABEL,
  STAGE_ORDER,
  stageIndex,
  VisitorRecord,
} from '../store/records';

/**
 * CRM layer over the visitor records: status, owner, tags, notes, activity.
 * Stored beside the records in this browser's localStorage.
 */
const CRM_KEY = 'alive:v1:crm';

export type Status = 'new' | 'engaged' | 'qualified' | 'converted' | 'lost';
export const STATUSES: Status[] = ['new', 'engaged', 'qualified', 'converted', 'lost'];
export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  engaged: 'Engaged',
  qualified: 'Qualified',
  converted: 'Converted',
  lost: 'Lost',
};

export const ENDING_LABEL: Record<Ending, string> = {
  delete: 'Delete',
  live: 'Let it live',
  observer: 'Observer',
};

export interface Note {
  id: string;
  t: number;
  text: string;
  author: string;
}
export interface Meta {
  status?: Status;
  owner?: string;
  tags?: string[];
  notes?: Note[];
  starred?: boolean;
}
export interface CrmActivity {
  id: string;
  t: number;
  visitor: string;
  kind: 'status' | 'note' | 'owner' | 'tag';
  text: string;
  author: string;
}
interface CrmData {
  meta: Record<string, Meta>;
  activity: CrmActivity[];
  team: string[];
  me: string;
}

const emptyCrm = (): CrmData => ({ meta: {}, activity: [], team: ['Unassigned', 'Admin'], me: 'Admin' });

function loadCrm(): CrmData {
  try {
    const raw = localStorage.getItem(CRM_KEY);
    if (raw) return { ...emptyCrm(), ...JSON.parse(raw) };
  } catch {
    /* fall through */
  }
  return emptyCrm();
}
function saveCrm(c: CrmData) {
  try {
    localStorage.setItem(CRM_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** a run with no update for this long is no longer live */
const IDLE_MS = 2 * 60 * 1000;
export const isLive = (r: VisitorRecord) => Date.now() - r.updatedAt < IDLE_MS && !r.demo && r.stage !== 'credits';

/** status when nobody has set one by hand */
export function derivedStatus(r: VisitorRecord): Status {
  if (r.ending) return 'converted';
  const i = stageIndex(r.furthest);
  if (i >= stageIndex('descent')) return 'qualified';
  if (!isLive(r) && i <= stageIndex('page') && r.duration < 45) return 'lost';
  if (i >= stageIndex('page')) return 'engaged';
  return 'new';
}

/** engagement score, 0-100 */
export function leadScore(r: VisitorRecord) {
  const depth = (stageIndex(r.furthest) / (STAGE_ORDER.length - 1)) * 45;
  const time = Math.min(1, r.duration / 900) * 20;
  const secrets = Math.min(4, r.secrets.length) * 5;
  const ending = r.ending ? 10 : 0;
  const skill = r.metrics.predictionTotal ? (r.metrics.predictionHits / r.metrics.predictionTotal) * 5 : 0;
  return Math.round(Math.min(100, depth + time + secrets + ending + skill));
}

export interface Visitor extends VisitorRecord {
  status: Status;
  owner: string;
  tags: string[];
  notes: Note[];
  starred: boolean;
  score: number;
  live: boolean;
}

interface AdminState {
  records: VisitorRecord[];
  crm: CrmData;
  reload: () => void;
  setStatus: (ids: string[], s: Status) => void;
  setOwner: (ids: string[], owner: string) => void;
  addTag: (ids: string[], tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  addNote: (id: string, text: string) => void;
  deleteNote: (id: string, noteId: string) => void;
  toggleStar: (id: string) => void;
  remove: (ids: string[]) => void;
  addTeammate: (name: string) => void;
  removeTeammate: (name: string) => void;
  setMe: (name: string) => void;
  seedDemo: (n?: number) => void;
  clearDemo: () => void;
  clearAll: () => void;
  importJson: (json: string) => number;
}

export const useAdmin = create<AdminState>((set, get) => {
  const mutate = (fn: (c: CrmData) => void) => {
    const crm: CrmData = structuredClone(get().crm);
    fn(crm);
    crm.activity = crm.activity.slice(-2000);
    saveCrm(crm);
    set({ crm });
  };
  const log = (c: CrmData, visitor: string, kind: CrmActivity['kind'], text: string) =>
    c.activity.push({ id: newId(), t: Date.now(), visitor, kind, text, author: c.me });
  const meta = (c: CrmData, id: string) => (c.meta[id] ??= {});

  return {
    records: loadRecords(),
    crm: loadCrm(),
    reload: () => set({ records: loadRecords(), crm: loadCrm() }),

    setStatus: (ids, s) =>
      mutate((c) => {
        for (const id of ids) {
          meta(c, id).status = s;
          log(c, id, 'status', `moved to ${STATUS_LABEL[s]}`);
        }
      }),
    setOwner: (ids, owner) =>
      mutate((c) => {
        for (const id of ids) {
          meta(c, id).owner = owner;
          log(c, id, 'owner', owner === 'Unassigned' ? 'unassigned' : `assigned to ${owner}`);
        }
      }),
    addTag: (ids, tag) => {
      const t = tag.trim().toLowerCase();
      if (!t) return;
      mutate((c) => {
        for (const id of ids) {
          const m = meta(c, id);
          if (m.tags?.includes(t)) continue;
          m.tags = [...(m.tags ?? []), t];
          log(c, id, 'tag', `tagged #${t}`);
        }
      });
    },
    removeTag: (id, tag) =>
      mutate((c) => {
        const m = meta(c, id);
        m.tags = (m.tags ?? []).filter((x) => x !== tag);
      }),
    addNote: (id, text) => {
      if (!text.trim()) return;
      mutate((c) => {
        const m = meta(c, id);
        m.notes = [...(m.notes ?? []), { id: newId(), t: Date.now(), text: text.trim(), author: c.me }];
        log(c, id, 'note', text.trim());
      });
    },
    deleteNote: (id, noteId) =>
      mutate((c) => {
        const m = meta(c, id);
        m.notes = (m.notes ?? []).filter((n) => n.id !== noteId);
      }),
    toggleStar: (id) =>
      mutate((c) => {
        const m = meta(c, id);
        m.starred = !m.starred;
      }),
    remove: (ids) => {
      ids.forEach(deleteRecord);
      mutate((c) => {
        for (const id of ids) delete c.meta[id];
        c.activity = c.activity.filter((a) => !ids.includes(a.visitor));
      });
      set({ records: loadRecords() });
    },
    addTeammate: (name) =>
      mutate((c) => {
        const n = name.trim();
        if (n && !c.team.includes(n)) c.team.push(n);
      }),
    removeTeammate: (name) =>
      mutate((c) => {
        if (name === 'Unassigned') return;
        c.team = c.team.filter((x) => x !== name);
        if (c.me === name) c.me = c.team[1] ?? 'Unassigned';
      }),
    setMe: (name) => mutate((c) => void (c.me = name)),

    seedDemo: (n = 60) => {
      demoRecords(n, get().crm.team).forEach(saveRecord);
      set({ records: loadRecords() });
    },
    clearDemo: () => get().remove(get().records.filter((r) => r.demo).map((r) => r.id)),
    clearAll: () => {
      get().records.forEach((r) => deleteRecord(r.id));
      const crm = { ...emptyCrm(), team: get().crm.team, me: get().crm.me };
      saveCrm(crm);
      set({ records: [], crm });
    },
    importJson: (json) => {
      const data = JSON.parse(json) as { records?: VisitorRecord[]; crm?: Partial<CrmData> };
      const recs = (data.records ?? []).filter((r) => r && typeof r.id === 'string' && r.metrics && r.journey);
      recs.forEach(saveRecord);
      if (data.crm) {
        const crm = { ...get().crm, ...data.crm, meta: { ...get().crm.meta, ...data.crm.meta } };
        saveCrm(crm);
      }
      get().reload();
      return recs.length;
    },
  };
});

// other tabs (the experience itself) write records while the panel is open
addEventListener('storage', (e) => {
  if (e.key === null || e.key === CRM_KEY || e.key.startsWith(REC_PREFIX)) useAdmin.getState().reload();
});

export function joinVisitors(records: VisitorRecord[], crm: CrmData): Visitor[] {
  return records.map((r) => {
    const m = crm.meta[r.id] ?? {};
    return {
      ...r,
      status: m.status ?? derivedStatus(r),
      owner: m.owner ?? 'Unassigned',
      tags: m.tags ?? [],
      notes: m.notes ?? [],
      starred: !!m.starred,
      score: leadScore(r),
      live: isLive(r),
    };
  });
}

export function useVisitors() {
  const records = useAdmin((s) => s.records);
  const crm = useAdmin((s) => s.crm);
  return useMemo(() => joinVisitors(records, crm), [records, crm]);
}

// ───────────────────────── formatting ─────────────────────────
export const fmtDur = (s: number) => {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const fmtAgo = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
};
export const fmtDate = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const stageLabel = (s: VisitorRecord['stage']) => STAGE_LABEL[s];

// ───────────────────────── demo data ─────────────────────────
const SECRETS = ['still', 'edge', 'restraint', 'glyph', 'exit-first'];
const LANGS = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP', 'pt-BR', 'es-ES', 'hi-IN'];
const SIZES: [number, number, boolean][] = [
  [1440, 900, false],
  [1920, 1080, false],
  [1280, 720, false],
  [390, 844, true],
  [412, 915, true],
  [820, 1180, true],
];

function demoRecords(n: number, team: string[]): VisitorRecord[] {
  const rnd = Math.random;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const crm = loadCrm();
  const out: VisitorRecord[] = [];
  for (let i = 0; i < n; i++) {
    const id = newId();
    // most people leave early; a long tail reaches the end
    const reach = Math.min(STAGE_ORDER.length - 1, Math.floor(Math.pow(rnd(), 1.15) * STAGE_ORDER.length));
    const [w, h, touch] = pick(SIZES);
    const startedAt = Date.now() - Math.floor(rnd() * 21 * 86400000);
    const journey: VisitorRecord['journey'] = [];
    let t = 0;
    for (let s = 0; s <= reach; s++) {
      journey.push({ stage: STAGE_ORDER[s], t });
      t += Math.round(8 + rnd() * (s === 1 ? 140 : 70));
    }
    const ending: Ending | null =
      reach >= stageIndex('ending') ? pick<Ending>(['delete', 'delete', 'live', 'live', 'live', 'observer']) : null;
    const predictionTotal = reach >= 1 ? 3 + Math.floor(rnd() * 5) : 0;
    const secrets = SECRETS.filter(() => rnd() < 0.08 + reach * 0.03);
    if (ending === 'observer' && !secrets.includes('glyph')) secrets.push('glyph');
    out.push({
      id,
      code: `SUBJ-${id.slice(0, 4).toUpperCase()}`,
      startedAt,
      updatedAt: startedAt + t * 1000,
      duration: t,
      stage: STAGE_ORDER[reach],
      furthest: STAGE_ORDER[reach],
      journey,
      ending,
      device: { touch, low: touch && rnd() < 0.5, reduced: rnd() < 0.06, w, h, lang: pick(LANGS) },
      metrics: {
        clicks: Math.floor(rnd() * 40 + reach * 25),
        cursorDistance: touch ? 0 : Math.floor(rnd() * 20000 + reach * 9000),
        scrollDistance: Math.floor(rnd() * 8000 + (reach >= 1 ? 6000 : 0)),
        hesitations: Math.floor(rnd() * 12),
        longestStill: Math.round(rnd() * 180) / 10,
        obeyedFirstWarning: reach >= 1 ? rnd() < 0.3 : null,
        dontClickPressed: reach >= 2 ? rnd() < 0.72 : false,
        predictionHits: Math.floor(rnd() * (predictionTotal + 1)),
        predictionTotal,
        chaseCaught: reach >= 2 ? Math.floor(rnd() * 4) : 0,
        deaths: reach >= 3 ? Math.floor(rnd() * 6) : 0,
        bossProgress: reach > stageIndex('boss') ? 100 : reach === stageIndex('boss') ? Math.floor(rnd() * 90) : 0,
        leftWindowDuringLock: Math.floor(rnd() * 2),
      },
      secrets,
      demo: true,
    });
    // a few hand-worked leads so the pipeline has texture
    if (rnd() < 0.25) {
      crm.meta[id] = {
        owner: pick(team),
        tags: rnd() < 0.5 ? [pick(['speedrun', 'returning', 'streamer', 'bug-report', 'vip'])] : [],
        starred: rnd() < 0.15,
      };
    }
  }
  saveCrm(crm);
  useAdmin.setState({ crm });
  return out;
}
