/**
 * Session memory. Everything here is generated inside this tab by the visitor's
 * interactions with the experience itself and lives in memory. A summary, with
 * the username, is reported to the server for the admin panel (story/recorder.ts).
 */
export const session = {
  start: performance.now(),
  username: '',
  cursorDistance: 0,
  totalClicks: 0,
  scrollDistance: 0,
  scrollDir: '—' as 'DOWN' | 'UP' | '—',
  longestStill: 0,
  hesitations: 0,
  firstDisobedience: null as number | null,
  firstWarningObeyed: null as boolean | null,
  dontClickPressed: false,
  dontClickDelay: 0,
  predictionHits: 0,
  predictionTotal: 0,
  chaseCaught: 0,
  navKillOrder: [] as string[],
  leftWindowDuringLock: 0,
  glyphFound: false,
  deaths: 0,
  bossProgress: 0,
  endingChoice: null as null | 'delete' | 'live' | 'observer',
  /** sampled pointer path, normalised 0..1 pairs, ~12Hz, capped */
  path: [] as number[],
  secrets: new Set<string>(),
};

export const elapsed = () => (performance.now() - session.start) / 1000;

export const fmtClock = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function addSecret(id: string) {
  session.secrets.add(id);
}

export const SECRET_THRESHOLD = 3;
