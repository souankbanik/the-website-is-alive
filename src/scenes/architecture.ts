import * as THREE from 'three';
import gsap from 'gsap';
import { artPlane, buttonPlane, cardPlane, planeMesh, textPlane, COLOR } from '../utils/textures';
import { session, fmtClock, fmtInt } from '../store/session';

interface Piece {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  rot: THREE.Euler;
  spin: number;
  bob: number;
}

/**
 * The website, re-built as physical architecture in a void. Each plane is a
 * section of the page the visitor just scrolled through, rendered from the
 * same typography and the visitor's own session numbers.
 */
export class Architecture {
  group = new THREE.Group();
  pieces: Piece[] = [];
  private lines: THREE.LineSegments;
  private camT = 0;
  progress = 0; // 0 = still flat page, 1 = fully detached
  drift = 1;

  constructor() {
    const specs: { spec: ReturnType<typeof textPlane>; h: number; pos: [number, number, number]; rot: [number, number, number] }[] = [];
    const add = (spec: ReturnType<typeof textPlane>, h: number, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) =>
      specs.push({ spec, h, pos, rot });

    add(textPlane(['THE WEBSITE', 'IS ALIVE'], { size: 190 }), 3.6, [-1.5, 2.2, -6], [0.05, 0.35, -0.03]);
    add(textPlane(['EVERY INTERACTION', 'LEAVES A TRACE.'], { size: 150 }), 2.4, [6.5, -1.2, -12], [-0.1, -0.5, 0.04]);
    add(cardPlane('CURSOR MOVED', `${fmtInt(session.cursorDistance)} PX`, '02 — MEMORY'), 1.6, [-7, -2.6, -9], [0.1, 0.6, 0.05]);
    add(cardPlane('HESITATION', `${session.longestStill.toFixed(1)} SEC`), 1.6, [-4.2, -4.4, -14], [0.2, 0.3, -0.04]);
    add(
      cardPlane('FIRST DISOBEDIENCE', session.firstDisobedience != null ? fmtClock(session.firstDisobedience) : 'NONE'),
      1.6,
      [3.2, 4.2, -16],
      [-0.3, -0.2, 0.06],
    );
    add(buttonPlane('LEFT'), 0.7, [-3.4, -0.4, -3.5], [0.2, 0.5, 0.1]);
    add(buttonPlane('STAY'), 0.7, [0.2, -1.6, -4.5], [-0.2, 0.1, -0.05]);
    add(buttonPlane('RIGHT'), 0.7, [3.8, 0.5, -5], [0.1, -0.6, 0.08]);
    add(buttonPlane('DO NOT CLICK', false, COLOR.red), 1.1, [0.6, -3.6, -8], [0.3, -0.1, -0.1]);
    add(textPlane(['Why are you', 'still scrolling?'], { size: 130, italic: true, color: COLOR.muted }), 2, [-9, 3.4, -20], [0, 0.7, 0]);
    add(textPlane(['There is nothing below.'], { size: 110 }), 0.9, [9, 3, -22], [0, -0.7, 0]);
    add(artPlane(3), 3.4, [-10.5, -1, -24], [0, 0.8, 0.02]);
    add(artPlane(7), 2.6, [11, -3, -18], [0.1, -0.9, -0.03]);
    add(textPlane(['MOVE FREELY.'], { font: 'mono', size: 60, color: COLOR.muted }), 0.4, [1.6, 1.2, -2.5], [0, -0.2, 0]);
    add(textPlane(['I KNEW YOU WOULD.'], { font: 'mono', size: 60, color: COLOR.violet }), 0.4, [-2.2, 3.4, -10], [0, 0.3, 0]);
    add(textPlane(['01', 'OBSERVATION'], { font: 'mono', size: 60, color: COLOR.muted }), 0.8, [5, 5.5, -9], [0, -0.4, 0]);

    specs.forEach((s, i) => {
      const mesh = planeMesh(s.spec, s.h, 0);
      // start as a flat page column facing the camera
      mesh.position.set(0, -i * 1.6 + 3, -4);
      this.group.add(mesh);
      this.pieces.push({
        mesh,
        home: new THREE.Vector3(...s.pos),
        rot: new THREE.Euler(...s.rot),
        spin: (Math.random() - 0.5) * 0.08,
        bob: Math.random() * 6.28,
      });
    });

    // the page's hairline grid, extended infinitely into the void
    const n = 70;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 70;
      const z = -Math.random() * 60 - 4;
      const y0 = -40 + Math.random() * 10;
      pos.set([x, y0, z, x, y0 + 40 + Math.random() * 40, z], i * 6);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0, fog: true, depthWrite: false }),
    );
    this.group.add(this.lines);
  }

  /** the page detaches and becomes floating architecture */
  reveal(duration = 4.5) {
    this.pieces.forEach((p, i) => {
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      gsap.to(m, { opacity: 0.95, duration: 1.2, delay: i * 0.04, ease: 'power2.out' });
      gsap.to(p.mesh.position, { x: p.home.x, y: p.home.y, z: p.home.z, duration, delay: 0.3 + i * 0.05, ease: 'expo.inOut' });
      gsap.to(p.mesh.rotation, { x: p.rot.x, y: p.rot.y, z: p.rot.z, duration, delay: 0.3 + i * 0.05, ease: 'expo.inOut' });
    });
    gsap.to(this.lines.material as THREE.LineBasicMaterial, { opacity: 0.12, duration: 3, delay: 1.5 });
    gsap.to(this, { progress: 1, duration: duration + 0.5, ease: 'power2.inOut' });
  }

  dim(opacity: number, duration = 2) {
    this.pieces.forEach((p) => gsap.to(p.mesh.material as THREE.MeshBasicMaterial, { opacity, duration }));
  }

  update(dt: number, t: number, cam: THREE.PerspectiveCamera, look: THREE.Vector2) {
    this.camT += dt * this.drift;
    const pull = this.progress;
    // slow cinematic push and gentle orbit
    const r = 3 + pull * 5;
    cam.position.set(Math.sin(this.camT * 0.05) * r * 0.35 + look.x * 0.6, Math.sin(this.camT * 0.07) * 0.6 - look.y * 0.4, 2 + pull * 6);
    cam.lookAt(0, 0, -10);
    for (const p of this.pieces) {
      if (pull >= 1) {
        p.mesh.rotation.y += p.spin * dt;
        p.mesh.position.y += Math.sin(t * 0.4 + p.bob) * 0.0025;
      }
    }
  }

  dispose() {
    this.pieces.forEach((p) => {
      p.mesh.geometry.dispose();
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
    });
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
