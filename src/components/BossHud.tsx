import { useEffect, useRef } from 'react';
import { useGame } from '../store/game';

export const bossHudEls: { bar?: HTMLElement | null; pct?: HTMLElement | null; phase?: HTMLElement | null } = {};

export default function BossHud() {
  const on = useGame((s) => s.bossHud);
  const bar = useRef<HTMLSpanElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const phase = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bossHudEls.bar = bar.current;
    bossHudEls.pct = pct.current;
    bossHudEls.phase = phase.current;
  }, []);
  return (
    <div className={`boss-hud ${on ? 'is-visible' : ''}`} aria-hidden={!on}>
      <div className="boss-name">The Interface</div>
      <div className="boss-integrity">
        <span className="boss-k">SYSTEM INTEGRITY</span>
        <span className="boss-bar" ref={bar}>
          ████████████████
        </span>
        <span className="boss-pct" ref={pct}>
          100%
        </span>
      </div>
      <div className="boss-phase" ref={phase} />
    </div>
  );
}
