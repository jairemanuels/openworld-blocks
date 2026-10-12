import { ATLAS_COLS, TILE_PX, T, TILE_COUNT, BLOCKS } from './blocks';
import { mulberry32 } from './rng';

type RGB = [number, number, number];
type Px = (x: number, y: number, r: () => number) => RGB | null | [number, number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const jitter = (c: RGB, r: () => number, amt: number): RGB => {
  const k = (r() - 0.5) * amt;
  return [c[0] + k, c[1] + k, c[2] + k];
};
const pick = (pal: RGB[], r: () => number) => pal[Math.floor(r() * pal.length)];

const GRASS = ['#4f9a36', '#5aa83c', '#63b445', '#4a8f31', '#6cbd4b'].map(hex);
const DIRT = ['#7a5232', '#86603b', '#6d4a2c', '#8f6943', '#5f3f25'].map(hex);
const STONE = ['#8a8d91', '#7c7f84', '#94979b', '#6f7277'].map(hex);
const SAND = ['#e3d39b', '#dccb8f', '#ead9a5', '#d4c286'].map(hex);
const LEAF = ['#3d7f2b', '#33702a', '#478e33', '#2b6223', '#529b3b'].map(hex);
const BARK = ['#5b3e22', '#6a4a2a', '#4e351d'].map(hex);

const painters: Record<number, Px> = {
  [T.GRASS_TOP]: (_x, _y, r) => jitter(pick(GRASS, r), r, 14),
  [T.GRASS_SIDE]: (x, y, r) => {
    const drip = 3 + ((x * 7 + 3) % 5 === 0 ? 2 : (x * 13) % 3 === 0 ? 1 : 0);
    return y < drip ? jitter(pick(GRASS, r), r, 12) : jitter(pick(DIRT, r), r, 12);
  },
  [T.DIRT]: (_x, _y, r) => jitter(pick(DIRT, r), r, 14),
  [T.STONE]: (x, y, r) => {
    const crack = (x * 3 + y * 5) % 11 === 0 && r() < 0.6;
    return crack ? hex('#5e6166') : jitter(pick(STONE, r), r, 10);
  },
  [T.SAND]: (_x, _y, r) => jitter(pick(SAND, r), r, 10),
  [T.WATER]: (x, y, r) => {
    const wave = Math.sin((x + y * 0.5) * 0.9) > 0.75;
    return wave ? jitter(hex('#5aa7e6'), r, 8) : jitter(hex('#2e74c9'), r, 10);
  },
  [T.LOG_SIDE]: (x, _y, r) => {
    const stripe = x % 4 === 0;
    return stripe ? jitter(hex('#3e2914'), r, 8) : jitter(pick(BARK, r), r, 10);
  },
  [T.LOG_TOP]: (x, y, r) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 7) return jitter(pick(BARK, r), r, 8);
    return Math.floor(d) % 2 === 0 ? jitter(hex('#b88a55'), r, 8) : jitter(hex('#9c7244'), r, 8);
  },
  [T.LEAVES]: (_x, _y, r) => (r() < 0.16 ? null : jitter(pick(LEAF, r), r, 14)),
  [T.PLANKS]: (x, y, r) => {
    if (y % 4 === 3) return hex('#6e4d2b');
    const off = Math.floor(y / 4) % 2 === 0 ? 0 : 8;
    if ((x + off) % 16 === 0) return hex('#7a5631');
    return jitter(hex('#b0834f'), r, 12);
  },
  [T.RUBBLE]: (x, y, r) => {
    const cell = (Math.floor((x + (Math.floor(y / 5) % 2) * 3) / 5) * 7 + Math.floor(y / 5) * 3) % 4;
    const edge = (x + (Math.floor(y / 5) % 2) * 3) % 5 === 0 || y % 5 === 0;
    if (edge) return jitter(hex('#4d4f53'), r, 6);
    return jitter(STONE[cell % STONE.length], r, 14);
  },
  [T.GLASS]: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [220, 236, 245, 255];
    if ((x - y === 3 || x - y === 4) && x > 3 && x < 12) return [255, 255, 255, 230];
    return r() < 0.02 ? [230, 245, 255, 120] : null;
  },
  [T.BRICK]: (x, y, r) => {
    const row = Math.floor(y / 4);
    const off = row % 2 === 0 ? 0 : 4;
    if (y % 4 === 3 || (x + off) % 8 === 7) return jitter(hex('#cfc6b8'), r, 8);
    return jitter(hex(row % 3 === 0 ? '#a5432f' : '#b44e36'), r, 14);
  },
  [T.FLOWER_RED]: (x, y, r) => flower(x, y, r, ['#d8333a', '#ef4b48', '#b8262c']),
  [T.FLOWER_YELLOW]: (x, y, r) => flower(x, y, r, ['#f2c624', '#ffd84a', '#d9a915']),
  [T.SNOW]: (_x, _y, r) => jitter(hex('#f2f6fa'), r, 8),
  [T.BEDROCK]: (_x, _y, r) => jitter(r() < 0.5 ? hex('#2c2d30') : hex('#4a4b4f'), r, 14),
  [T.CLAY]: (_x, _y, r) => jitter(hex('#9aa3b0'), r, 8),
  [T.LAMP]: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7) return hex('#3a3326');
    return jitter(hex('#ffd64a'), r, 18);
  },
};

function flower(x: number, y: number, r: () => number, pal: string[]): RGB | null {
  const cx = 8, cy = 5;
  const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
  if (d < 1.2) return hex('#3b2a12');
  if (d < 3.2) return jitter(hex(pal[Math.floor(r() * pal.length)]), r, 10);
  if (x >= 7 && x <= 8 && y > cy + 2) return jitter(hex('#3f8a2d'), r, 10);
  if (y === 11 && (x === 9 || x === 10)) return hex('#4c9c36');
  if (y === 12 && (x === 5 || x === 6)) return hex('#4c9c36');
  return null;
}

/** Draws every tile into a canvas atlas (8 columns, 16 px tiles). */
export function createAtlasCanvas(): HTMLCanvasElement {
  const rows = Math.ceil(TILE_COUNT / ATLAS_COLS);
  const size = ATLAS_COLS * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.max(rows, ATLAS_COLS) * TILE_PX;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let t = 0; t < TILE_COUNT; t++) {
    const paint = painters[t];
    if (!paint) continue;
    const r = mulberry32(0xb10c + t * 7919);
    const ox = (t % ATLAS_COLS) * TILE_PX;
    const oy = Math.floor(t / ATLAS_COLS) * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const c = paint(x, y, r);
        const i = ((oy + y) * canvas.width + ox + x) * 4;
        if (!c) { img.data[i + 3] = 0; continue; }
        img.data[i] = Math.max(0, Math.min(255, c[0]));
        img.data[i + 1] = Math.max(0, Math.min(255, c[1]));
        img.data[i + 2] = Math.max(0, Math.min(255, c[2]));
        img.data[i + 3] = c.length === 4 ? (c as number[])[3] : 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A small isometric-ish icon for a block (used by the hotbar). */
export function drawBlockIcon(atlas: HTMLCanvasElement, id: number, size = 32): string {
  const def = BLOCKS[id];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const tile = (t: number) => [(t % ATLAS_COLS) * TILE_PX, Math.floor(t / ATLAS_COLS) * TILE_PX] as const;
  if (def.render === 'cross') {
    const [sx, sy] = tile(def.tiles[2]);
    ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, size, size);
    return c.toDataURL();
  }
  const s = size / 2;
  // top face
  const [tx, ty] = tile(def.tiles[0]);
  ctx.save();
  ctx.setTransform(s / TILE_PX, s / 2 / TILE_PX, -s / TILE_PX, s / 2 / TILE_PX, s, 0);
  ctx.drawImage(atlas, tx, ty, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  ctx.restore();
  const [sx, sy] = tile(def.tiles[2]);
  // left face
  ctx.save();
  ctx.setTransform(s / TILE_PX, s / 2 / TILE_PX, 0, s / TILE_PX, 0, s / 2);
  ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.restore();
  // right face
  ctx.save();
  ctx.setTransform(s / TILE_PX, -s / 2 / TILE_PX, 0, s / TILE_PX, s, s);
  ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.restore();
  return c.toDataURL();
}
