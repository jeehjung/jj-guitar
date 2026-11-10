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
  const r = analyzePitch(input, sampleRate, { minHz, maxHz, minRms });
  return r && r.clarity >= 0.5 ? r.freq : null;
}

/**
 * 주파수와 확신도(clarity 0~1) 반환. 소리가 너무 작거나 주기성이 없으면 null
 * acc 를 넘기면 이전 순간들의 자기상관을 누적(decay 비율로 감쇠)해 잡음 속 작은 소리도 또렷하게 찾음
 */
export function analyzePitch(input, sampleRate, { minHz = 55, maxHz = 1000, minRms = 0.0015, minClarity = 0.35, acc = null, decay = 0.7 } = {}) {
  let buf = input, sr = sampleRate;
  while (sr > 30000) { buf = decimate(buf); sr /= 2; }
  const n = buf.length;
  // 직류 성분 제거
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf[i] - mean;
  const level = rms(x);
  if (level < minRms) { if (acc) acc.reset = true; return null; }

  const minLag = Math.max(2, Math.floor(sr / maxHz));
  const maxLag = Math.min(Math.ceil(sr / minHz), Math.floor(n / 2));
  const AC = new Float64Array(maxLag + 2), M = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < n - lag; i++) {
      ac += x[i] * x[i + lag];
      m += x[i] * x[i] + x[i + lag] * x[i + lag];
    }
    // 크기를 정규화해 누적 (잦아드는 소리도 순간마다 같은 비중)
    const e = m || 1;
    AC[lag] = ac / e; M[lag] = m / e;
  }
  if (acc) {
    if (acc.reset || !acc.ac || acc.ac.length !== AC.length || acc.sr !== sr) {
      acc.ac = AC; acc.m = M; acc.sr = sr; acc.reset = false;
    } else {
      for (let i = 0; i < AC.length; i++) { acc.ac[i] = acc.ac[i] * decay + AC[i]; acc.m[i] = acc.m[i] * decay + M[i]; }
    }
  }
  const SA = acc ? acc.ac : AC, SM = acc ? acc.m : M;
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) nsdf[lag] = SM[lag] > 0 ? (2 * SA[lag]) / SM[lag] : 0;
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
  if (top < minClarity) return null;
  const pick = peaks.find((p) => p.v >= top * 0.9);
  // 포물선 보간
  const l = pick.lag;
  const a = nsdf[l - 1], b = nsdf[l], c = nsdf[l + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return { freq: sr / (l + shift), clarity: top, rms: level };
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

/** 감도 단계별 기준 — gateMul: 소음 대비 몇 배 이상이어야 듣는지, clarity: 음으로 인정할 또렷함 */
export const SENSITIVITY = {
  normal: { label: "보통", gateMul: 2.5, minGate: 0.0006, newClarity: 0.7, keepClarity: 0.6, agc: false, decay: 0.5 },
  high: { label: "높음", gateMul: 1.6, minGate: 0.00025, newClarity: 0.6, keepClarity: 0.5, agc: false, decay: 0.7 },
  max: { label: "최대", gateMul: 1.15, minGate: 0.0001, newClarity: 0.55, keepClarity: 0.42, agc: true, decay: 0.8 },
};

export class Tuner {
  /** onUpdate({ freq: number|null, level: 0~1, confident: boolean, weak: boolean }) */
  constructor(onUpdate, { sensitivity = "high", minHz = 55, maxHz = 1000 } = {}) {
    this.onUpdate = onUpdate;
    this.running = false;
    this.sens = SENSITIVITY[sensitivity] ? sensitivity : "high";
    this.range = { minHz, maxHz };
  }

  /** 찾을 음 범위 (튜닝·고정한 줄에 맞춰 좁히면 작은 소리에서 덜 헷갈림) */
  setRange(minHz, maxHz) {
    this.range = { minHz, maxHz };
    this.history = [];
    if (this.acc) this.acc.reset = true;
  }

  /** 감도 변경. '최대'는 휴대폰 마이크 자동 증폭도 켬 */
  setSensitivity(level) {
    if (!SENSITIVITY[level]) return;
    this.sens = level;
    const agc = SENSITIVITY[level].agc;
    const track = this.stream?.getAudioTracks()[0];
    track?.applyConstraints?.({ autoGainControl: agc, echoCancellation: false, noiseSuppression: false }).catch(() => {});
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
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: SENSITIVITY[this.sens].agc } });
    } catch (e) {
      this.ctx.close();
      throw e;
    }
    await resumed;
    if (this.ctx.state !== "running") await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    // 기타 음역 밖 잡음 제거 (저음 웅웅거림·고음 치찰음)
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 55; hp.Q.value = 0.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1300; lp.Q.value = 0.7;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 8192; // 약 0.17초 분량을 모아 작은 소리도 안정적으로 분석
    src.connect(hp); hp.connect(lp); lp.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.history = [];
    this.levels = []; // 최근 약 6초간 소리 크기 (주변 소음 바닥값 추정용)
    this.acc = { reset: true }; // 같은 음이 이어지는 동안 분석 결과 누적
    this.prevLevel = 0;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const level = rms(this.buf);
      // 주변 소음 = 최근 6초 중 가장 조용했던 순간의 크기. 줄 소리가 잦아드는 건 소음으로 보지 않음
      this.levels.push(level);
      if (this.levels.length > 120) this.levels.shift();
      const floor = Math.min(...this.levels);
      const S = SENSITIVITY[this.sens];
      const gate = Math.max(S.minGate, floor * S.gateMul);
      // 새로 튕긴 순간(소리가 갑자기 커짐)엔 누적을 비우고 새로 시작
      if (level > this.prevLevel * 1.8 && level > gate * 2) this.acc.reset = true;
      this.prevLevel = level;
      const r = analyzePitch(this.buf, this.ctx.sampleRate, { minRms: gate, minClarity: S.keepClarity, minHz: this.range.minHz, maxHz: this.range.maxHz, acc: this.acc, decay: S.decay });
      const last = this.history[this.history.length - 1];
      let f = null;
      if (r) {
        const near = last && Math.abs(freqToMidi(r.freq) - freqToMidi(last)) < 0.35;
        // 확신도가 충분하거나, 조금 낮아도 직전 결과와 같은 음이면 받아들임 (잦아드는 소리 끝까지 추적)
        if (r.clarity >= S.newClarity || (near && r.clarity >= S.keepClarity)) f = r.freq;
      }
      const meter = Math.min(1, Math.sqrt(level / 0.05));
      if (f) {
        if (last && Math.abs(freqToMidi(f) - freqToMidi(last)) > 0.7) { this.history = []; this.acc.reset = true; }
        this.history.push(f);
        if (this.history.length > 7) this.history.shift();
        const sorted = [...this.history].sort((x, y) => x - y);
        // confident: 소리가 또렷하고 여러 번 같은 값이 나왔을 때만 '맞음' 체크에 사용
        this.onUpdate({ freq: sorted[Math.floor(sorted.length / 2)], level: meter, confident: r.clarity >= 0.75 && this.history.length >= 3, weak: r.clarity < 0.65 });
      } else {
        this.onUpdate({ freq: null, level: meter });
        // 잠깐 끊겨도 같은 줄이면 이어서 쓰도록 바로 지우지 않음
        if (!r) this.history = this.history.slice(-2);
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
