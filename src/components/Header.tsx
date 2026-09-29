import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGame, game } from '../store/game';
import { elapsed, fmtClock } from '../store/session';
import { pointer } from '../hooks/input';
import { audio } from '../audio/engine';
import { scroller } from '../utils/scroll';
import type { NavKind } from '../gameplay/navBoss';

export const navRefs: Partial<Record<NavKind, HTMLElement>> = {};

const LINKS: { kind: NavKind; target?: string }[] = [
  { kind: 'ABOUT', target: '#observation' },
  { kind: 'WORK', target: '#behavior' },
  { kind: 'CONTACT', target: '#memory' },
  { kind: 'EXIT' },
];

let exitTries = 0;
const EXIT_REPLIES = ['not yet.', 'you just got here.', 'i said not yet.', 'stop.'];

/** a link whose underline behaves like a plucked string */
function NavLink({ kind, target }: { kind: NavKind; target?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const path = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    navRefs[kind] = el;
    const state = { cx: 50, cy: 4 };
    const draw = () => path.current?.setAttribute('d', `M0 4 Q ${state.cx} ${state.cy} 100 4`);
    let hovering = false;
    const tick = () => {
      if (!hovering) return;
      const r = el.getBoundingClientRect();
      state.cx = Math.max(0, Math.min(100, ((pointer.x - r.left) / r.width) * 100));
      state.cy = 4 + Math.max(-4, Math.min(10, (pointer.y - r.bottom) * 0.6));
      draw();
    };
    const enter = () => {
      hovering = true;
      audio.hover();
      gsap.killTweensOf(state);
    };
    const leave = () => {
      hovering = false;
      gsap.to(state, { cx: 50, cy: 4, duration: 1.2, ease: 'elastic.out(1.2, 0.25)', onUpdate: draw });
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    gsap.ticker.add(tick);
    draw();
    return () => {
      gsap.ticker.remove(tick);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
    };
  }, [kind]);

  const onClick = () => {
    audio.click();
    if (target && scroller.lenis && !useGame.getState().scrollLocked) {
      scroller.lenis.scrollTo(target, { duration: 1.6 });
      return;
    }
    if (kind === 'EXIT') {
      game().say('observer', EXIT_REPLIES[Math.min(exitTries++, EXIT_REPLIES.length - 1)]);
    }
  };

  return (
    <button ref={ref} className={`nav-link nav-${kind.toLowerCase()}`} onClick={onClick}>
      <span>{kind}</span>
      <svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
        <path ref={path} d="M0 4 Q 50 4 100 4" />
      </svg>
    </button>
  );
}

export default function Header() {
  const visible = useGame((s) => s.headerVisible);
  const detached = useGame((s) => s.navDetached);
  const bossHud = useGame((s) => s.bossHud);
  const clock = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (clock.current) clock.current.textContent = fmtClock(elapsed());
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <header className={`site-header ${visible ? 'is-visible' : ''} ${detached ? 'is-detached' : ''}`}>
      <div className="brand">
        <span className="brand-dot" />
        <span>The Website Is Alive</span>
      </div>
      <div className={`session mono ${bossHud ? 'is-muted' : ''}`}>
        SESSION <span ref={clock}>00:00</span>
      </div>
      <nav className="nav">
        {LINKS.map((l) => (
          <NavLink key={l.kind} {...l} />
        ))}
      </nav>
    </header>
  );
}
