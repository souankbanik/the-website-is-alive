import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { game } from '../../store/game';
import { corruptScroll } from '../../story/director';
import { audio } from '../../audio/engine';
import { world } from '../../scenes/world';

export default function Corrupted() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current!;
    const ctx = gsap.context(() => {
      // each line resolves out of a smear, like the page focusing on you
      gsap.utils.toArray<HTMLElement>('.cor-line').forEach((line, i) => {
        gsap.fromTo(
          line,
          { opacity: 0, filter: 'blur(14px)', skewX: i === 2 ? 0 : -8, scale: i === 2 ? 1.35 : 1 },
          {
            opacity: 1,
            filter: 'blur(0px)',
            skewX: 0,
            scale: 1,
            ease: 'none',
            scrollTrigger: { trigger: line, start: 'top 90%', end: 'top 45%', scrub: 0.5 },
          },
        );
      });
      ScrollTrigger.create({
        trigger: '.cor-l1',
        start: 'top 60%',
        once: true,
        onEnter: () => game().say('observer', 'you are going the wrong way.'),
      });
      ScrollTrigger.create({
        trigger: '.cor-l2',
        start: 'top 60%',
        once: true,
        onEnter: () => {
          game().set({ cursorMode: 'lag' });
          game().say('observer', 'there is nothing below. i checked.');
          audio.whisper(0.05);
        },
      });
      ScrollTrigger.create({
        trigger: '.cor-l3',
        start: 'top 55%',
        once: true,
        onEnter: () => {
          world.glitch(0.25, 0.12);
          audio.glitch();
        },
      });
      ScrollTrigger.create({
        trigger: '.cor-end',
        start: 'top 92%',
        once: true,
        onEnter: () => void corruptScroll(),
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section className="sec cor" id="corrupted" ref={root}>
      <div className="sec-label mono">
        <span>04</span>
        <span className="cor-label">— — —</span>
      </div>
      <p className="cor-line cor-l1 display">
        <em>Why are you still scrolling?</em>
      </p>
      <p className="cor-line cor-l2 display">There is nothing below.</p>
      <p className="cor-line cor-l3 display">Stop.</p>
      <div className="cor-end" />
    </section>
  );
}
