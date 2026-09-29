import type Lenis from 'lenis';

/** shared handle to the smooth-scroll instance while the page exists */
export const scroller = {
  lenis: null as Lenis | null,
  /** when true the custom scrollbar stops telling the truth */
  rogue: false,
  /** wheel handler installed during the corrupted-scroll sequence */
  inverted: false,
};
