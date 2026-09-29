import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { engine } from '../../gameplay/engine';
import { pointer } from '../../hooks/input';
import { session, fmtInt } from '../../store/session';
import { game } from '../../store/game';

export default function Observation() {
  const root = useRef<HTMLElement>(null);
  const path = useRef<HTMLElement>(null);
  const pauses = useRef<HTMLElement>(null);
  const samples = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current!;
    let said = false;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 65%',
        end: 'bottom 35%',
        onToggle: (s) => {
          engine.ambient = s.isActive ? 'trace' : 'none';
          if (s.isActive && !said) {
            said = true;
            setTimeout(() => game().say('observer', 'movement pattern established.'), 1200);
          }
        },
      });
      // the heading condenses out of wide, faint type as you arrive
      gsap.fromTo(
        '.obs-title .tl',
        { letterSpacing: '0.18em', opacity: 0.08, filter: 'blur(6px)' },
        {
          letterSpacing: '-0.02em',
          opacity: 1,
          filter: 'blur(0px)',
          stagger: 0.15,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top 85%', end: 'top 25%', scrub: 0.6 },
        },
      );
      gsap.fromTo('.obs-body', { opacity: 0 }, { opacity: 1, scrollTrigger: { trigger: el, start: 'top 45%', end: 'top 20%', scrub: 0.6 } });
    }, el);

    const id = setInterval(() => {
      if (path.current) path.current.textContent = fmintOr(session.cursorDistance);
      if (pauses.current) pauses.current.textContent = String(pointer.pauses.length);
      if (samples.current) samples.current.textContent = fmtInt(session.path.length / 2);
    }, 120);
    return () => {
      ctx.revert();
      clearInterval(id);
    };
  }, []);

  return (
    <section className="sec obs" id="observation" ref={root}>
      <div className="sec-label mono">
        <span>01</span>
        <span>Observation</span>
      </div>
      <h2 className="display obs-title">
        <span className="tl">EVERY INTERACTION</span>
        <span className="tl">
          <em>LEAVES A TRACE.</em>
        </span>
      </h2>
      <div className="obs-grid obs-body">
        <p className="body">
          This page draws what you do. The faint line behind these words is the path your cursor has taken since you arrived. The circles are the moments you
          stopped.
        </p>
        <dl className="readout mono">
          <div>
            <dt>Path</dt>
            <dd>
              <b ref={path}>0</b> px
            </dd>
          </div>
          <div>
            <dt>Pauses</dt>
            <dd>
              <b ref={pauses}>0</b>
            </dd>
          </div>
          <div>
            <dt>Samples</dt>
            <dd>
              <b ref={samples}>0</b>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function fmintOr(n: number) {
  return fmtInt(n);
}
