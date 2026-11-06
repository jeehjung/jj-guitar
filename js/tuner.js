// 마이크 튜너: 음정 감지 (정규화 자기상관, McLeod 방식 간소화)

/** 버퍼에서 기본 주파수(Hz) 추정. 소리가 없거나 불확실하면 null */
export function detectPitch(buf, sampleRate, minHz = 27, maxHz = 1400) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return null;

  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < n - lag; i++) {
      ac += buf[i] * buf[i + lag];
      m += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
    }
    nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
  }
  // 양의 구간마다 최대 피크 수집 후, 최고 피크의 90% 이상인 첫 피크 선택 (옥타브 오류 방지)
  const peaks = [];
  let lag = minLag;
  while (lag < maxLag && nsdf[lag] > 0) lag++; // 첫 양수 구간(0 지연 부근) 건너뜀
  while (lag < maxLag) {
    while (lag < maxLag && nsdf[lag] <= 0) lag++;
    let best = -1, bestLag = -1;
    while (lag < maxLag && nsdf[lag] > 0) {
      if (nsdf[lag] > best) { best = nsdf[lag]; bestLag = lag; }
      lag++;
    }
    if (bestLag > 0) peaks.push({ lag: bestLag, v: best });
  }
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map((p) => p.v));
  if (top < 0.6) return null;
  const pick = peaks.find((p) => p.v >= top * 0.9);
  // 포물선 보간
  const l = pick.lag;
  const a = nsdf[l - 1] ?? nsdf[l], b = nsdf[l], c = nsdf[l + 1] ?? nsdf[l];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return sampleRate / (l + shift);
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export class Tuner {
  constructor(onPitch) {
    this.onPitch = onPitch;
    this.running = false;
  }
  async start() {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.history = [];
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const f = detectPitch(this.buf, this.ctx.sampleRate);
      if (f) {
        this.history.push(f);
        if (this.history.length > 5) this.history.shift();
        const sorted = [...this.history].sort((x, y) => x - y);
        this.onPitch(sorted[Math.floor(sorted.length / 2)]);
      } else {
        this.history = [];
        this.onPitch(null);
      }
      this.raf = setTimeout(loop, 60);
    };
    loop();
  }
  stop() {
    this.running = false;
    clearTimeout(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
  }
}
