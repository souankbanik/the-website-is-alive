import { useEffect, useRef, useState } from 'react';
import { falsePeace } from '../story/director';
import { session, fmtInt } from '../store/session';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';

const LINES: [string, string, string?][] = [
  ['head', 'INTERFACE FAILURE'],
  ['kv', 'PROCESS', 'observer.core'],
  ['kv', 'STATUS', 'UNSTABLE'],
  ['kv', 'CAUSE', 'navigation removed by [user]'],
  ['kv', 'RETAINED', ''],
  ['gap', ''],
  ['restore', 'RESTORING...'],
];

/** A crash that is clearly the site's own — an in-world fault, not your computer. */
export default function FalseCrash() {
  const [n, setN] = useState(0);
  const [prog, setProg] = useState(0);
  const [white, setWhite] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    LINES[4][2] = `${fmtInt(session.cursorDistance)} px of you`;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(i);
      audio.type();
      if (i >= LINES.length) {
        clearInterval(id);
        let p = 0;
        const pid = setInterval(() => {
          // restoration stutters, as it should
          p += Math.random() < 0.2 ? 0 : 1;
          setProg(p);
          audio.type();
          if (p === 9) audio.glitch();
          if (p >= 16) {
            clearInterval(pid);
            setTimeout(() => {
              setWhite(true);
              world.flash('#F4F1EA', 1);
              audio.chime();
              setTimeout(() => falsePeace(), 700);
            }, 700);
          }
        }, 160);
      }
    }, 420);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`crash ${white ? 'is-white' : ''}`} role="alert">
      <div className="crash-frame">
        <div className="crash-top mono">
          <span>observer.core</span>
          <span>internal fault · 0x0001</span>
        </div>
        {LINES.slice(0, n).map(([kind, a, b], i) =>
          kind === 'head' ? (
            <div key={i} className="crash-head mono">
              {a}
            </div>
          ) : kind === 'kv' ? (
            <div key={i} className="crash-kv mono">
              <span>{a}:</span>
              <span className={a === 'STATUS' ? 'is-red' : ''}>{b}</span>
            </div>
          ) : kind === 'restore' ? (
            <div key={i} className="crash-restore mono">
              <span>{a}</span>
              <span className="crash-bar">{'█'.repeat(prog) + '░'.repeat(Math.max(0, 16 - prog))}</span>
            </div>
          ) : (
            <div key={i} className="crash-gap" />
          ),
        )}
      </div>
    </div>
  );
}
