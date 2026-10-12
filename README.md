# openworld blocks

An open-source voxel sandbox that runs in your browser — inspired by games like Minecraft, built from scratch with 100% original code, procedurally drawn textures and synthesized sounds.

**▶ Live demo: https://jairemanuels.github.io/openworld-blocks/**

Infinite procedurally generated terrain, creative building, day/night cycle and local saves. No install, no account.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look around (click the game to capture the pointer) |
| `Space` | Jump · swim up · fly up |
| `Shift` or double-tap `W` | Sprint (while flying, `Shift` descends) |
| `F` | Toggle flying |
| Left click | Break block |
| Right click | Place selected block |
| Middle click | Pick the targeted block into the hotbar |
| `1`–`9` / mouse wheel | Select hotbar slot |
| `E` | Block palette (choose what goes in the selected slot) |
| `F3` | FPS & debug overlay |
| `Esc` | Pause menu (settings, save, quit) |

Touch screens get a basic on-screen stick, look-drag and action buttons.

## Features

- **Infinite terrain** in 16×16×128 chunks: plains, rolling hills, mountains with snow caps, sandy beaches, oceans at sea level, trees, flowers and winding caves. Deterministic per seed (text or number).
- **Web Worker** chunk generation and meshing, with face culling, per-vertex ambient occlusion and a bounded number of mesh uploads per frame to keep the frame rate flat.
- **Procedural texture atlas** — every 16×16 tile is drawn on a canvas at startup in our own palette.
- **First-person controls** with pointer lock, gravity, AABB collision, jumping, sprinting, swimming and creative flight.
- **Building**: DDA voxel raycast targeting with a thin outline, break/place with hold-to-repeat, 9-slot hotbar plus a palette of 16 blocks.
- **Day/night cycle** (20 minutes) with sky colour, sun, moon, stars, global light and distance fog matched to the render distance.
- **Saves**: seed, every block edit, player position/orientation, time of day and hotbar per world in `localStorage`, autosaved every 5 seconds. Multiple worlds via *Continue*.
- **Settings**: render distance, mouse sensitivity, field of view, FPS overlay, sound.
- Synthesized WebAudio sound effects (no sample files).

## Local development

```bash
git clone https://github.com/jairemanuels/openworld-blocks.git
cd openworld-blocks
npm install
npm run dev      # dev server with hot reload
npm test         # vitest unit tests
npm run build    # type-check + production build into dist/
npm run deploy   # build and publish dist/ to the gh-pages branch
```

Project layout:

```
src/
  coords.ts    chunk/world coordinate math
  rng.ts       seed hashing, PRNG, coordinate hashes
  blocks.ts    block definitions and atlas layout
  terrain.ts   deterministic terrain generator (simplex noise)
  mesher.ts    face-culled chunk mesher with ambient occlusion
  raycast.ts   voxel traversal for block targeting
  physics.ts   AABB collision
  save.ts      world (de)serialization and storage
  worker.ts    generation + meshing worker
  world.ts     chunk streaming, edits, mesh uploads
  game.ts      renderer, player, input, game loop
  sky.ts       day/night cycle
  atlas.ts     procedural textures
  ui.ts        menus and HUD
tests/         vitest unit tests for the pure modules
```

## Stack

[Vite](https://vitejs.dev) · TypeScript · [Three.js](https://threejs.org) · [simplex-noise](https://github.com/jwagner/simplex-noise.js) · Vitest. Fonts: Geist and Geist Mono.

## Roadmap

- Multiplayer via WebRTC / WebSocket
- Survival mode with inventory, health and crafting
- Mobs and animals
- Biomes (desert, taiga, swamp, …) and more block types
- Block light propagation (torches, lamps), water flow
- IndexedDB storage for very large worlds, export/import of saves
- Better touch controls and gamepad support

Contributions welcome — open an issue or a pull request.

## License

[MIT](LICENSE) © 2026 Jaïr Emanuels / Nodient

---

Not affiliated with Mojang or Microsoft.
