// 마이크 튜너: 음정 감지 (정규화 자기상관, McLeod 방식 간소화)

/** 2배 다운샘플(평균) — 계산량을 1/4로 줄이고 고음 잡음을 걸러냄 */
function decimate(buf) {
  const out = new Float32Array(Math.floor(buf.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);
  return out;
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/** 버퍼에서 기본 주파수(Hz) 추정. 소리가 없거나 불확실하면 null */
export function detectPitch(input, sampleRate, minHz = 55, maxHz = 1000, minRms = 0.0015) {
  let buf = input, sr = sampleRate;
  while (sr > 30000) { buf = decimate(buf); sr /= 2; }
  const n = buf.length;
  // 직류 성분 제거
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf[i] - mean;
  if (rms(x) < minRms) return null;

  const minLag = Math.max(2, Math.floor(sr / maxHz));
  const maxLag = Math.min(Math.ceil(sr / minHz), Math.floor(n / 2));
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < n - lag; i++) {
      ac += x[i] * x[i + lag];
      m += x[i] * x[i] + x[i + lag] * x[i + lag];
    }
    nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
  }
  // 양의 구간마다 최대 피크 수집 후, 최고 피크의 90% 이상인 첫 피크 선택 (옥타브 오류 방지)
  const peaks = [];
  let lag = minLag;
  while (lag <= maxLag && nsdf[lag] > 0) lag++; // 0 지연 부근 양수 구간 건너뜀
  while (lag <= maxLag) {
    while (lag <= maxLag && nsdf[lag] <= 0) lag++;
    let best = -1, bestLag = -1;
    while (lag <= maxLag && nsdf[lag] > 0) {
      if (nsdf[lag] > best) { best = nsdf[lag]; bestLag = lag; }
      lag++;
    }
    if (bestLag > 0) peaks.push({ lag: bestLag, v: best });
  }
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map((p) => p.v));
  if (top < 0.5) return null;
  const pick = peaks.find((p) => p.v >= top * 0.9);
  // 포물선 보간
  const l = pick.lag;
  const a = nsdf[l - 1], b = nsdf[l], c = nsdf[l + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return sr / (l + shift);
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * 들린 주파수를 기타 줄 기준으로 해석
 * @param tuning 개방현 MIDI (낮은 줄 → 높은 줄)
 * @param lockedIdx 고정한 줄 인덱스 (null = 자동으로 가장 가까운 줄)
 * @returns { index, stringNo, targetMidi, cents, inTune, direction: "ok"|"low"|"high" }
 */
export function analyzeString(freq, tuning, lockedIdx = null) {
  const midi = freqToMidi(freq);
  let index = lockedIdx;
  if (index === null || index === undefined) {
    index = 0;
    tuning.forEach((m, i) => { if (Math.abs(m - midi) < Math.abs(tuning[index] - midi)) index = i; });
  }
  const targetMidi = tuning[index];
  const cents = Math.round((midi - targetMidi) * 100);
  const inTune = Math.abs(cents) <= 5;
  return { index, stringNo: tuning.length - index, targetMidi, cents, inTune, direction: inTune ? "ok" : cents < 0 ? "low" : "high" };
}

/** "12센트 높아요", "반음 2개 + 30센트 낮아요" 같은 문장 */
export function describeOffset(cents) {
  const a = Math.abs(cents);
  if (a <= 5) return "정확해요";
  const word = cents < 0 ? "낮아요" : "높아요";
  if (a < 100) return `${a}센트 ${word}`;
  const semis = Math.floor(a / 100), rest = a % 100;
  return `반음 ${semis}개${rest ? ` + ${rest}센트` : ""} ${word}`;
}

export class Tuner {
  /** onUpdate({ freq: number|null, level: 0~1 }) */
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.running = false;
  }

  /** 반드시 버튼 클릭 핸들러 안에서 바로 호출 (모바일 브라우저 오디오 잠금 해제) */
  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      const e = new Error("이 브라우저에서는 마이크를 쓸 수 없어요. Chrome이나 Safari로 열어 주세요.");
      e.code = "unsupported";
      throw e;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    // 사용자 동작 직후 동기적으로 만들고 resume 해야 휴대폰에서 '일시정지' 상태로 멈추지 않음
    this.ctx = new AC();
    const resumed = this.ctx.resume();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      this.ctx.close();
      throw e;
    }
    await resumed;
    if (this.ctx.state !== "running") await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.history = [];
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const level = Math.min(1, rms(this.buf) * 12);
      const f = detectPitch(this.buf, this.ctx.sampleRate);
      if (f) {
        // 직전 값과 반음 이상 튀면 새 소리로 보고 기록 초기화
        const last = this.history[this.history.length - 1];
        if (last && Math.abs(freqToMidi(f) - freqToMidi(last)) > 0.7) this.history = [];
        this.history.push(f);
        if (this.history.length > 5) this.history.shift();
        const sorted = [...this.history].sort((x, y) => x - y);
        this.onUpdate({ freq: sorted[Math.floor(sorted.length / 2)], level });
      } else {
        this.history = [];
        this.onUpdate({ freq: null, level });
      }
      this.timer = setTimeout(loop, 50);
    };
    loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
  }
}
