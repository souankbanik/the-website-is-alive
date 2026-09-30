import { useGame } from '../store/game';
import { session, elapsed } from '../store/session';
import { newId, saveRecord, stageIndex, VisitorRecord } from '../store/records';
import { device } from '../utils/device';

/** Report to the server; only once the visitor has entered with a username. */
function send(rec: VisitorRecord, leaving = false) {
  if (!rec.username) return;
  const body = JSON.stringify(rec);
  try {
    if (leaving && navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }));
    else fetch('/api/track', { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {
    /* never let reporting break the experience */
  }
}

/** Keeps one visitor record in step with the run. See store/records.ts. */
export function startRecorder() {
  const id = newId();
  const rec: VisitorRecord = {
    id,
    code: `SUBJ-${id.slice(0, 4).toUpperCase()}`,
    referrer: document.referrer.slice(0, 300),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    duration: 0,
    stage: useGame.getState().stage,
    furthest: useGame.getState().stage,
    journey: [{ stage: useGame.getState().stage, t: 0 }],
    ending: null,
    device: {
      touch: device.touch,
      low: device.low,
      reduced: device.reducedMotion,
      w: innerWidth,
      h: innerHeight,
      lang: navigator.language || '',
    },
    metrics: {} as VisitorRecord['metrics'],
    secrets: [],
  };

  let lastSent = 0;
  const save = (opts: { report?: boolean; leaving?: boolean } = {}) => {
    rec.updatedAt = Date.now();
    rec.username = session.username || undefined;
    rec.duration = Math.round(elapsed());
    rec.ending = session.endingChoice;
    rec.secrets = [...session.secrets];
    rec.metrics = {
      clicks: session.totalClicks,
      cursorDistance: Math.round(session.cursorDistance),
      scrollDistance: Math.round(session.scrollDistance),
      hesitations: session.hesitations,
      longestStill: Math.round(session.longestStill * 10) / 10,
      obeyedFirstWarning: session.firstWarningObeyed,
      dontClickPressed: session.dontClickPressed,
      predictionHits: session.predictionHits,
      predictionTotal: session.predictionTotal,
      chaseCaught: session.chaseCaught,
      deaths: session.deaths,
      bossProgress: Math.round(session.bossProgress),
      leftWindowDuringLock: session.leftWindowDuringLock,
    };
    saveRecord(rec);
    if (opts.report || opts.leaving || Date.now() - lastSent > 15000) {
      lastSent = Date.now();
      send(rec, opts.leaving);
    }
  };

  useGame.subscribe((s, prev) => {
    if (s.stage === prev.stage) return;
    rec.stage = s.stage;
    rec.journey.push({ stage: s.stage, t: Math.round(elapsed()) });
    if (stageIndex(s.stage) > stageIndex(rec.furthest)) rec.furthest = s.stage;
    save({ report: true });
  });

  save();
  setInterval(() => save(), 5000);
  addEventListener('pagehide', () => save({ leaving: true }));
}
