export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
const EPS = 1e-4;

export interface Vec3 { x: number; y: number; z: number }
export type SolidFn = (x: number, y: number, z: number) => boolean;

export interface MoveResult { hitX: boolean; hitY: boolean; hitZ: boolean }

/** Does a player-sized AABB with feet at p overlap any solid voxel? */
export function aabbOverlapsSolid(p: Vec3, solid: SolidFn, hw = PLAYER_HALF_WIDTH, h = PLAYER_HEIGHT): boolean {
  const x0 = Math.floor(p.x - hw), x1 = Math.floor(p.x + hw - 1e-9);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + h - 1e-9);
  const z0 = Math.floor(p.z - hw), z1 = Math.floor(p.z + hw - 1e-9);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) if (solid(x, y, z)) return true;
  return false;
}

function moveAxis(p: Vec3, axis: 'x' | 'y' | 'z', delta: number, solid: SolidFn): boolean {
  if (delta === 0) return false;
  const hw = PLAYER_HALF_WIDTH, h = PLAYER_HEIGHT;
  const n: Vec3 = { x: p.x, y: p.y, z: p.z };
  n[axis] += delta;
  const x0 = Math.floor(n.x - hw), x1 = Math.floor(n.x + hw - 1e-9);
  const y0 = Math.floor(n.y), y1 = Math.floor(n.y + h - 1e-9);
  const z0 = Math.floor(n.z - hw), z1 = Math.floor(n.z + hw - 1e-9);
  let hit = false;
  let limit = delta > 0 ? Infinity : -Infinity;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (!solid(x, y, z)) continue;
        hit = true;
        const c = axis === 'x' ? x : axis === 'y' ? y : z;
        limit = delta > 0 ? Math.min(limit, c) : Math.max(limit, c);
      }
  if (!hit) { p[axis] = n[axis]; return false; }
  if (axis === 'y') p.y = delta > 0 ? limit - h - EPS : limit + 1 + EPS;
  else p[axis] = delta > 0 ? limit - hw - EPS : limit + 1 + hw + EPS;
  return true;
}

/** Move an AABB by d with per-axis collision resolution. Large moves are sub-stepped. */
export function moveAndCollide(p: Vec3, d: Vec3, solid: SolidFn): MoveResult {
  const res: MoveResult = { hitX: false, hitY: false, hitZ: false };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)) / 0.45));
  for (let i = 0; i < steps; i++) {
    if (!res.hitY && moveAxis(p, 'y', d.y / steps, solid)) res.hitY = true;
    if (!res.hitX && moveAxis(p, 'x', d.x / steps, solid)) res.hitX = true;
    if (!res.hitZ && moveAxis(p, 'z', d.z / steps, solid)) res.hitZ = true;
  }
  return res;
}
