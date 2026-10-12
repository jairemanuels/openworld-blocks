import * as THREE from 'three';
import { B, BLOCKS, IS_SOLID, RENDER_KIND, HOTBAR_DEFAULT } from './blocks';
import { createAtlasCanvas } from './atlas';
import { World } from './world';
import { Sky } from './sky';
import { raycastVoxels, type RayHit } from './raycast';
import { moveAndCollide, aabbOverlapsSolid, EYE_HEIGHT, PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from './physics';
import { saveWorld, type WorldState, type KVStorage } from './save';
import { hashSeed } from './rng';
import { TerrainGenerator } from './terrain';
import { worldToChunk } from './coords';
import type { Settings } from './settings';
import { playBreak, playPlace, playStep } from './sound';

const GRAVITY = 28;
const JUMP_V = 8.6;
const WALK = 4.4;
const SPRINT = 6.2;
const FLY = 11;
const FLY_SPRINT = 24;
const REACH = 6;
const DAY_SECONDS = 1200;
const AUTOSAVE_SECONDS = 5;

export interface GameHooks {
  onPauseChange(paused: boolean): void;
  onHotbarChange(slots: number[], selected: number): void;
  onDebug(text: string | null): void;
  onLoading(done: boolean, progress: number): void;
  onToast(msg: string): void;
  onFlyChange(flying: boolean): void;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly atlasCanvas: HTMLCanvasElement;
  private solidMat: THREE.MeshBasicMaterial;
  private waterMat: THREE.MeshBasicMaterial;
  private sky: Sky;
  private outline: THREE.LineSegments;

  world: World | null = null;
  state: WorldState | null = null;
  settings: Settings;
  private storage: KVStorage;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  flying = false;
  onGround = false;
  private settled = false;
  hotbar = [...HOTBAR_DEFAULT];
  selected = 0;
  paused = true;
  private keys = new Set<string>();
  private lastW = 0;
  private sprintLatched = false;
  private mouseDown: [boolean, boolean] = [false, false];
  private actionCooldown = 0;
  private target: RayHit | null = null;
  private saveTimer = 0;
  private stepTimer = 0;
  private frames = 0;
  private fpsTime = 0;
  private fps = 0;
  private last = performance.now();
  private running = false;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement, settings: Settings, storage: KVStorage, private hooks: GameHooks) {
    this.settings = settings;
    this.storage = storage;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.08, 1000);
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0x8ec8f2, 50, 100);

    this.atlasCanvas = createAtlasCanvas();
    const tex = new THREE.CanvasTexture(this.atlasCanvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.solidMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.FrontSide });
    // cross-shaped plants are emitted with both windings, so FrontSide is fine
    this.waterMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
    this.sky = new Sky(this.scene);

    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.75 }));
    this.outline.visible = false;
    this.scene.add(this.outline);

    window.addEventListener('resize', () => this.resize());
    this.bindInput();
  }

  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    if (this.world) this.world.renderDistance = s.renderDistance;
    if (!s.showFps) this.hooks.onDebug(null);
  }

  // ---------------------------------------------------------------- lifecycle
  start(state: WorldState) {
    this.stop();
    this.state = state;
    const seedNum = hashSeed(state.seed);
    this.world = new World(this.scene, seedNum, state.edits, this.solidMat, this.waterMat, this.settings.renderDistance);
    if (state.hotbar && state.hotbar.length === 9) this.hotbar = [...state.hotbar];
    else this.hotbar = [...HOTBAR_DEFAULT];
    this.selected = 0;
    if (state.player) {
      this.pos.set(state.player.x, state.player.y, state.player.z);
      this.yaw = state.player.yaw;
      this.pitch = state.player.pitch;
      this.flying = state.player.flying;
      this.settled = true;
    } else {
      const s = new TerrainGenerator(seedNum).findSpawn();
      this.pos.set(s.x, s.y, s.z);
      this.yaw = Math.PI * 0.25;
      this.pitch = -0.15;
      this.flying = false;
      this.settled = false;
    }
    this.vel.set(0, 0, 0);
    this.hooks.onHotbarChange(this.hotbar, this.selected);
    this.hooks.onFlyChange(this.flying);
    this.hooks.onLoading(false, 0);
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    if (this.world) {
      this.save();
      this.world.dispose();
      this.world = null;
    }
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.outline.visible = false;
  }

  save(): boolean {
    if (!this.state || !this.world) return false;
    this.state.player = { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, flying: this.flying };
    this.state.hotbar = [...this.hotbar];
    this.state.lastPlayed = Date.now();
    try {
      saveWorld(this.storage, this.state);
      this.world.dirtyEdits = false;
      return true;
    } catch (e) {
      console.warn('Save failed', e);
      this.hooks.onToast('Could not save (storage full or blocked)');
      return false;
    }
  }

  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    this.keys.clear();
    this.mouseDown = [false, false];
    this.hooks.onPauseChange(p);
  }

  requestLock() {
    const r = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
    if (r && typeof r.catch === 'function') r.catch(() => this.setPaused(false));
    // If pointer lock is unavailable we still let the player play (keyboard only + drag look)
    if (!this.canvas.requestPointerLock) this.setPaused(false);
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    document.addEventListener('pointerlockchange', () => {
      if (!this.running) return;
      this.setPaused(document.pointerLockElement !== this.canvas);
    });
    document.addEventListener('mousemove', (e) => {
      if (this.paused || document.pointerLockElement !== this.canvas) return;
      const s = 0.0022 * this.settings.sensitivity;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      this.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.pitch));
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.running) return;
      if (this.paused) { this.requestLock(); return; }
      if (e.button === 0) { this.mouseDown[0] = true; this.breakBlock(); this.actionCooldown = 0.25; }
      else if (e.button === 2) { this.mouseDown[1] = true; this.placeBlock(); this.actionCooldown = 0.25; }
      else if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown[0] = false;
      if (e.button === 2) this.mouseDown[1] = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (!this.running || this.paused) return;
      this.selectSlot((this.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9);
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (e.code === 'F3') { e.preventDefault(); this.settings.showFps = !this.settings.showFps; if (!this.settings.showFps) this.hooks.onDebug(null); return; }
      if (this.paused) return;
      if (e.target instanceof HTMLInputElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyW' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastW < 280) this.sprintLatched = true;
        this.lastW = now;
      }
      if (e.code === 'KeyF' && !e.repeat) {
        this.flying = !this.flying;
        this.vel.y = 0;
        this.hooks.onFlyChange(this.flying);
      }
      if (/^Digit[1-9]$/.test(e.code)) this.selectSlot(Number(e.code.slice(5)) - 1);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW') this.sprintLatched = false;
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('beforeunload', () => { if (this.running) this.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.running) this.save(); });
  }

  selectSlot(i: number) {
    this.selected = i;
    this.hooks.onHotbarChange(this.hotbar, this.selected);
  }

  setSlotBlock(id: number) {
    this.hotbar[this.selected] = id;
    this.hooks.onHotbarChange(this.hotbar, this.selected);
  }

  // Touch / external controls
  setKey(code: string, down: boolean) { if (down) this.keys.add(code); else this.keys.delete(code); }
  look(dx: number, dy: number) {
    this.yaw -= dx * 0.005 * this.settings.sensitivity;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.005 * this.settings.sensitivity));
  }
  toggleFly() { this.flying = !this.flying; this.vel.y = 0; this.hooks.onFlyChange(this.flying); }

  private targetable = (x: number, y: number, z: number) => {
    const b = this.world!.getBlock(x, y, z);
    return b > 0 && b !== B.WATER;
  };

  breakBlock() {
    const t = this.target;
    if (!t || !this.world) return;
    const id = this.world.getBlock(t.x, t.y, t.z);
    if (id <= 0 || !BLOCKS[id]?.breakable) return;
    if (this.world.setBlock(t.x, t.y, t.z, B.AIR)) {
      // let adjacent water flow into the hole (one step, keeps oceans tidy)
      const neigh = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
      if (neigh.some(([dx, dy, dz]) => this.world!.getBlock(t.x + dx, t.y + dy, t.z + dz) === B.WATER)) this.world.setBlock(t.x, t.y, t.z, B.WATER);
      playBreak();
    }
  }

  placeBlock() {
    const t = this.target;
    if (!t || !this.world) return;
    const id = this.hotbar[this.selected];
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const cur = this.world.getBlock(x, y, z);
    if (cur < 0 || !(cur === B.AIR || cur === B.WATER || RENDER_KIND[cur] === 'cross')) return;
    if (RENDER_KIND[id] === 'cross' && !IS_SOLID[this.world.getBlock(x, y - 1, z)]) return;
    if (IS_SOLID[id] && aabbOverlapsSolid({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, (bx, by, bz) => bx === x && by === y && bz === z)) return;
    if (this.world.setBlock(x, y, z, id)) playPlace();
  }

  pickBlock() {
    const t = this.target;
    if (!t || !this.world) return;
    const id = this.world.getBlock(t.x, t.y, t.z);
    if (id <= 0 || id === B.BEDROCK) return;
    const existing = this.hotbar.indexOf(id);
    if (existing >= 0) this.selectSlot(existing);
    else this.setSlotBlock(id);
  }

  // ---------------------------------------------------------------- simulation
  private physics(dt: number) {
    const w = this.world!;
    if (!w.isLoadedAt(this.pos.x, this.pos.z)) return; // wait for terrain
    const solid = (x: number, y: number, z: number) => w.isSolid(x, y, z);
    if (!this.settled) {
      let guard = 0;
      while (aabbOverlapsSolid(this.pos, solid) && guard++ < 128) this.pos.y += 1;
      this.settled = true;
    }
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    let wx = -sinY * fwd + cosY * strafe;
    let wz = -cosY * fwd - sinY * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
    const sprinting = fwd > 0 && (this.sprintLatched || k.has('ControlLeft') || (!this.flying && (k.has('ShiftLeft') || k.has('ShiftRight'))));
    const feet = w.getBlock(this.pos.x, this.pos.y + 0.2, this.pos.z);
    const body = w.getBlock(this.pos.x, this.pos.y + 0.9, this.pos.z);
    const inWater = feet === B.WATER || body === B.WATER;

    if (this.flying) {
      const sp = sprinting ? FLY_SPRINT : FLY;
      const up = (k.has('Space') ? 1 : 0) - (k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0);
      const a = Math.min(1, dt * 10);
      this.vel.x += (wx * sp - this.vel.x) * a;
      this.vel.z += (wz * sp - this.vel.z) * a;
      this.vel.y += (up * sp * 0.8 - this.vel.y) * a;
    } else {
      let sp = sprinting ? SPRINT : WALK;
      if (inWater) sp *= 0.55;
      const a = Math.min(1, dt * (this.onGround ? 14 : inWater ? 5 : 3.5));
      this.vel.x += (wx * sp - this.vel.x) * a;
      this.vel.z += (wz * sp - this.vel.z) * a;
      if (inWater) {
        this.vel.y -= GRAVITY * 0.25 * dt;
        this.vel.y = Math.max(this.vel.y, -3.5);
        if (k.has('Space')) this.vel.y = Math.min(this.vel.y + 30 * dt, 3.6);
      } else {
        this.vel.y -= GRAVITY * dt;
        this.vel.y = Math.max(this.vel.y, -60);
        if (k.has('Space') && this.onGround) this.vel.y = JUMP_V;
      }
    }

    const before = { x: this.pos.x, z: this.pos.z };
    const p = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    const r = moveAndCollide(p, { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt }, solid);
    // auto step-up while flying is unnecessary; walking jumps.
    this.onGround = r.hitY && this.vel.y < 0;
    if (r.hitY) this.vel.y = 0;
    if (r.hitX) this.vel.x = 0;
    if (r.hitZ) this.vel.z = 0;
    if (this.flying && this.onGround) { this.flying = false; this.hooks.onFlyChange(false); }
    this.pos.set(p.x, p.y, p.z);
    if (this.pos.y < -30) { this.pos.y = 120; this.vel.set(0, 0, 0); }

    if (this.onGround && !this.flying) {
      this.stepTimer += Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      if (this.stepTimer > 2.2) { this.stepTimer = 0; playStep(); }
    }

    const fovTarget = this.settings.fov + (sprinting && len > 0 ? 8 : 0);
    if (Math.abs(this.camera.fov - fovTarget) > 0.05) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
  }

  private loop = (now: number) => {
    if (!this.running || !this.world || !this.state) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const w = this.world;

    if (!this.paused) {
      this.physics(dt);
      this.state.time = (this.state.time + dt / DAY_SECONDS) % 1;
      this.actionCooldown -= dt;
      if (this.actionCooldown <= 0) {
        if (this.mouseDown[0]) { this.breakBlock(); this.actionCooldown = 0.22; }
        else if (this.mouseDown[1]) { this.placeBlock(); this.actionCooldown = 0.22; }
      }
    }

    w.update(this.pos.x, this.pos.z);

    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // Targeting
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const cp = this.camera.position;
    this.target = raycastVoxels(cp.x, cp.y, cp.z, dir.x, dir.y, dir.z, REACH, this.targetable);
    if (this.target) {
      this.outline.visible = true;
      this.outline.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else this.outline.visible = false;

    // Sky / light / fog
    const rdBlocks = this.settings.renderDistance * 16;
    const eye = w.getBlock(cp.x, cp.y, cp.z);
    this.sky.update(this.state.time, this.camera, this.scene, rdBlocks * 0.55, rdBlocks * 0.98, eye === B.WATER);
    this.solidMat.color.setScalar(this.sky.light);
    this.waterMat.color.setScalar(this.sky.light);
    this.camera.far = rdBlocks + 400;
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);

    // Loading overlay until the chunk under the player is meshed
    const loaded = w.isLoadedAt(this.pos.x, this.pos.z) && w.meshedCount > 0;
    this.hooks.onLoading(loaded, w.meshedCount);

    // FPS / debug
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
      if (this.settings.showFps) {
        const { cx, cz } = worldToChunk(this.pos.x, this.pos.z);
        const tod = (((this.state.time + 0.25) % 1) * 24);
        const hh = Math.floor(tod), mm = Math.floor((tod - hh) * 60);
        const look = this.target ? `${BLOCKS[w.getBlock(this.target.x, this.target.y, this.target.z)]?.name ?? '?'} @ ${this.target.x} ${this.target.y} ${this.target.z}` : '—';
        this.hooks.onDebug(
          `${this.fps} fps\n` +
          `xyz  ${this.pos.x.toFixed(1)} ${this.pos.y.toFixed(1)} ${this.pos.z.toFixed(1)}\n` +
          `chunk ${cx} ${cz}   loaded ${w.loadedCount} / meshed ${w.meshedCount}\n` +
          `time ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}   seed ${this.state.seed}\n` +
          `target ${look}\n` +
          `draw calls ${this.renderer.info.render.calls}  tris ${this.renderer.info.render.triangles}`,
        );
      }
    }

    // Autosave
    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.save();
    }
  };

  /** Snapshot for automated checks (exposed on window in main.ts). */
  debugInfo() {
    return {
      running: this.running,
      paused: this.paused,
      fps: this.fps,
      pos: this.pos.toArray(),
      loaded: this.world?.loadedCount ?? 0,
      meshed: this.world?.meshedCount ?? 0,
      triangles: this.renderer.info.render.triangles,
      seed: this.state?.seed,
      half: PLAYER_HALF_WIDTH,
      height: PLAYER_HEIGHT,
    };
  }
}
