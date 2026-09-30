import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import App from './App';
import { initInput, tickInput } from './hooks/input';
import { world } from './scenes/world';
import { engine } from './gameplay/engine';
import { startFavicon } from './utils/favicon';
import { startRecorder } from './story/recorder';
import { device } from './utils/device';
import './styles/global.css';

gsap.registerPlugin(ScrollTrigger);
gsap.ticker.lagSmoothing(0);

initInput();
world.init(document.getElementById('gl') as HTMLCanvasElement);
engine.init(document.getElementById('game') as HTMLCanvasElement);
startFavicon();
startRecorder();

document.documentElement.classList.toggle('touch', device.touch);
document.documentElement.classList.toggle('low', device.low);
document.documentElement.classList.toggle('reduced', device.reducedMotion);

// one clock for everything
gsap.ticker.add((_t, deltaMs) => {
  const dt = Math.min(0.05, deltaMs / 1000);
  tickInput();
  world.update(dt);
  engine.update(dt);
});

createRoot(document.getElementById('root')!).render(<App />);

// dev only: ?jump=<scene> for QA, and a handle for inspection
if (import.meta.env.DEV) {
  const jump = new URLSearchParams(location.search).get('jump');
  import('./story/director').then(async (d) => {
    const { session } = await import('./store/session');
    const { useGame } = await import('./store/game');
    (window as any).__alive = { session, engine, world, game: useGame, director: d };
    if (jump) d.devJump(jump);
  });
}
