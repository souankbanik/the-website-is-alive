import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { world } from '../scenes/world';
import { DESCENT_DEPTH } from '../scenes/descent';

export default function DescentHud() {
  const depth = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tick = () => {
      const d = world.descent?.depth ?? 0;
      if (depth.current) depth.current.textContent = String(Math.floor(d * 3.2)).padStart(4, '0');
      if (bar.current) bar.current.style.transform = `scaleY(${Math.min(1, d / DESCENT_DEPTH)})`;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  return (
    <>
      <div className="descent-hud">
        <div className="descent-track">
          <div className="descent-fill" ref={bar} />
        </div>
        <div className="mono descent-label">
          DEPTH <span ref={depth}>0000</span> M
        </div>
      </div>
      <div className="mono descent-hint">SCROLL TO FALL FASTER</div>
    </>
  );
}
