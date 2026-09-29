import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { pointer } from '../hooks/input';
import { audio } from '../audio/engine';
import { tearPeace, descend } from '../story/director';
import { game } from '../store/game';
import { device } from '../utils/device';

const REMARKS = ['', 'almost.', 'a little further.', 'you are so close.'];

function Content({ lied, remark }: { lied: boolean; remark: string }) {
  return (
    <div className="peace-inner">
      <div className="peace-top mono">
        <span>06 — Exit</span>
        <span>All systems nominal</span>
      </div>
      <h2 className={`peace-title display ${lied ? 'is-lied' : ''}`}>{lied ? 'I LIED.' : 'You can leave now.'}</h2>
      <p className="peace-sub">Thank you for visiting. Your session ended normally.</p>
      <div className="peace-btn-slot">
        <button className="peace-btn" tabIndex={-1}>
          <span>EXIT EXPERIENCE</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="peace-remark mono">{remark}</p>
      <div className="peace-foot mono">
        <span>THE WEBSITE IS ALIVE</span>
        <span>© this session</span>
      </div>
    </div>
  );
}

/** Warm, white, quiet. The most dangerous room in the building. */
export default function FalsePeace() {
  const root = useRef<HTMLDivElement>(null);
  const [lied, setLied] = useState(false);
  const [remark, setRemark] = useState('');
  const pos = useRef({ x: 0, y: 0 });
  const tries = useRef(0);
  const cooldown = useRef(0);
  const ended = useRef(false);

  // a jagged vertical seam, identical on both halves
  const seam = useMemo(() => {
    const pts: [number, number][] = [];
    for (let y = 0; y <= 100; y += 4) pts.push([50 + (Math.random() - 0.5) * 2.2, y]);
    return pts;
  }, []);
  const leftClip = `polygon(0% 0%, ${seam.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 0% 100%)`;
  const rightClip = `polygon(${seam.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 100% 100%, 100% 0%)`;

  useEffect(() => {
    const el = root.current!;
    ['.peace-title', '.peace-sub', '.peace-btn-slot'].forEach((sel, i) =>
      gsap.fromTo(el.querySelectorAll(sel), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.6, ease: 'power3.out', delay: 0.6 + i * 0.25 }),
    );

    const tick = () => {
      if (ended.current) return;
      const btn = el.querySelector<HTMLElement>('.peace-btn');
      if (!btn) return;
      cooldown.current -= 1 / 60;
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(pointer.x - cx, pointer.y - cy);
      const reach = device.touch ? 90 : 120;
      if (d < reach && cooldown.current <= 0) evade(cx, cy);
    };
    const evade = (cx: number, cy: number) => {
      cooldown.current = 0.5;
      tries.current++;
      audio.hover();
      if (tries.current >= 5) return lie();
      setRemark(REMARKS[Math.min(tries.current - 1, REMARKS.length - 1)]);
      // it slowly moves away, a bit farther every time
      const away = Math.atan2(cy - pointer.y, cx - pointer.x) + (Math.random() - 0.5) * 0.9;
      const dist = 160 + tries.current * 90;
      const maxX = innerWidth / 2 - 160;
      const maxY = innerHeight / 2 - 80;
      pos.current.x = gsap.utils.clamp(-maxX, maxX, pos.current.x + Math.cos(away) * dist);
      pos.current.y = gsap.utils.clamp(-maxY * 0.6, maxY, pos.current.y + Math.sin(away) * dist);
      gsap.to(el.querySelectorAll('.peace-btn'), { x: pos.current.x, y: pos.current.y, duration: 0.9 + tries.current * 0.15, ease: 'power3.out' });
    };
    const lie = () => {
      ended.current = true;
      setRemark('');
      setLied(true);
      audio.freeze();
      gsap.to(el.querySelectorAll('.peace-btn'), { opacity: 0, duration: 0.3 });
      setTimeout(() => {
        audio.unfreeze(0.05);
        game().say('observer', 'there was never an exit.');
        tear();
      }, 1700);
    };
    const tear = () => {
      tearPeace();
      const crack = el.querySelector<SVGPolylineElement>('.peace-crack polyline');
      const tl = gsap.timeline({ onComplete: () => void descend() });
      if (crack) {
        const len = crack.getTotalLength?.() ?? 400;
        gsap.set(crack, { strokeDasharray: len, strokeDashoffset: len });
        gsap.set(el.querySelector('.peace-crack'), { opacity: 1 });
        tl.to(crack, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.in' });
      }
      tl.to(el.querySelector('.peace-half.left'), { xPercent: -62, rotate: -5, duration: 1.8, ease: 'power3.in' }, '+=0.25')
        .to(el.querySelector('.peace-half.right'), { xPercent: 62, rotate: 5, duration: 1.8, ease: 'power3.in' }, '<')
        .to(el.querySelector('.peace-crack'), { opacity: 0, duration: 0.3 }, '<');
    };
    gsap.ticker.add(tick);
    // if they never reach for the exit, it tells the truth anyway
    const idle = setTimeout(() => !ended.current && lie(), 26000);
    return () => {
      gsap.ticker.remove(tick);
      clearTimeout(idle);
    };
  }, []);

  return (
    <div className="peace" ref={root}>
      <div className="peace-half left" style={{ clipPath: leftClip }}>
        <Content lied={lied} remark={remark} />
      </div>
      <div className="peace-half right" style={{ clipPath: rightClip }}>
        <Content lied={lied} remark={remark} />
      </div>
      <svg className="peace-crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={seam.map(([x, y]) => `${x},${y}`).join(' ')} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
