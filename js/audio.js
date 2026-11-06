// 기타 줄 튕김 소리 합성 (Karplus-Strong)
import { midiToFreq } from "./chords.js?v=79699ac";

let ctx = null;
const cache = new Map();

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function pluckBuffer(midi, seconds, bright) {
  const key = `${midi}:${seconds}:${bright}`;
  if (cache.has(key)) return cache.get(key);
  const ac = audio();
  const sr = ac.sampleRate;
  const freq = midiToFreq(midi);
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  // 저음일수록 감쇠를 느리게
  const decay = freq < 110 ? 0.998 : 0.996;
  const blend = bright;
  let idx = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    const next = ring[(idx + 1) % period];
    const v = decay * (blend * cur + (1 - blend) * 0.5 * (cur + next));
    ring[idx] = v;
    // 간단한 저역통과로 거친 고음 제거
    prev = prev + 0.6 * (cur - prev);
    out[i] = prev;
    idx = (idx + 1) % period;
  }
  // 끝부분 페이드아웃
  const fade = Math.floor(sr * 0.15);
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  cache.set(key, buf);
  return buf;
}

/** notes: MIDI 배열(낮은 줄부터, null 은 건너뜀). bass=true 면 더 길고 어두운 톤 */
export function strum(notes, { bass = false, gap = 0.035 } = {}) {
  const ac = audio();
  const master = ac.createGain();
  master.gain.value = bass ? 0.9 : 0.5;
  master.connect(ac.destination);
  const now = ac.currentTime + 0.02;
  notes.filter((n) => n != null).forEach((midi, i) => {
    const src = ac.createBufferSource();
    src.buffer = pluckBuffer(midi, bass ? 2.4 : 2.0, bass ? 0.15 : 0.35);
    src.connect(master);
    src.start(now + i * gap);
  });
}

export function pluckOne(midi, bass = false) {
  strum([midi], { bass });
}
