import type { Stage } from './game';

/**
 * Visitor records. A snapshot of each run of the experience. It is kept in this
 * browser's localStorage and, once the visitor has entered a username, sent to
 * /api/track, where the server adds IP address and approximate location.
 */
export const REC_PREFIX = 'alive:v1:rec:';

export const STAGE_ORDER: Stage[] = [
  'intro',
  'page',
  'transform',
  'typeattack',
  'navboss',
  'crash',
  'peace',
  'descent',
  'eye',
  'boss',
  'final',
  'ending',
  'credits',
];

export const STAGE_LABEL: Record<Stage, string> = {
  intro: 'Intro',
  page: 'Landing page',
  transform: 'Transformation',
  typeattack: 'Type attack',
  navboss: 'Nav boss',
  crash: 'False crash',
  peace: 'False peace',
  descent: 'Descent',
  eye: 'The eye',
  boss: 'Interface boss',
  final: 'Final choice',
  ending: 'Ending',
  credits: 'Credits',
};

export type Ending = 'delete' | 'live' | 'observer';

/** added by the server (api/track.ts) from the request, never by the client */
export interface NetInfo {
  ip: string;
  lastIp?: string;
  country: string;
  region: string;
  city: string;
  lat: number | null;
  lon: number | null;
  timezone: string;
  ua: string;
  referrer: string;
}

export interface VisitorRecord {
  id: string;
  code: string;
  username?: string;
  /** document.referrer: the page the visitor came from */
  referrer?: string;
  net?: NetInfo;
  receivedAt?: number;
  startedAt: number;
  updatedAt: number;
  /** seconds */
  duration: number;
  stage: Stage;
  furthest: Stage;
  journey: { stage: Stage; t: number }[];
  ending: Ending | null;
  device: { touch: boolean; low: boolean; reduced: boolean; w: number; h: number; lang: string };
  metrics: {
    clicks: number;
    cursorDistance: number;
    scrollDistance: number;
    hesitations: number;
    longestStill: number;
    obeyedFirstWarning: boolean | null;
    dontClickPressed: boolean;
    predictionHits: number;
    predictionTotal: number;
    chaseCaught: number;
    deaths: number;
    bossProgress: number;
    leftWindowDuringLock: number;
  };
  secrets: string[];
  demo?: boolean;
}

export const stageIndex = (s: Stage) => STAGE_ORDER.indexOf(s);

export function saveRecord(r: VisitorRecord) {
  try {
    localStorage.setItem(REC_PREFIX + r.id, JSON.stringify(r));
  } catch {
    /* storage full or blocked: the experience must not care */
  }
}

export function loadRecords(): VisitorRecord[] {
  const out: VisitorRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(REC_PREFIX)) continue;
      try {
        out.push(JSON.parse(localStorage.getItem(k)!));
      } catch {
        /* skip a corrupt row */
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

export function deleteRecord(id: string) {
  try {
    localStorage.removeItem(REC_PREFIX + id);
  } catch {
    /* ignore */
  }
}

export function newId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
