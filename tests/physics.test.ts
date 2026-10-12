import { describe, it, expect } from 'vitest';
import { moveAndCollide, aabbOverlapsSolid } from '../src/physics';

const floor = (x: number, y: number, z: number) => y <= 9; // solid ground up to y=9 (top surface at 10)

describe('AABB collision', () => {
  it('lands on the ground', () => {
    const p = { x: 0.5, y: 12, z: 0.5 };
    const r = moveAndCollide(p, { x: 0, y: -5, z: 0 }, floor);
    expect(r.hitY).toBe(true);
    expect(p.y).toBeCloseTo(10, 3);
  });
  it('is blocked by a wall', () => {
    const wall = (x: number, y: number, z: number) => floor(x, y, z) || x === 3;
    const p = { x: 1.5, y: 10.001, z: 0.5 };
    const r = moveAndCollide(p, { x: 4, y: 0, z: 0 }, wall);
    expect(r.hitX).toBe(true);
    expect(p.x).toBeCloseTo(2.7, 3);
    expect(aabbOverlapsSolid(p, wall)).toBe(false);
  });
  it('moves freely in open air', () => {
    const p = { x: 0, y: 50, z: 0 };
    const r = moveAndCollide(p, { x: 1, y: 1, z: -1 }, floor);
    expect(r).toEqual({ hitX: false, hitY: false, hitZ: false });
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(51);
    expect(p.z).toBeCloseTo(-1);
  });
});
