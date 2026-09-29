import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { pointer } from '../../hooks/input';
import { firstCursorMoment } from '../../story/director';
import { device } from '../../utils/device';

const chars = (s: string) =>
  s.split('').map((c, i) => (
    <span className="char-mask" key={i}>
      <span className="char">{c === ' ' ? '\u00A0' : c}</span>
    </span>
  ));

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const l1 = useRef<HTMLSpanElement>(null);
  const l2 = useRef<HTMLSpanElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = root.current!;
    const ctx = gsap.context(() => {
      gsap.set('.char', { yPercent: 118, rotate: 8 });
      const tl = gsap.timeline({ delay: 0.35 });
      tl.to('.l1 .char', { yPercent: 0, rotate: 0, duration: 1.7, ease: 'expo.out', stagger: 0.04 })
        .to('.l2 .char', { yPercent: 0, rotate: 0, duration: 1.7, ease: 'expo.out', stagger: 0.045 }, '-=1.45')
        .fromTo('.hero-rule', { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: 'expo.inOut' }, '-=1.3')
        .fromTo('.hero-reveal', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12 }, '-=1.1');
    }, el);

    // soft depth parallax: the two lines sit at different distances
    let x = 0;
    let y = 0;
    const tick = () => {
      if (device.reducedMotion) return;
      const nx = pointer.x / innerWidth - 0.5;
      const ny = pointer.y / innerHeight - 0.5;
      x += (nx - x) * 0.06;
      y += (ny - y) * 0.06;
      if (l1.current) l1.current.style.transform = `translate3d(${x * -18}px, ${y * -10}px, 0)`;
      if (l2.current) l2.current.style.transform = `translate3d(${x * -38}px, ${y * -18}px, 0)`;
      if (title.current) title.current.style.transform = `perspective(1400px) rotateY(${x * 5}deg) rotateX(${y * -4}deg)`;
    };
    gsap.ticker.add(tick);

    const warn = setTimeout(() => void firstCursorMoment(), 8200);
    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
      clearTimeout(warn);
    };
  }, []);

  return (
    <section className="hero" id="hero" ref={root}>
      <div className="hero-top mono hero-reveal">
        <span>00 — Entry</span>
        <span>An experiment in attention</span>
        <span>N° 001</span>
      </div>
      <h1 className="hero-title display" ref={title} aria-label="The website is alive">
        <span className="line l1" ref={l1} aria-hidden="true">
          {chars('THE WEBSITE')}
        </span>
        <span className="line l2" ref={l2} aria-hidden="true">
          <em>{chars('IS ALIVE')}</em>
        </span>
      </h1>
      <div className="hero-rule" />
      <div className="hero-bottom">
        <p className="hero-sub hero-reveal">An interactive experience</p>
        <p className="hero-meta mono hero-reveal">MOVE FREELY.</p>
        <div className="scroll-cue hero-reveal" aria-hidden="true">
          <span className="mono">Scroll</span>
          <i />
        </div>
      </div>
    </section>
  );
}
