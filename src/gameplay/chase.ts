import type { Level, Target } from './engine';
import { engine } from './engine';
import { pointer } from '../hooks/input';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';
import { session } from '../store/session';
import { game } from '../store/game';
import { COLOR, FONT } from '../utils/textures';
import { damp, TAU } from '../utils/math';

/**
 * The cursor chase. A second cursor, drawn exactly like yours, starts to
 * follow you. Then it starts predicting you.
 */
export class ChaseLevel implements Level {
  done = false;
  t = 0;
  dur = 20;
  x = -60;
  y = innerHeight * 0.5;
  vx = 0;
  vy = 0;
  rx = -60;
  ry = innerHeight * 0.5;
  cool = 0;
  alpha = 0;
  trail: { x: number; y: number }[] = [];
  lines = [
    [3, 'there are two of you now.'],
    [8, 'i can see where you are going.'],
    [14, 'you are slower than you think.'],
  ] as [number, string][];

  targets(): Target[] {
    return [];
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    while (this.lines.length && this.lines[0][0] <= t) game().say('observer', this.lines.shift()![1]);
    this.alpha += ((t < this.dur ? 1 : 0) - this.alpha) * damp(3, dt);
    if (t > this.dur + 1.2) {
      this.done = true;
      return;
    }
    if (t >= this.dur) return;
    const speed = Math.min(560, 170 + t * 22);
    // after a while it stops chasing where you are and aims where you will be
    const lead = t > 7 ? Math.min(14, (t - 7) * 1.6) : 0;
    const tx = pointer.x + pointer.vx * lead;
    const ty = pointer.y + pointer.vy * lead;
    const a = Math.atan2(ty - this.y, tx - this.x);
    this.vx += (Math.cos(a) * speed - this.vx) * damp(3.2, dt);
    this.vy += (Math.sin(a) * speed - this.vy) * damp(3.2, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rx += (this.x - this.rx) * damp(10, dt);
    this.ry += (this.y - this.ry) * damp(10, dt);
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 26) this.trail.shift();
    this.cool -= dt;
    if (this.cool <= 0 && Math.hypot(pointer.x - this.x, pointer.y - this.y) < 18) {
      this.cool = 1.4;
      session.chaseCaught++;
      game().show(session.chaseCaught === 1 ? 'GOT YOU.' : session.chaseCaught === 2 ? 'AGAIN.' : `${session.chaseCaught}.`, 'mono-red', 'low');
      setTimeout(() => game().hide(), 900);
      audio.glitch();
      world.glitch(0.4, 0.2);
      engine.spark(this.x, this.y, 20, COLOR.red, 300, 0.5);
      // it reappears on the far side
      this.x = pointer.x > innerWidth / 2 ? 40 : innerWidth - 40;
      this.y = pointer.y > innerHeight / 2 ? 40 : innerHeight - 40;
      this.vx = this.vy = 0;
      this.trail.length = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.alpha < 0.01) return;
    ctx.globalAlpha = this.alpha;
    ctx.strokeStyle = 'rgba(244,241,234,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.fillStyle = COLOR.text;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.t > 10 ? 'rgba(255,46,46,0.8)' : 'rgba(244,241,234,0.6)';
    ctx.beginPath();
    ctx.arc(this.rx, this.ry, 16, 0, TAU);
    ctx.stroke();
    if (this.t > 10) {
      ctx.font = `400 10px ${FONT.mono}`;
      ctx.fillStyle = COLOR.muted;
      ctx.textAlign = 'left';
      ctx.fillText('you?', this.x + 20, this.y + 20);
    }
    ctx.globalAlpha = 1;
  }
}
