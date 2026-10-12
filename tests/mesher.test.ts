import { describe, it, expect } from 'vitest';
import { meshChunk, paddedIndex, PADDED_VOLUME, quadCount, buildPadded, faceVisible } from '../src/mesher';
import { B } from '../src/blocks';
import { CHUNK_VOLUME, localIndex } from '../src/coords';

function vol(blocks: Array<[number, number, number, number]>): Uint8Array {
  const v = new Uint8Array(PADDED_VOLUME);
  for (const [x, y, z, id] of blocks) v[paddedIndex(x, y, z)] = id;
  return v;
}

describe('mesher face culling', () => {
  it('a single block has 6 faces', () => {
    const m = meshChunk(vol([[5, 10, 5, B.STONE]]));
    expect(quadCount(m.solid)).toBe(6);
    expect(m.solid.positions.length).toBe(6 * 4 * 3);
  });
  it('two touching blocks share a hidden face pair (10 faces)', () => {
    expect(quadCount(meshChunk(vol([[5, 10, 5, B.STONE], [6, 10, 5, B.DIRT]])).solid)).toBe(10);
  });
  it('a 2x2x2 cube has 24 visible faces', () => {
    const b: Array<[number, number, number, number]> = [];
    for (let x = 0; x < 2; x++) for (let y = 1; y < 3; y++) for (let z = 0; z < 2; z++) b.push([x + 3, y, z + 3, B.STONE]);
    expect(quadCount(meshChunk(vol(b)).solid)).toBe(24);
  });
  it('a block on the floor (y=0) does not emit a bottom face', () => {
    expect(quadCount(meshChunk(vol([[2, 0, 2, B.STONE]])).solid)).toBe(5);
  });
  it('neighbour chunk padding culls border faces', () => {
    expect(quadCount(meshChunk(vol([[15, 10, 5, B.STONE], [16, 10, 5, B.STONE]])).solid)).toBe(5);
  });
  it('water faces against water are culled, against air are kept', () => {
    const m = meshChunk(vol([[4, 10, 4, B.WATER], [5, 10, 4, B.WATER]]));
    expect(quadCount(m.water)).toBe(10);
    expect(quadCount(m.solid)).toBe(0);
  });
  it('glass next to stone shows the stone face', () => {
    expect(faceVisible(B.STONE, B.GLASS)).toBe(true);
    expect(faceVisible(B.GLASS, B.GLASS)).toBe(false);
    expect(faceVisible(B.GLASS, B.STONE)).toBe(false);
  });
  it('flowers are crossed quads (both sides)', () => {
    expect(quadCount(meshChunk(vol([[1, 5, 1, B.FLOWER_RED]])).solid)).toBe(4);
  });
  it('buildPadded copies neighbour borders', () => {
    const c = new Uint8Array(CHUNK_VOLUME);
    const east = new Uint8Array(CHUNK_VOLUME);
    east[localIndex(0, 7, 3)] = B.BRICK;
    const n: Array<Uint8Array | null> = new Array(9).fill(null);
    n[2 + 1 * 3] = east;
    const p = buildPadded(c, n);
    expect(p[paddedIndex(16, 7, 3)]).toBe(B.BRICK);
  });
});
