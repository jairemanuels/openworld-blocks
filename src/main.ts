import './style.css';
import { Game } from './game';
import { UI } from './ui';
import { loadSettings } from './settings';
import { MemoryStorage, type KVStorage } from './save';

function pickStorage(): KVStorage {
  try {
    const k = '__owb_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return new MemoryStorage();
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const root = document.getElementById('ui') as HTMLDivElement;
const settings = loadSettings();
const storage = pickStorage();

try {
  const ui = new UI(root, settings, storage);
  const game = new Game(canvas, settings, storage, ui.hooks);
  ui.attach(game);
  (window as any).owb = { game, ui };
} catch (err) {
  console.error(err);
  root.innerHTML = '<div class="screen"><div class="panel"><header><h2>Could not start</h2></header><div class="body">Your browser could not create a WebGL context. Try a recent desktop browser with hardware acceleration enabled.</div></div></div>';
}
