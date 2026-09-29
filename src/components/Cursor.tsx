import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { pointer } from '../hooks/input';
import { useGame } from '../store/game';
import { device } from '../utils/device';

/** imperative cursor effects the story can trigger */
export const cursorFx = {
  driftStart: 0,
  driftX: 0,
  driftY: 0,
};

/** the cursor briefly moves on its own, then comes back */
export function driftCursor() {
  cursorFx.driftStart = performance.now();
  const a = Math.random() * Math.PI * 2;
  cursorFx.driftX = Math.cos(a) * 90;
  cursorFx.driftY = Math.sin(a) * 60;
}

const TRAIL = 7;

export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    if (device.touch) return;
    document.documentElement.classList.add('custom-cursor');
    let rx = pointer.x;
    let ry = pointer.y;
    let scale = 1;
    let hover: Element | null = null;
    const tpos = Array.from({ length: TRAIL }, () => ({ x: pointer.x, y: pointer.y }));

    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-magnetic], a, button');
      hover = el ?? null;
    };
    window.addEventListener('pointerover', over, { passive: true });

    const tick = () => {
      const mode = useGame.getState().cursorMode;
      const hidden = mode === 'hidden' || mode === 'game';
      let x = pointer.x;
      let y = pointer.y;
      const dt = performance.now() - cursorFx.driftStart;
      if (dt < 1100) {
        // drift away, hesitate, snap back
        const k = dt < 700 ? Math.sin((dt / 700) * Math.PI * 0.5) : 1 - (dt - 700) / 400;
        x += cursorFx.driftX * Math.max(0, k);
        y += cursorFx.driftY * Math.max(0, k);
      }
      const lag = mode === 'lag' ? 0.045 : 0.2;
      rx += (x - rx) * lag;
      ry += (y - ry) * lag;
      const targetScale = hover ? 2.3 : pointer.down ? 0.8 : 1;
      scale += (targetScale - scale) * 0.18;
      if (dot.current) {
        dot.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${hover ? 0.5 : 1})`;
        dot.current.style.opacity = hidden ? '0' : '1';
      }
      if (ring.current) {
        ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${scale})`;
        ring.current.style.opacity = hidden ? '0' : hover ? '0.9' : '0.55';
      }
      // a faint trail when the cursor starts misbehaving
      const showTrail = mode === 'lag' && !hidden;
      let px = x;
      let py = y;
      for (let i = 0; i < TRAIL; i++) {
        const tp = tpos[i];
        tp.x += (px - tp.x) * 0.35;
        tp.y += (py - tp.y) * 0.35;
        px = tp.x;
        py = tp.y;
        const el = trail.current[i];
        if (el) {
          el.style.transform = `translate3d(${tp.x}px, ${tp.y}px, 0)`;
          el.style.opacity = showTrail ? String((1 - i / TRAIL) * 0.35) : '0';
        }
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('pointerover', over);
    };
  }, []);

  if (device.touch) return null;
  return (
    <div className="cursor" aria-hidden="true">
      {Array.from({ length: TRAIL }, (_, i) => (
        <div key={i} className="cursor-trail" ref={(el) => void (el && (trail.current[i] = el))} />
      ))}
      <div className="cursor-ring" ref={ring} />
      <div className="cursor-dot" ref={dot} />
    </div>
  );
}
