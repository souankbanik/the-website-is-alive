import { useEffect, RefObject } from 'react';
import gsap from 'gsap';
import { pointer } from './input';
import { audio } from '../audio/engine';
import { device } from '../utils/device';

/**
 * Magnetic attraction: the element leans toward the cursor, its label leans
 * further, and it settles back with a soft overshoot when released.
 */
export function useMagnetic(ref: RefObject<HTMLElement | null>, strength = 0.35, radius = 90) {
  useEffect(() => {
    const el = ref.current;
    if (!el || device.touch) return;
    const inner = el.querySelector<HTMLElement>('[data-magnetic-inner]');
    let inside = false;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const near = Math.abs(dx) < r.width / 2 + radius && Math.abs(dy) < r.height / 2 + radius;
      if (near) {
        if (!inside) {
          inside = true;
          audio.magnet();
        }
        gsap.to(el, { x: dx * strength, y: dy * strength, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
        if (inner) gsap.to(inner, { x: dx * strength * 0.45, y: dy * strength * 0.45, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
        el.style.setProperty('--mx', `${((pointer.x - r.left) / r.width) * 100}%`);
        el.style.setProperty('--my', `${((pointer.y - r.top) / r.height) * 100}%`);
      } else if (inside) {
        inside = false;
        gsap.to(el, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
        if (inner) gsap.to(inner, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
      }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [ref, strength, radius]);
}

/** cards that lean toward the cursor */
export function useTilt(ref: RefObject<HTMLElement | null>, max = 6) {
  useEffect(() => {
    const el = ref.current;
    if (!el || device.touch || device.reducedMotion) return;
    const tick = () => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const nx = (pointer.x - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (pointer.y - (r.top + r.height / 2)) / (r.height / 2);
      const on = Math.abs(nx) < 1.4 && Math.abs(ny) < 1.4;
      gsap.to(el, {
        rotateY: on ? nx * max : 0,
        rotateX: on ? -ny * max : 0,
        duration: 0.8,
        ease: 'power3.out',
        overwrite: 'auto',
      });
      el.style.setProperty('--gx', `${(nx * 0.5 + 0.5) * 100}%`);
      el.style.setProperty('--gy', `${(ny * 0.5 + 0.5) * 100}%`);
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [ref, max]);
}
