import { chunkKey } from './coords';

export const SAVE_VERSION = 1;

/** Player edits, grouped per chunk: chunkKey -> (localIndex -> blockId). */
export type EditMap = Map<string, Map<number, number>>;

export interface PlayerState { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean }

export interface WorldMeta {
  id: string;
  name: string;
  seed: string;
  created: number;
  lastPlayed: number;
}

export interface WorldState extends WorldMeta {
  version: number;
  time: number;
  player: PlayerState | null;
  hotbar: number[];
  edits: EditMap;
}

export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const INDEX_KEY = 'owb:worlds';
const worldKey = (id: string) => 'owb:world:' + id;

export function serializeEdits(edits: EditMap): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, m] of edits) {
    if (m.size === 0) continue;
    const arr: number[] = [];
    for (const [i, id] of m) arr.push(i, id);
    out[k] = arr;
  }
  return out;
}

export function deserializeEdits(obj: Record<string, number[]> | undefined): EditMap {
  const edits: EditMap = new Map();
  if (!obj) return edits;
  for (const k of Object.keys(obj)) {
    const arr = obj[k];
    const m = new Map<number, number>();
    for (let i = 0; i + 1 < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
    edits.set(k, m);
  }
  return edits;
}

export function serializeWorld(w: WorldState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    id: w.id,
    name: w.name,
    seed: w.seed,
    created: w.created,
    lastPlayed: w.lastPlayed,
    time: w.time,
    player: w.player,
    hotbar: w.hotbar,
    edits: serializeEdits(w.edits),
  });
}

export function deserializeWorld(json: string): WorldState {
  const o = JSON.parse(json);
  if (typeof o !== 'object' || !o || typeof o.seed !== 'string') throw new Error('Invalid world save');
  return {
    version: o.version ?? 1,
    id: String(o.id),
    name: String(o.name ?? 'World'),
    seed: o.seed,
    created: Number(o.created ?? Date.now()),
    lastPlayed: Number(o.lastPlayed ?? Date.now()),
    time: Number(o.time ?? 0.3),
    player: o.player ?? null,
    hotbar: Array.isArray(o.hotbar) ? o.hotbar : [],
    edits: deserializeEdits(o.edits),
  };
}

export function recordEdit(edits: EditMap, cx: number, cz: number, index: number, id: number) {
  const k = chunkKey(cx, cz);
  let m = edits.get(k);
  if (!m) { m = new Map(); edits.set(k, m); }
  m.set(index, id);
}

export function listWorlds(s: KVStorage): WorldMeta[] {
  try {
    const arr = JSON.parse(s.getItem(INDEX_KEY) || '[]');
    return Array.isArray(arr) ? arr.sort((a: WorldMeta, b: WorldMeta) => b.lastPlayed - a.lastPlayed) : [];
  } catch {
    return [];
  }
}

export function saveWorld(s: KVStorage, w: WorldState) {
  s.setItem(worldKey(w.id), serializeWorld(w));
  const list = listWorlds(s).filter((m) => m.id !== w.id);
  list.unshift({ id: w.id, name: w.name, seed: w.seed, created: w.created, lastPlayed: w.lastPlayed });
  s.setItem(INDEX_KEY, JSON.stringify(list));
}

export function loadWorld(s: KVStorage, id: string): WorldState | null {
  const raw = s.getItem(worldKey(id));
  if (!raw) return null;
  try { return deserializeWorld(raw); } catch { return null; }
}

export function deleteWorld(s: KVStorage, id: string) {
  s.removeItem(worldKey(id));
  s.setItem(INDEX_KEY, JSON.stringify(listWorlds(s).filter((m) => m.id !== id)));
}

export function newWorldId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** In-memory storage (tests / private browsing fallback). */
export class MemoryStorage implements KVStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
