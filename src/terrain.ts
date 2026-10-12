import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import { B } from './blocks';
import { CHUNK, CHUNK_VOLUME, HEIGHT, SEA_LEVEL, localIndex } from './coords';
import { hash3, mulberry32 } from './rng';

export const SNOW_LINE = 92;
const TREE_CHANCE = 0.011;
const FLOWER_CHANCE = 0.018;
const BORDER = 3; // trees from neighbouring columns can reach into this chunk

export class TerrainGenerator {
  readonly seed: number;
  private cont: NoiseFunction2D;
  private hills: NoiseFunction2D;
  private detail: NoiseFunction2D;
  private mount: NoiseFunction2D;
  private forest: NoiseFunction2D;
  private caveA: NoiseFunction3D;
  private caveB: NoiseFunction3D;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const rnd = mulberry32(this.seed);
    this.cont = createNoise2D(rnd);
    this.hills = createNoise2D(rnd);
    this.detail = createNoise2D(rnd);
    this.mount = createNoise2D(rnd);
    this.forest = createNoise2D(rnd);
    this.caveA = createNoise3D(rnd);
    this.caveB = createNoise3D(rnd);
  }

  /** Surface height (y of the top solid block) for a world column. */
  heightAt(x: number, z: number): number {
    const c = this.cont(x / 720, z / 720) * 0.8 + this.cont(x / 260 + 31.7, z / 260 - 12.1) * 0.2;
    const hl = this.hills(x / 170, z / 170);
    const m = Math.max(0, this.mount(x / 420, z / 420) * 1.25 - 0.15) * Math.max(0, Math.min(1, c * 2 + 0.6));
    const d = this.detail(x / 38, z / 38);
    const h = SEA_LEVEL + 3 + c * 17 + hl * (4 + m * 14) + m * m * 52 + d * 2;
    return Math.max(4, Math.min(HEIGHT - 14, Math.floor(h)));
  }

  private isCave(x: number, y: number, z: number): boolean {
    const a = this.caveA(x / 30, y / 20, z / 30);
    if (a > 0.09 || a < -0.09) return false;
    const b = this.caveB(x / 30, y / 20, z / 30);
    return b < 0.09 && b > -0.09;
  }

  /** Generate the voxels of chunk (cx, cz). Pure and deterministic for a given seed. */
  generateChunk(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CHUNK_VOLUME);
    const W = CHUNK + BORDER * 2;
    const heights = new Int32Array(W * W);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (let bz = 0; bz < W; bz++) {
      for (let bx = 0; bx < W; bx++) {
        heights[bx + bz * W] = this.heightAt(x0 + bx - BORDER, z0 + bz - BORDER);
      }
    }

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = heights[lx + BORDER + (lz + BORDER) * W];
        const beach = h <= SEA_LEVEL + 1;
        const snowy = h >= SNOW_LINE + Math.floor(hash3(wx, 0, wz, this.seed) * 4);
        const top = Math.max(h, SEA_LEVEL);
        for (let y = 0; y <= top; y++) {
          let id: number;
          if (y === 0) id = B.BEDROCK;
          else if (y <= h) {
            const depth = h - y;
            if (beach) {
              id = depth < 3 ? (h < SEA_LEVEL - 6 && depth === 0 ? B.CLAY : B.SAND) : B.STONE;
            } else if (snowy) {
              id = depth === 0 ? B.SNOW : B.STONE;
            } else {
              id = depth === 0 ? B.GRASS : depth < 4 ? B.DIRT : B.STONE;
            }
            if (y > 4 && y < h - 4 && this.isCave(wx, y, wz)) id = B.AIR;
          } else {
            id = B.WATER;
          }
          if (id !== B.AIR) data[localIndex(lx, y, lz)] = id;
        }
        // Flowers
        if (!beach && !snowy && h + 1 < HEIGHT && hash3(wx, 7, wz, this.seed) < FLOWER_CHANCE) {
          data[localIndex(lx, h + 1, lz)] = hash3(wx, 9, wz, this.seed) < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW;
        }
      }
    }

    // Trees: consider columns in a border so canopies crossing chunk edges match up.
    for (let bz = 0; bz < W; bz++) {
      for (let bx = 0; bx < W; bx++) {
        const wx = x0 + bx - BORDER;
        const wz = z0 + bz - BORDER;
        const density = TREE_CHANCE * (0.35 + Math.max(0, this.forest(wx / 140, wz / 140)) * 2.2);
        if (hash3(wx, 1, wz, this.seed) >= density) continue;
        const h = heights[bx + bz * W];
        if (h <= SEA_LEVEL + 1 || h >= SNOW_LINE - 3) continue;
        this.placeTree(data, x0, z0, wx, h + 1, wz);
      }
    }
    return data;
  }

  private placeTree(data: Uint8Array, x0: number, z0: number, wx: number, by: number, wz: number) {
    const trunk = 4 + Math.floor(hash3(wx, 2, wz, this.seed) * 3);
    const topY = by + trunk - 1;
    const set = (x: number, y: number, z: number, id: number, force: boolean) => {
      const lx = x - x0;
      const lz = z - z0;
      if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      const i = localIndex(lx, y, lz);
      const cur = data[i];
      if (force || cur === B.AIR || cur === B.FLOWER_RED || cur === B.FLOWER_YELLOW) data[i] = id;
    };
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy <= -1 ? 2 : 1;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const corner = Math.abs(dx) === r && Math.abs(dz) === r;
          if (corner && (dy === 1 || hash3(wx + dx, topY + dy, wz + dz, this.seed) < 0.55)) continue;
          set(wx + dx, topY + dy, wz + dz, B.LEAVES, false);
        }
      }
    }
    for (let y = by; y <= topY; y++) set(wx, y, wz, B.LOG, true);
    set(wx, by - 1, wz, B.DIRT, true);
  }

  /** Find a dry spawn column near the origin. */
  findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 400; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
        const z = Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
        const h = this.heightAt(x, z);
        if (h > SEA_LEVEL + 1 && h < SNOW_LINE - 6) return { x: x + 0.5, y: h + 1, z: z + 0.5 };
        if (r === 0) break;
      }
    }
    return { x: 0.5, y: this.heightAt(0, 0) + 1, z: 0.5 };
  }
}
