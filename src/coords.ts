export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA_LEVEL = 48;
export const CHUNK_AREA = CHUNK * CHUNK;
export const CHUNK_VOLUME = CHUNK_AREA * HEIGHT;

/** Positive modulo (works for negative numbers). */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function worldToChunk(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(Math.floor(x) / CHUNK), cz: Math.floor(Math.floor(z) / CHUNK) };
}

export function worldToLocal(x: number, z: number): { lx: number; lz: number } {
  return { lx: mod(Math.floor(x), CHUNK), lz: mod(Math.floor(z), CHUNK) };
}

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

export function parseChunkKey(key: string): { cx: number; cz: number } {
  const [a, b] = key.split(',');
  return { cx: Number(a), cz: Number(b) };
}

/** Index into a chunk's voxel array (x fastest, then z, then y). */
export function localIndex(lx: number, y: number, lz: number): number {
  return lx + lz * CHUNK + y * CHUNK_AREA;
}

export function indexToLocal(i: number): { lx: number; y: number; lz: number } {
  const y = Math.floor(i / CHUNK_AREA);
  const r = i - y * CHUNK_AREA;
  return { lx: r % CHUNK, y, lz: Math.floor(r / CHUNK) };
}

/** Chunk coordinates within a circular radius, sorted nearest first. */
export function chunksInRadius(cx: number, cz: number, r: number): Array<{ cx: number; cz: number; d2: number }> {
  const out: Array<{ cx: number; cz: number; d2: number }> = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= r * r + r) out.push({ cx: cx + dx, cz: cz + dz, d2 });
    }
  }
  out.sort((a, b) => a.d2 - b.d2);
  return out;
}
