import { describe, it, expect } from 'vitest';
import { serializeWorld, deserializeWorld, recordEdit, saveWorld, loadWorld, listWorlds, deleteWorld, MemoryStorage, type WorldState } from '../src/save';

function sample(): WorldState {
  const edits = new Map();
  recordEdit(edits, 0, 0, 5, 3);
  recordEdit(edits, 0, 0, 1000, 0);
  recordEdit(edits, -2, 7, 32767, 11);
  return {
    version: 1, id: 'w1', name: 'Test', seed: 'banana', created: 1, lastPlayed: 2, time: 0.42,
    player: { x: 1.5, y: 70, z: -3.25, yaw: 1.2, pitch: -0.3, flying: true },
    hotbar: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    edits,
  };
}

describe('save serialization', () => {
  it('round-trips a world including edits', () => {
    const w = sample();
    const back = deserializeWorld(serializeWorld(w));
    expect(back.seed).toBe('banana');
    expect(back.player).toEqual(w.player);
    expect(back.time).toBe(0.42);
    expect(back.hotbar).toEqual(w.hotbar);
    expect([...back.edits.keys()].sort()).toEqual(['-2,7', '0,0']);
    expect(back.edits.get('0,0')!.get(5)).toBe(3);
    expect(back.edits.get('0,0')!.get(1000)).toBe(0);
    expect(back.edits.get('-2,7')!.get(32767)).toBe(11);
    expect(serializeWorld(back)).toBe(serializeWorld(w));
  });
  it('stores, lists and deletes worlds', () => {
    const s = new MemoryStorage();
    saveWorld(s, sample());
    saveWorld(s, { ...sample(), id: 'w2', name: 'Other', lastPlayed: 10 });
    expect(listWorlds(s).map((m) => m.id)).toEqual(['w2', 'w1']);
    expect(loadWorld(s, 'w1')!.edits.get('0,0')!.get(5)).toBe(3);
    deleteWorld(s, 'w1');
    expect(listWorlds(s).map((m) => m.id)).toEqual(['w2']);
    expect(loadWorld(s, 'w1')).toBeNull();
  });
  it('rejects garbage', () => {
    expect(() => deserializeWorld('{}')).toThrow();
  });
});
