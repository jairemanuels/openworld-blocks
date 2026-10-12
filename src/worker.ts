/// <reference lib="webworker" />
import { TerrainGenerator } from './terrain';
import { meshChunk } from './mesher';

let gen: TerrainGenerator | null = null;

export type WorkerRequest =
  | { type: 'gen'; seed: number; cx: number; cz: number }
  | { type: 'mesh'; cx: number; cz: number; version: number; padded: Uint8Array };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'gen') {
    if (!gen || gen.seed !== msg.seed >>> 0) gen = new TerrainGenerator(msg.seed);
    const data = gen.generateChunk(msg.cx, msg.cz);
    (self as unknown as Worker).postMessage({ type: 'gen', seed: msg.seed, cx: msg.cx, cz: msg.cz, data }, [data.buffer]);
  } else if (msg.type === 'mesh') {
    const mesh = meshChunk(msg.padded);
    const transfer: ArrayBuffer[] = [];
    for (const b of [mesh.solid, mesh.water]) transfer.push(b.positions.buffer as ArrayBuffer, b.uvs.buffer as ArrayBuffer, b.colors.buffer as ArrayBuffer, b.indices.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ type: 'mesh', cx: msg.cx, cz: msg.cz, version: msg.version, mesh }, transfer);
  }
};
