import { describe, it, expect } from 'vitest';
import { raycastVoxels } from '../src/raycast';

describe('voxel raycast', () => {
  const single = (bx: number, by: number, bz: number) => (x: number, y: number, z: number) => x === bx && y === by && z === bz;

  it('hits a block straight ahead with the correct face normal', () => {
    const hit = raycastVoxels(0.5, 0.5, 0.5, 1, 0, 0, 10, single(5, 0, 0));
    expect(hit).toMatchObject({ x: 5, y: 0, z: 0, nx: -1, ny: 0, nz: 0 });
    expect(hit!.distance).toBeCloseTo(4.5);
  });
  it('hits from above (top face)', () => {
    const hit = raycastVoxels(2.5, 10.2, 2.5, 0, -1, 0, 20, (x, y, z) => y <= 3 && x === 2 && z === 2);
    expect(hit).toMatchObject({ x: 2, y: 3, z: 2, ny: 1 });
    expect(hit!.distance).toBeCloseTo(6.2);
  });
  it('handles negative coordinates and directions', () => {
    const hit = raycastVoxels(-0.5, 0.5, -0.5, -1, 0, -1, 10, single(-4, 0, -4));
    expect(hit).not.toBeNull();
    expect([hit!.x, hit!.y, hit!.z]).toEqual([-4, 0, -4]);
  });
  it('visits cells in order along a diagonal and never skips a face-adjacent step', () => {
    const visited: number[][] = [];
    raycastVoxels(0.1, 0.2, 0.3, 1, 0.7, 0.4, 8, (x, y, z) => { visited.push([x, y, z]); return false; });
    for (let i = 1; i < visited.length; i++) {
      const d = Math.abs(visited[i][0] - visited[i - 1][0]) + Math.abs(visited[i][1] - visited[i - 1][1]) + Math.abs(visited[i][2] - visited[i - 1][2]);
      expect(d).toBe(1);
    }
  });
  it('returns null when nothing is in range', () => {
    expect(raycastVoxels(0, 0, 0, 0, 0, 1, 5, single(0, 0, 9))).toBeNull();
  });
});
