/** Tiny synthesized sound effects (WebAudio, no sample files). */
let ctx: AudioContext | null = null;
export let soundEnabled = true;
export function setSoundEnabled(v: boolean) { soundEnabled = v; }

function ac(): AudioContext | null {
  if (!soundEnabled) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(duration: number, freq: number, gain: number) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export function playBreak() { noiseBurst(0.16, 1400, 0.35); }
export function playPlace() {
  noiseBurst(0.07, 700, 0.4);
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.setValueAtTime(180, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(70, a.currentTime + 0.08);
  g.gain.setValueAtTime(0.18, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.1);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + 0.12);
}
export function playStep() { noiseBurst(0.05, 500, 0.08); }
