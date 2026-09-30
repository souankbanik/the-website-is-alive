import { useGame } from '../store/game';
import { session, elapsed } from '../store/session';
import { newId, saveRecord, stageIndex, VisitorRecord } from '../store/records';
import { device } from '../utils/device';

/** Keeps one local visitor record in step with the run. See store/records.ts. */
export function startRecorder() {
  const id = newId();
  const rec: VisitorRecord = {
    id,
    code: `SUBJ-${id.slice(0, 4).toUpperCase()}`,
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

  const save = () => {
    rec.updatedAt = Date.now();
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
  };

  useGame.subscribe((s, prev) => {
    if (s.stage === prev.stage) return;
    rec.stage = s.stage;
    rec.journey.push({ stage: s.stage, t: Math.round(elapsed()) });
    if (stageIndex(s.stage) > stageIndex(rec.furthest)) rec.furthest = s.stage;
    save();
  });

  save();
  setInterval(save, 5000);
  addEventListener('pagehide', save);
}
