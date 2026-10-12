import { describe, it, expect } from 'vitest';
import { TerrainGenerator } from '../src/terrain';
import { hashSeed } from '../src/rng';
import { B } from '../src/blocks';
import { CHUNK, HEIGHT, SEA_LEVEL, localIndex } from '../src/coords';

function digest(a: Uint8Array): number {
  let h = 0;
  for (let i = 0; i < a.length; i++) h = (Math.imul(h, 31) + a[i]) | 0;
  return h;
}

describe('terrain generation', () => {
  it('is deterministic for a given seed', () => {
    const a = new TerrainGenerator(hashSeed('hello'));
    const b = new TerrainGenerator(hashSeed('hello'));
    for (const [cx, cz] of [[0, 0], [-3, 7], [12, -40]]) {
      expect(digest(a.generateChunk(cx, cz))).toBe(digest(b.generateChunk(cx, cz)));
      expect(a.heightAt(cx * 16 + 3, cz * 16 + 5)).toBe(b.heightAt(cx * 16 + 3, cz * 16 + 5));
    }
  });
  it('differs between seeds', () => {
    const a = new TerrainGenerator(hashSeed('alpha'));
    const b = new TerrainGenerator(hashSeed('beta'));
    expect(digest(a.generateChunk(0, 0))).not.toBe(digest(b.generateChunk(0, 0)));
  });
  it('numeric seeds hash to themselves', () => {
    expect(hashSeed('12345')).toBe(12345);
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
  });
  it('has bedrock floor, air on top and water at or below sea level', () => {
    const g = new TerrainGenerator(42);
    const d = g.generateChunk(1, 2);
    for (let z = 0; z < CHUNK; z++)
      for (let x = 0; x < CHUNK; x++) {
        expect(d[localIndex(x, 0, z)]).toBe(B.BEDROCK);
        expect(d[localIndex(x, HEIGHT - 1, z)]).toBe(B.AIR);
        for (let y = SEA_LEVEL + 1; y < HEIGHT; y++) expect(d[localIndex(x, y, z)]).not.toBe(B.WATER);
      }
  });
  it('produces a variety of surface blocks and trees across a region', () => {
    const g = new TerrainGenerator(hashSeed('variety'));
    const found = new Set<number>();
    for (let cx = -6; cx < 6; cx++) for (let cz = -6; cz < 6; cz++) for (const v of g.generateChunk(cx, cz)) found.add(v);
    for (const id of [B.GRASS, B.DIRT, B.STONE, B.SAND, B.WATER, B.LOG, B.LEAVES, B.BEDROCK]) expect(found.has(id)).toBe(true);
    expect(found.has(B.FLOWER_RED) || found.has(B.FLOWER_YELLOW)).toBe(true);
  });
  it('tree canopies match across chunk borders', () => {
    const g = new TerrainGenerator(hashSeed('borders'));
    // Regenerate a chunk after generating its neighbours: identical either way.
    const first = digest(g.generateChunk(4, 4));
    g.generateChunk(3, 4); g.generateChunk(5, 4);
    expect(digest(g.generateChunk(4, 4))).toBe(first);
  });
  it('spawn point is on dry land', () => {
    const g = new TerrainGenerator(hashSeed('spawn'));
    const s = g.findSpawn();
    expect(s.y).toBeGreaterThan(SEA_LEVEL + 1);
  });
});
