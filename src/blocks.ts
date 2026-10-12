/** Block ids. 0 is always air. */
export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  PLANKS: 8,
  RUBBLE: 9,
  GLASS: 10,
  BRICK: 11,
  FLOWER_RED: 12,
  FLOWER_YELLOW: 13,
  SNOW: 14,
  BEDROCK: 15,
  CLAY: 16,
  LAMP: 17,
} as const;

/** Atlas tile indices. */
export const T = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  PLANKS: 9,
  RUBBLE: 10,
  GLASS: 11,
  BRICK: 12,
  FLOWER_RED: 13,
  FLOWER_YELLOW: 14,
  SNOW: 15,
  BEDROCK: 16,
  CLAY: 17,
  LAMP: 18,
} as const;
export const TILE_COUNT = 19;

export type RenderKind = 'none' | 'opaque' | 'cutout' | 'water' | 'cross';

export interface BlockDef {
  id: number;
  name: string;
  /** Blocks the player (collision). */
  solid: boolean;
  /** Fully hides neighbouring faces. */
  opaque: boolean;
  render: RenderKind;
  /** Tiles for top, bottom, side. */
  tiles: [number, number, number];
  breakable: boolean;
}

function def(id: number, name: string, render: RenderKind, tiles: number | [number, number, number], opts: Partial<BlockDef> = {}): BlockDef {
  const t: [number, number, number] = typeof tiles === 'number' ? [tiles, tiles, tiles] : tiles;
  return {
    id,
    name,
    render,
    tiles: t,
    solid: render === 'opaque' || render === 'cutout',
    opaque: render === 'opaque',
    breakable: true,
    ...opts,
  };
}

export const BLOCKS: BlockDef[] = [
  def(B.AIR, 'Air', 'none', 0, { breakable: false }),
  def(B.GRASS, 'Meadow', 'opaque', [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE]),
  def(B.DIRT, 'Soil', 'opaque', T.DIRT),
  def(B.STONE, 'Stone', 'opaque', T.STONE),
  def(B.SAND, 'Sand', 'opaque', T.SAND),
  def(B.WATER, 'Water', 'water', T.WATER, { breakable: false }),
  def(B.LOG, 'Timber', 'opaque', [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE]),
  def(B.LEAVES, 'Foliage', 'cutout', T.LEAVES),
  def(B.PLANKS, 'Boards', 'opaque', T.PLANKS),
  def(B.RUBBLE, 'Rubble', 'opaque', T.RUBBLE),
  def(B.GLASS, 'Glass', 'cutout', T.GLASS),
  def(B.BRICK, 'Brick', 'opaque', T.BRICK),
  def(B.FLOWER_RED, 'Poppy', 'cross', T.FLOWER_RED),
  def(B.FLOWER_YELLOW, 'Buttercup', 'cross', T.FLOWER_YELLOW),
  def(B.SNOW, 'Snow', 'opaque', T.SNOW),
  def(B.BEDROCK, 'Basalt floor', 'opaque', T.BEDROCK, { breakable: false }),
  def(B.CLAY, 'Clay', 'opaque', T.CLAY),
  def(B.LAMP, 'Lantern block', 'opaque', T.LAMP),
];

export const BLOCK_COUNT = BLOCKS.length;

/** Lookup tables for the hot paths (mesher / physics). */
export const IS_OPAQUE = new Uint8Array(256);
export const IS_SOLID = new Uint8Array(256);
export const RENDER_KIND: RenderKind[] = new Array(256).fill('none');
for (const b of BLOCKS) {
  IS_OPAQUE[b.id] = b.opaque ? 1 : 0;
  IS_SOLID[b.id] = b.solid ? 1 : 0;
  RENDER_KIND[b.id] = b.render;
}

export const HOTBAR_DEFAULT: number[] = [
  B.GRASS, B.DIRT, B.STONE, B.RUBBLE, B.PLANKS, B.LOG, B.GLASS, B.BRICK, B.SAND,
];

/** Blocks the player can pick from the palette (everything placeable). */
export const PLACEABLE: number[] = BLOCKS.filter((b) => b.id !== B.AIR && b.id !== B.BEDROCK).map((b) => b.id);

/** Atlas layout (pure math so the mesher can run in a worker). */
export const ATLAS_COLS = 8;
export const TILE_PX = 16;
export function tileUV(tile: number): [number, number, number, number] {
  const c = tile % ATLAS_COLS;
  const r = Math.floor(tile / ATLAS_COLS);
  const inset = 0.02 / ATLAS_COLS;
  const u0 = c / ATLAS_COLS + inset;
  const u1 = (c + 1) / ATLAS_COLS - inset;
  const v1 = 1 - r / ATLAS_COLS - inset;
  const v0 = 1 - (r + 1) / ATLAS_COLS + inset;
  return [u0, v0, u1, v1];
}
