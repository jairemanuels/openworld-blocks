import { IS_OPAQUE, RENDER_KIND, BLOCKS, tileUV, B } from './blocks';
import { CHUNK, HEIGHT, localIndex } from './coords';

export const PAD = CHUNK + 2;
export const PAD_AREA = PAD * PAD;
export const PADDED_VOLUME = PAD_AREA * HEIGHT;

/** Index into a padded (18x18xH) array, x/z in [-1, 16]. */
export function paddedIndex(x: number, y: number, z: number): number {
  return x + 1 + (z + 1) * PAD + y * PAD_AREA;
}

/**
 * Build a padded voxel volume from a chunk and its 8 neighbours.
 * neighbours is a 3x3 grid indexed [dx+1 + (dz+1)*3]; the centre entry is ignored.
 * Missing neighbours are treated as air.
 */
export function buildPadded(center: Uint8Array, neighbours: Array<Uint8Array | null | undefined>): Uint8Array {
  const out = new Uint8Array(PADDED_VOLUME);
  for (let y = 0; y < HEIGHT; y++) {
    for (let z = -1; z <= CHUNK; z++) {
      const dz = z < 0 ? -1 : z >= CHUNK ? 1 : 0;
      const lz = z - dz * CHUNK;
      for (let x = -1; x <= CHUNK; x++) {
        const dx = x < 0 ? -1 : x >= CHUNK ? 1 : 0;
        const src = dx === 0 && dz === 0 ? center : neighbours[dx + 1 + (dz + 1) * 3];
        if (!src) continue;
        const lx = x - dx * CHUNK;
        out[paddedIndex(x, y, z)] = src[localIndex(lx, y, lz)];
      }
    }
  }
  return out;
}

export interface MeshBuffers {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}
export interface ChunkMesh {
  solid: MeshBuffers;
  water: MeshBuffers;
}

class Builder {
  p: number[] = [];
  uv: number[] = [];
  c: number[] = [];
  i: number[] = [];
  quads = 0;
  finish(): MeshBuffers {
    return {
      positions: new Float32Array(this.p),
      uvs: new Float32Array(this.uv),
      colors: new Float32Array(this.c),
      indices: new Uint32Array(this.i),
    };
  }
}

// Face definitions: normal, 4 corners (CCW seen from outside), shade, tile slot (0 top,1 bottom,2 side)
interface Face { n: [number, number, number]; v: number[][]; shade: number; slot: 0 | 1 | 2 }
export const FACES: Face[] = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8, slot: 2 },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8, slot: 2 },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, slot: 0 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55, slot: 1 },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.7, slot: 2 },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.7, slot: 2 },
];
const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_LEVELS = [0.45, 0.64, 0.82, 1.0];
const WATER_DROP = 0.12;

/** Should the face of block `self` that touches `other` be drawn? */
export function faceVisible(self: number, other: number): boolean {
  if (other === B.AIR) return true;
  if (IS_OPAQUE[other]) return false;
  const k = RENDER_KIND[other];
  if (k === 'cross') return true;
  return other !== self;
}

/** Mesh a padded chunk volume. Only faces adjacent to non-occluding blocks are emitted. */
export function meshChunk(vox: Uint8Array): ChunkMesh {
  const solid = new Builder();
  const water = new Builder();
  const get = (x: number, y: number, z: number): number => {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    return vox[paddedIndex(x, y, z)];
  };
  const occ = (x: number, y: number, z: number): number => (y >= 0 && y < HEIGHT && IS_OPAQUE[vox[paddedIndex(x, y, z)]] ? 1 : 0);

  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = vox[paddedIndex(x, y, z)];
        if (id === B.AIR) continue;
        const kind = RENDER_KIND[id];
        const def = BLOCKS[id];
        if (!def) continue;
        if (kind === 'cross') {
          emitCross(solid, x, y, z, def.tiles[2]);
          continue;
        }
        const isWater = kind === 'water';
        const b = isWater ? water : solid;
        const waterTop = isWater && get(x, y + 1, z) !== B.WATER;
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const [nx, ny, nz] = face.n;
          const other = get(x + nx, y + ny, z + nz);
          if (!faceVisible(id, other)) continue;
          const [u0, v0, u1, v1] = tileUV(def.tiles[face.slot]);
          const base = b.quads * 4;
          const ao: number[] = [];
          for (let k = 0; k < 4; k++) {
            const c = face.v[k];
            let py = y + c[1];
            if (waterTop && c[1] === 1) py -= WATER_DROP;
            b.p.push(x + c[0], py, z + c[2]);
            const uc = UVC[k];
            b.uv.push(uc[0] ? u1 : u0, uc[1] ? v1 : v0);
            let level = 3;
            if (!isWater && id !== B.LAMP) {
              // ambient occlusion from the 3 blocks around this corner in the face's plane
              const ox = x + nx, oy = y + ny, oz = z + nz;
              const sx = nx !== 0 ? 0 : c[0] * 2 - 1;
              const sy = ny !== 0 ? 0 : c[1] * 2 - 1;
              const sz = nz !== 0 ? 0 : c[2] * 2 - 1;
              let s1: number, s2: number;
              if (nx !== 0) { s1 = occ(ox, oy + sy, oz); s2 = occ(ox, oy, oz + sz); }
              else if (ny !== 0) { s1 = occ(ox + sx, oy, oz); s2 = occ(ox, oy, oz + sz); }
              else { s1 = occ(ox + sx, oy, oz); s2 = occ(ox, oy + sy, oz); }
              const corner = occ(ox + sx, oy + sy, oz + sz);
              level = s1 && s2 ? 0 : 3 - (s1 + s2 + corner);
            }
            ao.push(level);
            const l = (id === B.LAMP ? 1.15 : face.shade) * AO_LEVELS[level];
            b.c.push(l, l, l);
          }
          if (ao[0] + ao[2] < ao[1] + ao[3]) b.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          else b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
          b.quads++;
        }
      }
    }
  }
  return { solid: solid.finish(), water: water.finish() };
}

function emitCross(b: Builder, x: number, y: number, z: number, tile: number) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const a = 0.15, c = 0.85;
  const quads = [
    [[a, 0, a], [c, 0, c], [c, 1, c], [a, 1, a]],
    [[c, 0, a], [a, 0, c], [a, 1, c], [c, 1, a]],
  ];
  for (const q of quads) {
    for (let side = 0; side < 2; side++) {
      const base = b.quads * 4;
      for (let k = 0; k < 4; k++) {
        const v = q[k];
        b.p.push(x + v[0], y + v[1], z + v[2]);
        const uc = UVC[k];
        b.uv.push(uc[0] ? u1 : u0, uc[1] ? v1 : v0);
        b.c.push(0.9, 0.9, 0.9);
      }
      if (side === 0) b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else b.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
      b.quads++;
    }
  }
}

/** Number of quads in a mesh (handy for tests / debug). */
export function quadCount(m: MeshBuffers): number {
  return m.indices.length / 6;
}
