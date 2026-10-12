export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the hit (the side the ray entered from). */
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

/**
 * Voxel traversal (Amanatides & Woo). Visits every cell the ray passes through,
 * in order, and returns the first one for which `hit` is true.
 * The direction does not need to be normalised; maxDist is in world units.
 */
export function raycastVoxels(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  hit: (x: number, y: number, z: number) => boolean,
): RayHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx > 0 ? (x + 1 - ox) * tDeltaX : dx < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = dy > 0 ? (y + 1 - oy) * tDeltaY : dy < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz > 0 ? (z + 1 - oz) * tDeltaZ : dz < 0 ? (oz - z) * tDeltaZ : Infinity;
  let nx = 0, ny = 0, nz = 0;
  let t = 0;
  while (t <= maxDist) {
    if (hit(x, y, z)) return { x, y, z, nx, ny, nz, distance: t };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}
