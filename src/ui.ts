import type { Game, GameHooks } from './game';
import { BLOCKS, PLACEABLE } from './blocks';
import { drawBlockIcon, createAtlasCanvas } from './atlas';
import { saveSettings, type Settings } from './settings';
import { listWorlds, loadWorld, deleteWorld, newWorldId, type KVStorage, type WorldState } from './save';
import { randomSeedString } from './rng';
import { setSoundEnabled } from './sound';

type Screen = 'title' | 'new' | 'continue' | 'settings' | 'controls' | 'pause' | 'palette' | null;

const REPO = 'https://github.com/jairemanuels/openworld-blocks';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c as any);
  return el;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

export class UI {
  private game!: Game;
  private screen: Screen = 'title';
  private returnTo: Screen = 'title';
  private screenEl = h('div', { class: 'screen title' });
  private hud = h('div', { class: 'hud hidden' });
  private hotbarEl = h('div', { class: 'hotbar' });
  private nameEl = h('div', { class: 'blockname', style: 'opacity:0' });
  private modeEl = h('div', { class: 'mode hidden', html: '<i></i>Flying' });
  private debugEl = h('div', { class: 'debug hidden' });
  private toastEl = h('div', { class: 'toast hidden' });
  private loadingEl = h('div', { class: 'loading hidden' });
  private touchEl = h('div', { class: 'touch hidden' });
  private icons: string[] = [];
  private nameTimer = 0;
  private toastTimer = 0;
  private lastHotbar = '';
  private isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  private inGame = false;

  readonly hooks: GameHooks = {
    onPauseChange: (paused) => {
      if (!this.inGame) return;
      if (paused) {
        if (this.screen !== 'palette') this.show('pause');
      } else {
        this.show(null);
      }
    },
    onHotbarChange: (slots, sel) => this.renderHotbar(slots, sel),
    onDebug: (text) => {
      if (text === null) this.debugEl.classList.add('hidden');
      else { this.debugEl.classList.remove('hidden'); this.debugEl.textContent = text; }
    },
    onLoading: (done, progress) => {
      if (!this.inGame) return;
      this.loadingEl.classList.toggle('hidden', done);
      if (!done) {
        const bar = this.loadingEl.querySelector('.bar i') as HTMLElement | null;
        if (bar) bar.style.width = Math.min(100, 8 + progress * 10) + '%';
      }
    },
    onToast: (msg) => this.toast(msg),
    onFlyChange: (f) => this.modeEl.classList.toggle('hidden', !f),
  };

  constructor(private root: HTMLElement, private settings: Settings, private storage: KVStorage) {
    setSoundEnabled(settings.sound);
    this.loadingEl.append(h('div', { class: 'box' }, 'Generating terrain…', h('div', { class: 'bar' }, h('i'))));
    this.hud.append(h('div', { class: 'crosshair' }), this.nameEl, this.modeEl, this.debugEl);
    this.root.append(this.hud, this.hotbarEl, this.toastEl, this.touchEl, this.loadingEl, this.screenEl);
    this.hotbarEl.classList.add('hidden');
    // Title background: a mosaic of our own procedurally drawn tiles
    try {
      const atlas = createAtlasCanvas();
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const pick = [0, 0, 0, 2, 3, 4, 9, 8, 0, 1];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const t = pick[(x * 7 + y * 3 + x * y) % pick.length];
        ctx.drawImage(atlas, (t % 8) * 16, Math.floor(t / 8) * 16, 16, 16, x * 16, y * 16, 16, 16);
      }
      this.screenEl.style.backgroundImage = `url(${c.toDataURL()})`;
    } catch { /* ignore */ }
  }

  attach(game: Game) {
    this.game = game;
    this.icons = BLOCKS.map((b) => (b.id === 0 ? '' : drawBlockIcon(game.atlasCanvas, b.id, 48)));
    this.bindKeys();
    if (this.isTouch) this.buildTouch();
    this.show('title');
  }

  // ---------------------------------------------------------------- screens
  private show(s: Screen) {
    this.screen = s;
    this.screenEl.innerHTML = '';
    this.screenEl.className = 'screen' + (this.inGame ? ' dim' : ' title');
    const bg = this.screenEl.style.backgroundImage;
    if (this.inGame) this.screenEl.style.backgroundImage = 'none';
    else if (bg === 'none') this.screenEl.style.backgroundImage = '';
    this.screenEl.classList.toggle('hidden', s === null);
    this.hud.classList.toggle('hidden', !this.inGame);
    this.hotbarEl.classList.toggle('hidden', !this.inGame);
    this.touchEl.classList.toggle('hidden', !(this.inGame && this.isTouch && s === null));
    if (s === null) return;
    const panel = this.buildScreen(s);
    this.screenEl.append(panel);
    const first = panel.querySelector('input[type=text], button.primary') as HTMLElement | null;
    first?.focus();
  }

  private buildScreen(s: Exclude<Screen, null>): HTMLElement {
    switch (s) {
      case 'title': return this.titleScreen();
      case 'new': return this.newWorldScreen();
      case 'continue': return this.continueScreen();
      case 'settings': return this.settingsScreen();
      case 'controls': return this.controlsScreen();
      case 'pause': return this.pauseScreen();
      case 'palette': return this.paletteScreen();
    }
  }

  private titleScreen() {
    const worlds = listWorlds(this.storage);
    return h('div', { class: 'panel' },
      h('div', { class: 'brand' },
        h('div', { class: 'mark' }, h('i'), 'openworld · sandbox'),
        h('h1', { html: 'openworld <span>blocks</span>' }),
        h('p', {}, 'Build anything, block by block. Infinite terrain, right in your browser.'),
      ),
      h('div', { class: 'body' },
        h('button', { class: 'primary', onclick: () => this.show('new') }, 'New world', h('span', { class: 'k' }, '→')),
        h('button', { onclick: () => this.show('continue'), disabled: worlds.length === 0 }, 'Continue', h('span', { class: 'k' }, worlds.length + ' saved')),
        h('div', { class: 'row' },
          h('button', { onclick: () => { this.returnTo = 'title'; this.show('settings'); } }, 'Settings'),
          h('button', { onclick: () => { this.returnTo = 'title'; this.show('controls'); } }, 'Controls'),
        ),
      ),
      h('footer', {}, h('span', {}, 'v0.1 · MIT'), h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'Source on GitHub ↗')),
    );
  }

  private newWorldScreen() {
    const n = listWorlds(this.storage).length + 1;
    const name = h('input', { type: 'text', value: 'World ' + n, maxlength: 40 }) as HTMLInputElement;
    const seed = h('input', { type: 'text', placeholder: 'random', maxlength: 40 }) as HTMLInputElement;
    const create = () => {
      const seedStr = seed.value.trim() || randomSeedString();
      const now = Date.now();
      const state: WorldState = {
        version: 1, id: newWorldId(), name: name.value.trim() || 'World ' + n, seed: seedStr,
        created: now, lastPlayed: now, time: 0.04, player: null, hotbar: [], edits: new Map(),
      };
      this.startWorld(state);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') create(); };
    name.addEventListener('keydown', onKey);
    seed.addEventListener('keydown', onKey);
    return h('div', { class: 'panel' },
      h('header', {}, h('h2', {}, 'New world'), h('span', { class: 'tag' }, 'creative')),
      h('div', { class: 'body' },
        h('label', { class: 'field' }, 'World name', name),
        h('label', { class: 'field' }, 'Seed (text or number, blank = random)', seed),
        h('div', { class: 'row' },
          h('button', { onclick: () => this.show('title') }, '← Back'),
          h('button', { class: 'primary', onclick: create }, 'Create world', h('span', { class: 'k' }, '↵')),
        ),
      ),
    );
  }

  private continueScreen() {
    const worlds = listWorlds(this.storage);
    const list = h('div', { class: 'worlds' });
    for (const w of worlds) {
      list.append(h('div', { class: 'w' },
        h('div', { html: `<b>${escapeHtml(w.name)}</b><small>seed ${escapeHtml(w.seed)} · ${timeAgo(w.lastPlayed)}</small>` }),
        h('button', { class: 'small primary', onclick: () => {
          const st = loadWorld(this.storage, w.id);
          if (st) this.startWorld(st); else this.toast('Save is corrupted');
        } }, 'Play'),
        h('button', { class: 'small', onclick: () => {
          if (confirm(`Delete “${w.name}”? This cannot be undone.`)) { deleteWorld(this.storage, w.id); this.show('continue'); }
        } }, 'Delete'),
      ));
    }
    return h('div', { class: 'panel wide' },
      h('header', {}, h('h2', {}, 'Saved worlds'), h('span', { class: 'tag' }, worlds.length + ' total')),
      h('div', { class: 'body' },
        worlds.length ? list : h('div', { class: 'empty' }, 'No saved worlds yet.'),
        h('button', { onclick: () => this.show('title') }, '← Back'),
      ),
    );
  }

  private slider(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, on: (v: number) => void) {
    const v = h('span', { class: 'v' }, fmt(value));
    const input = h('input', { type: 'range', min, max, step, value }) as HTMLInputElement;
    input.addEventListener('input', () => { const n = Number(input.value); v.textContent = fmt(n); on(n); });
    return h('div', { class: 'slider' }, h('span', {}, label), v, input);
  }

  private settingsScreen() {
    const s = this.settings;
    const commit = () => { saveSettings(s); this.game.applySettings(s); setSoundEnabled(s.sound); };
    const fps = h('input', { type: 'checkbox' }) as HTMLInputElement;
    fps.checked = s.showFps;
    fps.addEventListener('change', () => { s.showFps = fps.checked; commit(); });
    const snd = h('input', { type: 'checkbox' }) as HTMLInputElement;
    snd.checked = s.sound;
    snd.addEventListener('change', () => { s.sound = snd.checked; commit(); });
    return h('div', { class: 'panel' },
      h('header', {}, h('h2', {}, 'Settings'), h('span', { class: 'tag' }, 'saved locally')),
      h('div', { class: 'body' },
        this.slider('Render distance', 2, 16, 1, s.renderDistance, (v) => v + ' chunks', (v) => { s.renderDistance = v; commit(); }),
        this.slider('Mouse sensitivity', 0.2, 3, 0.05, s.sensitivity, (v) => v.toFixed(2) + '×', (v) => { s.sensitivity = v; commit(); }),
        this.slider('Field of view', 50, 110, 1, s.fov, (v) => v + '°', (v) => { s.fov = v; commit(); }),
        h('label', { class: 'check' }, fps, 'Show FPS & debug info (F3)'),
        h('label', { class: 'check' }, snd, 'Sound effects'),
        h('button', { onclick: () => this.show(this.returnTo) }, '← Back'),
      ),
    );
  }

  private controlsScreen() {
    const rows: Array<[string, string]> = [
      ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move'],
      ['Mouse', 'Look around'],
      ['<kbd>Space</kbd>', 'Jump · swim up · fly up'],
      ['<kbd>Shift</kbd> or double-tap <kbd>W</kbd>', 'Sprint (fly: Shift descends)'],
      ['<kbd>F</kbd>', 'Toggle flying'],
      ['Left click', 'Break block'],
      ['Right click', 'Place block'],
      ['Middle click', 'Pick targeted block'],
      ['<kbd>1</kbd>–<kbd>9</kbd> · wheel', 'Select hotbar slot'],
      ['<kbd>E</kbd>', 'Block palette'],
      ['<kbd>F3</kbd>', 'FPS & debug info'],
      ['<kbd>Esc</kbd>', 'Pause menu'],
    ];
    const t = h('table', { class: 'keys' });
    for (const [k, v] of rows) t.append(h('tr', { html: `<td>${k}</td><td>${v}</td>` }));
    return h('div', { class: 'panel wide' },
      h('header', {}, h('h2', {}, 'Controls'), h('span', { class: 'tag' }, 'keyboard + mouse')),
      h('div', { class: 'body' }, t,
        h('div', { class: 'empty' }, 'On touch screens: left stick moves, drag right side to look, buttons to jump, fly, break and place.'),
        h('button', { onclick: () => this.show(this.returnTo) }, '← Back')),
    );
  }

  private pauseScreen() {
    return h('div', { class: 'panel' },
      h('header', {}, h('h2', {}, 'Paused'), h('span', { class: 'tag' }, escapeHtml(this.game.state?.name ?? ''))),
      h('div', { class: 'body' },
        h('button', { class: 'primary', onclick: () => this.resume() }, 'Resume', h('span', { class: 'k' }, 'click')),
        h('div', { class: 'row' },
          h('button', { onclick: () => { this.returnTo = 'pause'; this.show('settings'); } }, 'Settings'),
          h('button', { onclick: () => { this.returnTo = 'pause'; this.show('controls'); } }, 'Controls'),
        ),
        h('button', { onclick: () => { this.game.save(); this.toast('World saved'); } }, 'Save now'),
        h('button', { onclick: () => this.quit() }, 'Save & quit to title'),
      ),
      h('footer', {}, h('span', {}, 'seed ' + escapeHtml(this.game.state?.seed ?? '')), h('span', {}, 'autosaves every 5 s')),
    );
  }

  private paletteScreen() {
    const grid = h('div', { class: 'palette' });
    for (const id of PLACEABLE) {
      grid.append(h('div', { class: 'p', title: BLOCKS[id].name, onclick: () => { this.game.setSlotBlock(id); this.resume(); } },
        h('img', { src: this.icons[id], alt: '' }), BLOCKS[id].name));
    }
    return h('div', { class: 'panel wide' },
      h('header', {}, h('h2', {}, 'Blocks'), h('span', { class: 'tag' }, 'sets hotbar slot ' + (this.game.selected + 1))),
      h('div', { class: 'body' }, grid, h('button', { onclick: () => this.resume() }, 'Close', h('span', { class: 'k' }, 'E'))),
    );
  }

  // ---------------------------------------------------------------- flow
  private startWorld(state: WorldState) {
    this.inGame = true;
    this.loadingEl.classList.remove('hidden');
    this.game.start(state);
    this.show(null);
    this.resume();
  }

  private resume() {
    this.show(null);
    if (this.isTouch) { this.game.setPaused(false); return; }
    this.game.requestLock();
  }

  private quit() {
    this.game.stop();
    this.inGame = false;
    this.loadingEl.classList.add('hidden');
    this.hooks.onDebug(null);
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('title');
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.inGame) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyE') {
        if (this.screen === 'palette') { this.resume(); return; }
        if (this.screen === null) {
          this.show('palette');
          if (document.pointerLockElement) document.exitPointerLock();
          this.game.setPaused(true);
        }
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        // Without pointer lock (touch / blocked), Esc toggles the pause menu ourselves.
        if (this.screen === null && !document.pointerLockElement) { this.game.setPaused(true); this.show('pause'); }
        else if (this.screen === 'palette') this.show('pause');
      }
    });
  }

  private renderHotbar(slots: number[], sel: number) {
    const sig = slots.join(',') + ':' + sel;
    if (sig === this.lastHotbar) return;
    const prevSel = this.lastHotbar.split(':')[1];
    this.lastHotbar = sig;
    this.hotbarEl.innerHTML = '';
    slots.forEach((id, i) => {
      const slot = h('div', { class: 'slot' + (i === sel ? ' sel' : ''), onclick: () => this.game.selectSlot(i) },
        h('span', { class: 'n' }, String(i + 1)), h('img', { src: this.icons[id] || '', alt: BLOCKS[id]?.name ?? '' }));
      this.hotbarEl.append(slot);
    });
    if (prevSel !== undefined) {
      this.nameEl.textContent = BLOCKS[slots[sel]]?.name ?? '';
      this.nameEl.style.opacity = '1';
      clearTimeout(this.nameTimer);
      this.nameTimer = window.setTimeout(() => (this.nameEl.style.opacity = '0'), 1200);
    }
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
  }

  // ---------------------------------------------------------------- touch
  private buildTouch() {
    const g = () => this.game;
    const stick = h('div', { class: 'stick' }, h('i'));
    const knob = stick.firstChild as HTMLElement;
    let sid: number | null = null;
    const setDir = (dx: number, dy: number) => {
      const t = 0.3;
      g().setKey('KeyW', dy < -t); g().setKey('KeyS', dy > t);
      g().setKey('KeyA', dx < -t); g().setKey('KeyD', dx > t);
    };
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(e.pointerId); });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      const r = stick.getBoundingClientRect();
      let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      let dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      setDir(dx, dy);
    });
    const end = () => { sid = null; knob.style.transform = ''; setDir(0, 0); };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);

    // Look: drag anywhere on the canvas
    const canvas = document.getElementById('game')!;
    let lid: number | null = null, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      g().look(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => { if (e.pointerId === lid) lid = null; });

    const hold = (label: string, down: () => void, up?: () => void) => {
      const b = h('button', {}, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
      b.addEventListener('pointerup', () => up?.());
      b.addEventListener('pointerleave', () => up?.());
      return b;
    };
    const btns = h('div', { class: 'btns' },
      hold('BREAK', () => g().breakBlock()),
      hold('PLACE', () => g().placeBlock()),
      hold('FLY', () => g().toggleFly()),
      hold('JUMP', () => g().setKey('Space', true), () => g().setKey('Space', false)),
      hold('DOWN', () => g().setKey('ShiftLeft', true), () => g().setKey('ShiftLeft', false)),
      hold('BLOCKS', () => { this.show('palette'); g().setPaused(true); }),
    );
    const menu = h('button', { class: 'menu small', onclick: () => { g().setPaused(true); this.show('pause'); } }, 'Menu');
    this.touchEl.append(stick, btns, menu);
  }
}
