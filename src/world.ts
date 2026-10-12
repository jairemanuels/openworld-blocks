import * as THREE from 'three';
import { B, IS_SOLID, RENDER_KIND } from './blocks';
import { CHUNK, HEIGHT, chunkKey, chunksInRadius, localIndex, worldToChunk, worldToLocal } from './coords';
import { buildPadded, meshChunk, type ChunkMesh, type MeshBuffers } from './mesher';
import { recordEdit, type EditMap } from './save';
import { TerrainGenerator } from './terrain';

interface Chunk {
  cx: number;
  cz: number;
  key: string;
  data: Uint8Array | null;
  version: number;
  meshedVersion: number;
  meshPending: boolean;
  group: THREE.Group | null;
}

const MAX_GEN_IN_FLIGHT = 6;
const MAX_MESH_IN_FLIGHT = 4;
const MAX_UPLOADS_PER_FRAME = 3;

export class World {
  readonly chunks = new Map<string, Chunk>();
  readonly root = new THREE.Group();
  renderDistance: number;
  dirtyEdits = false;
  private workers: Worker[] = [];
  private rr = 0;
  private genInFlight = 0;
  private meshInFlight = 0;
  private uploads: Array<{ cx: number; cz: number; version: number; mesh: ChunkMesh }> = [];
  private lastCenter = '';
  private fallbackGen: TerrainGenerator | null = null;

  constructor(
    scene: THREE.Scene,
    readonly seed: number,
    readonly edits: EditMap,
    private solidMat: THREE.Material,
    private waterMat: THREE.Material,
    renderDistance: number,
  ) {
    this.renderDistance = renderDistance;
    scene.add(this.root);
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.onWorkerMessage(e.data);
        this.workers.push(w);
      }
    } catch (err) {
      console.warn('Web Workers unavailable, generating on main thread', err);
      this.workers = [];
      this.fallbackGen = new TerrainGenerator(seed);
    }
  }

  get loadedCount() { return this.chunks.size; }
  get meshedCount() { let n = 0; for (const c of this.chunks.values()) if (c.group) n++; return n; }

  private post(msg: unknown, transfer: Transferable[] = []) {
    const w = this.workers[this.rr++ % this.workers.length];
    w.postMessage(msg, transfer);
  }

  private onWorkerMessage(msg: any) {
    if (msg.type === 'gen') {
      this.genInFlight--;
      if (msg.seed !== this.seed) return;
      const c = this.chunks.get(chunkKey(msg.cx, msg.cz));
      if (!c || c.data) return;
      this.acceptData(c, msg.data);
    } else if (msg.type === 'mesh') {
      this.meshInFlight--;
      this.uploads.push(msg);
    }
  }

  private acceptData(c: Chunk, data: Uint8Array) {
    const e = this.edits.get(c.key);
    if (e) for (const [i, id] of e) data[i] = id;
    c.data = data;
    c.version++;
  }

  /** Block id at a world position, or -1 if the chunk isn't loaded yet. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const { cx, cz } = worldToChunk(x, z);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.data) return -1;
    const { lx, lz } = worldToLocal(x, z);
    return c.data[localIndex(lx, Math.floor(y), lz)];
  }

  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b === -1 ? true : IS_SOLID[b] === 1;
  }

  isLoadedAt(x: number, z: number): boolean {
    const { cx, cz } = worldToChunk(x, z);
    const c = this.chunks.get(chunkKey(cx, cz));
    return !!c && !!c.data;
  }

  /** Change a block, record the edit and remesh affected chunks immediately. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= HEIGHT) return false;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const { cx, cz } = worldToChunk(x, z);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.data) return false;
    const { lx, lz } = worldToLocal(x, z);
    const i = localIndex(lx, y, lz);
    if (c.data[i] === id) return false;
    c.data[i] = id;
    recordEdit(this.edits, cx, cz, i, id);
    this.dirtyEdits = true;
    // Remove a flower that would float if the block below disappears
    if (id === B.AIR && y + 1 < HEIGHT && RENDER_KIND[c.data[localIndex(lx, y + 1, lz)]] === 'cross') {
      c.data[localIndex(lx, y + 1, lz)] = B.AIR;
      recordEdit(this.edits, cx, cz, localIndex(lx, y + 1, lz), B.AIR);
    }
    c.version++;
    this.remeshNow(c);
    const dxs = lx === 0 ? [-1] : lx === CHUNK - 1 ? [1] : [];
    const dzs = lz === 0 ? [-1] : lz === CHUNK - 1 ? [1] : [];
    const touch = (dx: number, dz: number) => {
      const n = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (n && n.data) { n.version++; this.remeshNow(n); }
    };
    for (const dx of dxs) touch(dx, 0);
    for (const dz of dzs) touch(0, dz);
    for (const dx of dxs) for (const dz of dzs) touch(dx, dz);
    return true;
  }

  private neighbours(c: Chunk): Array<Uint8Array | null> | null {
    const out: Array<Uint8Array | null> = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) { out.push(null); continue; }
        const n = this.chunks.get(chunkKey(c.cx + dx, c.cz + dz));
        if (!n || !n.data) return null;
        out.push(n.data);
      }
    return out;
  }

  private remeshNow(c: Chunk) {
    const nb = this.neighbours(c);
    if (!nb || !c.data) return;
    const mesh = meshChunk(buildPadded(c.data, nb));
    this.applyMesh(c, mesh);
    c.meshedVersion = c.version;
  }

  private makeGeometry(b: MeshBuffers): THREE.BufferGeometry | null {
    if (b.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(b.colors, 3));
    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
    g.computeBoundingSphere();
    return g;
  }

  private disposeGroup(c: Chunk) {
    if (!c.group) return;
    for (const m of c.group.children) (m as THREE.Mesh).geometry.dispose();
    this.root.remove(c.group);
    c.group = null;
  }

  private applyMesh(c: Chunk, mesh: ChunkMesh) {
    this.disposeGroup(c);
    const g = new THREE.Group();
    g.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
    const sg = this.makeGeometry(mesh.solid);
    if (sg) g.add(new THREE.Mesh(sg, this.solidMat));
    const wg = this.makeGeometry(mesh.water);
    if (wg) {
      const wm = new THREE.Mesh(wg, this.waterMat);
      wm.renderOrder = 1;
      g.add(wm);
    }
    g.matrixAutoUpdate = false;
    g.updateMatrix();
    this.root.add(g);
    c.group = g;
  }

  /** Load/unload chunks around the player and schedule generation + meshing. Call once per frame. */
  update(px: number, pz: number) {
    const { cx: pcx, cz: pcz } = worldToChunk(px, pz);
    const rd = this.renderDistance;
    const center = pcx + ',' + pcz + ',' + rd;
    const wanted = chunksInRadius(pcx, pcz, rd + 1);

    if (center !== this.lastCenter) {
      this.lastCenter = center;
      // Unload far chunks
      const limit = (rd + 2) * (rd + 2) + rd + 2;
      for (const [k, c] of this.chunks) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > limit) {
          this.disposeGroup(c);
          this.chunks.delete(k);
        }
      }
      for (const w of wanted) {
        const k = chunkKey(w.cx, w.cz);
        if (!this.chunks.has(k)) this.chunks.set(k, { cx: w.cx, cz: w.cz, key: k, data: null, version: 0, meshedVersion: -1, meshPending: false, group: null });
      }
    }

    // Generation requests (nearest first)
    for (const w of wanted) {
      if (this.workers.length && this.genInFlight >= MAX_GEN_IN_FLIGHT) break;
      const c = this.chunks.get(chunkKey(w.cx, w.cz));
      if (!c || c.data || (c as any).requested) continue;
      if (this.workers.length) {
        (c as any).requested = true;
        this.genInFlight++;
        this.post({ type: 'gen', seed: this.seed, cx: c.cx, cz: c.cz });
      } else {
        this.acceptData(c, this.fallbackGen!.generateChunk(c.cx, c.cz));
        break; // one per frame on the main thread
      }
    }

    // Mesh requests for chunks within render distance whose neighbours exist
    const meshR = rd * rd + rd;
    for (const w of wanted) {
      if (w.d2 > meshR) break;
      if (this.workers.length && this.meshInFlight >= MAX_MESH_IN_FLIGHT) break;
      const c = this.chunks.get(chunkKey(w.cx, w.cz));
      if (!c || !c.data || c.meshPending || c.meshedVersion === c.version) continue;
      const nb = this.neighbours(c);
      if (!nb) continue;
      const padded = buildPadded(c.data, nb);
      if (this.workers.length) {
        c.meshPending = true;
        this.meshInFlight++;
        this.post({ type: 'mesh', cx: c.cx, cz: c.cz, version: c.version, padded }, [padded.buffer]);
      } else {
        this.applyMesh(c, meshChunk(padded));
        c.meshedVersion = c.version;
        break;
      }
    }

    // Upload finished meshes (bounded per frame to keep the frame time flat)
    let n = 0;
    while (this.uploads.length && n < MAX_UPLOADS_PER_FRAME) {
      const u = this.uploads.shift()!;
      const c = this.chunks.get(chunkKey(u.cx, u.cz));
      if (!c) continue;
      c.meshPending = false;
      if (u.version !== c.version) continue; // stale, will be re-requested
      this.applyMesh(c, u.mesh);
      c.meshedVersion = u.version;
      n++;
    }
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const c of this.chunks.values()) this.disposeGroup(c);
    this.chunks.clear();
    this.root.parent?.remove(this.root);
  }
}
