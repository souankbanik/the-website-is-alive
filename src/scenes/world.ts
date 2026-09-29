import * as THREE from 'three';
import { device } from '../utils/device';
import { pointer } from '../hooks/input';
import { damp } from '../utils/math';
import { Architecture } from './architecture';
import { Descent } from './descent';
import { Entity } from './entity';

THREE.ColorManagement.enabled = false;

export type WorldMode = 'page' | 'void' | 'descent' | 'eye' | 'black';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Single screen-space pass: vignette, fine grain, chromatic split and a
 * band-displacement "tear" that is only non-zero during moments of lost control.
 */
const POST_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime, uAberr, uGlitch, uFlash, uFade, uVig;
uniform vec3 uFlashColor;
uniform vec2 uRes;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  if (uGlitch > 0.001) {
    float band = floor(uv.y * 28.0);
    float r = h(vec2(band, floor(uTime * 24.0)));
    if (r < uGlitch * 0.55) uv.x += (h(vec2(band, 7.0 + floor(uTime*24.0))) - 0.5) * 0.09 * uGlitch;
  }
  vec2 c = uv - 0.5;
  float d = length(c);
  float ab = uAberr * 0.004 + uGlitch * 0.012;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - c * ab).b;
  col *= 1.0 - smoothstep(0.3, 0.95, d) * uVig;
  col += (h(uv * uRes + fract(uTime) * 91.0) - 0.5) * 0.03;
  col = mix(col, uFlashColor, uFlash);
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

const DUST_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uSize, uPix;
varying float vA;
void main(){
  vec3 p = position;
  p.y += sin(uTime * 0.12 + aSeed * 6.283) * 0.35;
  p.x += cos(uTime * 0.09 + aSeed * 3.1) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uPix * (0.4 + aSeed) / -mv.z;
  vA = smoothstep(46.0, 3.0, -mv.z) * (0.25 + 0.75 * aSeed);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, a * vA * uOpacity);
}`;

class World {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private rt!: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.Camera();
  post!: THREE.ShaderMaterial;
  dust!: THREE.Points;
  dustMat!: THREE.ShaderMaterial;
  arch: Architecture | null = null;
  descent: Descent | null = null;
  entity: Entity | null = null;
  mode: WorldMode = 'page';
  private shakeAmt = 0;
  private glitchT = 0;
  private glitchAmt = 0;
  baseAberr = 0;
  roll = 0;
  rollTarget = 0;
  paused = false;
  camBase = new THREE.Vector3(0, 0, 6);
  private look = new THREE.Vector2();
  time = 0;
  ready = false;

  init(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x080808, 1);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, samples: device.low ? 0 : 2 });
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uTime: { value: 0 },
        uAberr: { value: 0 },
        uGlitch: { value: 0 },
        uFlash: { value: 0 },
        uFade: { value: 1 },
        uVig: { value: 0.55 },
        uFlashColor: { value: new THREE.Color('#F4F1EA') },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.scene.fog = new THREE.FogExp2(0x080808, 0.02);
    this.buildDust();
    this.camera.position.copy(this.camBase);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.ready = true;
  }

  private buildDust() {
    const n = device.low ? 700 : 1600;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = -Math.random() * 45 + 4;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 40 },
        uPix: { value: device.dpr },
        uColor: { value: new THREE.Color('#F4F1EA') },
        uOpacity: { value: 0.55 },
      },
    });
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = device.dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.rt.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.uniforms.uRes.value.set(w, h);
  }

  setMode(m: WorldMode) {
    this.mode = m;
    if (this.arch) this.arch.group.visible = m === 'void';
    if (this.descent) this.descent.group.visible = m === 'descent';
    if (this.entity) this.entity.group.visible = m === 'eye';
    this.dust.visible = m !== 'black';
    if (m === 'descent') this.scene.fog = new THREE.FogExp2(0x080808, 0.045);
    else if (m === 'eye') this.scene.fog = null;
    else this.scene.fog = new THREE.FogExp2(0x080808, 0.02);
  }

  ensureArch() {
    if (!this.arch) {
      this.arch = new Architecture();
      this.scene.add(this.arch.group);
      this.arch.group.visible = this.mode === 'void';
    }
    return this.arch;
  }
  ensureDescent() {
    if (!this.descent) {
      this.descent = new Descent();
      this.scene.add(this.descent.group);
      this.descent.group.visible = this.mode === 'descent';
    }
    return this.descent;
  }
  ensureEntity() {
    if (!this.entity) {
      this.entity = new Entity();
      this.scene.add(this.entity.group);
      this.entity.group.visible = this.mode === 'eye';
    }
    return this.entity;
  }
  disposeArch() {
    if (!this.arch) return;
    this.scene.remove(this.arch.group);
    this.arch.dispose();
    this.arch = null;
  }
  disposeDescent() {
    if (!this.descent) return;
    this.scene.remove(this.descent.group);
    this.descent.dispose();
    this.descent = null;
  }

  shake(amount: number) {
    if (device.reducedMotion) amount *= 0.2;
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }
  glitch(amount: number, seconds = 0.35) {
    this.glitchAmt = Math.max(this.glitchAmt, amount);
    this.glitchT = Math.max(this.glitchT, seconds);
  }
  flash(color: string, amount = 0.6) {
    this.post.uniforms.uFlashColor.value.set(color);
    this.post.uniforms.uFlash.value = amount;
  }
  set fade(v: number) {
    this.post.uniforms.uFade.value = v;
  }
  get fade() {
    return this.post.uniforms.uFade.value;
  }

  /** screen px -> world point on the plane z=0 */
  screenToWorld(x: number, y: number, z = 0) {
    const v = new THREE.Vector3((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5);
    v.unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const t = (z - this.camera.position.z) / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(t));
  }
  worldToScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  update(dt: number) {
    if (!this.ready) return;
    if (this.paused) dt = 0;
    this.time += dt;
    const t = this.time;
    const nx = (pointer.x / window.innerWidth) * 2 - 1;
    const ny = (pointer.y / window.innerHeight) * 2 - 1;
    this.look.x += (nx - this.look.x) * damp(3, dt);
    this.look.y += (ny - this.look.y) * damp(3, dt);

    this.dustMat.uniforms.uTime.value = t;

    if (this.mode === 'page') {
      this.camera.position.set(this.camBase.x + this.look.x * 0.35, this.camBase.y - this.look.y * 0.22, this.camBase.z);
      this.camera.lookAt(0, 0, -10);
    } else if (this.mode === 'void' && this.arch) {
      this.arch.update(dt, t, this.camera, this.look);
    } else if (this.mode === 'descent' && this.descent) {
      this.descent.update(dt, t, this.camera, this.look);
      this.dust.position.y = this.camera.position.y;
    } else if (this.mode === 'eye' && this.entity) {
      this.entity.update(dt, t, this.camera, this.look);
    }

    // controlled roll (boss phase 3)
    this.roll += (this.rollTarget - this.roll) * damp(2.2, dt);
    this.camera.rotateZ(this.roll);

    // impact shake: decays fast, never constant
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.exp(-dt * 9);
    }

    const u = this.post.uniforms;
    u.uTime.value = t;
    if (this.glitchT > 0) {
      this.glitchT -= dt;
      u.uGlitch.value = this.glitchAmt;
      if (this.glitchT <= 0) this.glitchAmt = 0;
    } else u.uGlitch.value = 0;
    u.uAberr.value += (this.baseAberr + this.shakeAmt * 2 - u.uAberr.value) * damp(8, dt);
    u.uFlash.value *= Math.exp(-dt * 4);

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}

export const world = new World();
