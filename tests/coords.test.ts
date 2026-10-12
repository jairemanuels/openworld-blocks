import { describe, it, expect } from 'vitest';
import { worldToChunk, worldToLocal, localIndex, indexToLocal, chunkKey, parseChunkKey, mod, chunksInRadius, CHUNK, CHUNK_VOLUME } from '../src/coords';

describe('chunk coordinate math', () => {
  it('maps positive and negative world coords to chunks', () => {
    expect(worldToChunk(0, 0)).toEqual({ cx: 0, cz: 0 });
    expect(worldToChunk(15.9, 16)).toEqual({ cx: 0, cz: 1 });
    expect(worldToChunk(-0.1, -16)).toEqual({ cx: -1, cz: -1 });
    expect(worldToChunk(-17, 33)).toEqual({ cx: -2, cz: 2 });
  });
  it('maps world coords to local coords', () => {
    expect(worldToLocal(-1, -16)).toEqual({ lx: 15, lz: 0 });
    expect(worldToLocal(17.5, 31)).toEqual({ lx: 1, lz: 15 });
    expect(mod(-1, 16)).toBe(15);
  });
  it('local index round-trips and stays in range', () => {
    const seen = new Set<number>();
    for (const [x, y, z] of [[0, 0, 0], [15, 127, 15], [3, 64, 9], [15, 0, 0]]) {
      const i = localIndex(x, y, z);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(CHUNK_VOLUME);
      expect(indexToLocal(i)).toEqual({ lx: x, y, lz: z });
      seen.add(i);
    }
    expect(seen.size).toBe(4);
    expect(localIndex(CHUNK - 1, 0, CHUNK - 1) + 1).toBe(CHUNK * CHUNK);
  });
  it('chunk keys round-trip', () => {
    expect(parseChunkKey(chunkKey(-3, 12))).toEqual({ cx: -3, cz: 12 });
  });
  it('lists chunks in radius nearest first', () => {
    const list = chunksInRadius(5, -5, 3);
    expect(list[0]).toMatchObject({ cx: 5, cz: -5, d2: 0 });
    for (let i = 1; i < list.length; i++) expect(list[i].d2).toBeGreaterThanOrEqual(list[i - 1].d2);
    expect(list.find((c) => c.cx === 8 && c.cz === -2)).toBeUndefined(); // corner is outside the circle
  });
});
