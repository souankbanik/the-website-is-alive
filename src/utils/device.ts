const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function detectLowPower() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 8;
  const small = Math.min(screen.width, screen.height) < 700;
  return cores <= 4 || mem <= 4 || (coarse && small);
}

export const device = {
  touch: coarse,
  reducedMotion: reduced,
  low: detectLowPower(),
  get dpr() {
    return Math.min(window.devicePixelRatio || 1, this.low ? 1 : 1.5);
  },
};
