import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { session, elapsed, fmtClock, fmtInt, SECRET_THRESHOLD } from '../store/session';
import { engine } from '../gameplay/engine';

const ENDING_NAME = { delete: 'A — DELETE', live: 'B — LET IT LIVE', observer: 'OBSERVER' } as const;

export default function Credits() {
  const roll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = roll.current!;
    const h = el.scrollHeight;
    const tween = gsap.fromTo(el, { y: innerHeight * 0.85 }, { y: -h + innerHeight * 0.45, duration: Math.max(28, h / 38), ease: 'none' });
    return () => void tween.kill();
  }, []);

  const stats: [string, string][] = [
    ['Cursor moved', `${fmtInt(session.cursorDistance)} px`],
    ['Clicks', fmtInt(session.totalClicks)],
    ['Hesitations', fmtInt(session.hesitations)],
    ['Predicted', session.predictionTotal ? `${session.predictionHits} / ${session.predictionTotal}` : '—'],
    ['Do not click', session.dontClickPressed ? `pressed after ${session.dontClickDelay.toFixed(1)} s` : 'never pressed'],
    ['Signal lost', `${session.deaths}×`],
    ['Highest combo', `x${engine.p.maxCombo}`],
    ['Time inside', fmtClock(elapsed())],
    ['Secrets', `${session.secrets.size} / 5`],
  ];

  return (
    <div className="credits">
      <div className="credits-roll" ref={roll}>
        <h2 className="display credits-title">
          THE WEBSITE
          <br />
          <em>IS ALIVE</em>
        </h2>
        <p className="mono credits-kicker">an interactive experience</p>
        <p className="mono credits-ending">ENDING {session.endingChoice ? ENDING_NAME[session.endingChoice] : '—'}</p>

        <div className="credits-block">
          <p className="mono credits-h">What it remembered</p>
          <dl className="credits-stats">
            {stats.map(([k, v]) => (
              <div key={k}>
                <dt className="mono">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="credits-fine mono">It has already started forgetting.</p>
        </div>

        <div className="credits-block">
          <p className="mono credits-h">Made of</p>
          <p className="credits-p">Typography — Instrument Serif, Inter, IBM Plex Mono</p>
          <p className="credits-p">Light — Three.js &amp; custom shaders</p>
          <p className="credits-p">Motion — GSAP, Lenis</p>
          <p className="credits-p">Sound — synthesised live, Web Audio</p>
          <p className="credits-p is-dim">No images. No recordings. No data leaves this tab.</p>
        </div>

        {session.endingChoice !== 'observer' && (
          <p className="credits-hint display">
            <em>{session.secrets.size >= SECRET_THRESHOLD ? 'You were close to something else.' : 'There is another ending. It watches how you behave.'}</em>
          </p>
        )}

        <p className="mono credits-last">Close the tab and it forgets you.</p>
      </div>
      <button className="credits-replay" onClick={() => location.reload()} data-magnetic>
        <span>Connect again</span>
        <span aria-hidden="true">↻</span>
      </button>
    </div>
  );
}
