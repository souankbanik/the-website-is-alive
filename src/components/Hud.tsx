import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/game';
import { engine } from '../gameplay/engine';
import { device } from '../utils/device';

export default function Hud() {
  const hud = useGame((s) => s.hud);
  const energy = useRef<HTMLSpanElement>(null);
  const combo = useRef<HTMLSpanElement>(null);
  const signal = useRef<HTMLSpanElement>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    engine.hudEls = { energy: energy.current, combo: combo.current, signal: signal.current };
    if (hud) {
      setHint(true);
      const id = setTimeout(() => setHint(false), 9000);
      return () => clearTimeout(id);
    }
  }, [hud]);

  return (
    <div className={`hud ${hud ? 'is-visible' : ''}`} aria-hidden={!hud}>
      <div className="hud-row">
        <span className="hud-k">ENERGY</span>
        <span className="hud-v" ref={energy}>
          100%
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-k">COMBO</span>
        <span className="hud-v" ref={combo}>
          x0
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-k">SIGNAL</span>
        <span className="hud-v" ref={signal}>
          100%
        </span>
      </div>
      <div className={`hud-hint ${hint ? 'is-on' : ''}`}>
        {device.touch ? 'TAP — PULSE · HOLD — CHARGE · DOUBLE-TAP — DASH' : 'CLICK — PULSE · HOLD — CHARGE · SPACE — DASH'}
      </div>
    </div>
  );
}
