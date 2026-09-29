import { useGame } from '../store/game';

/** A tiny animated favicon: a dot that becomes aware, then red, then gone. */
export function startFavicon() {
  const link = document.getElementById('favicon') as HTMLLinkElement | null;
  if (!link) return;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  let t = 0;
  setInterval(() => {
    t++;
    const stage = useGame.getState().stage;
    const hostile = ['typeattack', 'navboss', 'boss', 'eye', 'descent'].includes(stage);
    const aware = stage !== 'intro' && stage !== 'page';
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = '#080808';
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();
    if (stage === 'ending' || stage === 'credits') {
      ctx.fillStyle = '#F4F1EA';
      ctx.fillRect(15, 15, 2, 2);
    } else if (!aware) {
      ctx.fillStyle = '#F4F1EA';
      ctx.beginPath();
      ctx.arc(16, 16, 4 + Math.sin(t * 0.5) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // an eye that blinks
      const open = t % 12 === 0 ? 0.1 : 1;
      ctx.strokeStyle = hostile ? '#FF2E2E' : '#7C5CFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(16, 16, 12, 7 * open, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#F4F1EA';
      ctx.beginPath();
      ctx.arc(16, 16, 3 * open, 0, Math.PI * 2);
      ctx.fill();
    }
    link.href = c.toDataURL('image/png');
  }, 500);
}
