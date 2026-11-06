// 코드 해석 · 운지 계산 엔진 (브라우저/Node 공용, 외부 의존성 없음)

export const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 음정(반음) → 역할 이름
const INTERVAL_LABEL = { 0: "R", 1: "b9", 2: "9", 3: "m3", 4: "3", 5: "11", 6: "b5", 7: "5", 8: "#5", 9: "6", 10: "b7", 11: "7" };

// 코드 품질 정의: req = 반드시 있어야 할 음, opt = 생략 가능한 음
// 표기 별칭은 정규화된 키로 매핑
const QUALITIES = {
  "": { name: "메이저", req: [0, 4], opt: [7] },
  "m": { name: "마이너", req: [0, 3], opt: [7] },
  "5": { name: "파워코드", req: [0, 7], opt: [] },
  "7": { name: "도미넌트 7", req: [0, 4, 10], opt: [7] },
  "maj7": { name: "메이저 7", req: [0, 4, 11], opt: [7] },
  "m7": { name: "마이너 7", req: [0, 3, 10], opt: [7] },
  "mmaj7": { name: "마이너 메이저 7", req: [0, 3, 11], opt: [7] },
  "6": { name: "식스", req: [0, 4, 9], opt: [7] },
  "m6": { name: "마이너 식스", req: [0, 3, 9], opt: [7] },
  "69": { name: "식스나인", req: [0, 4, 9, 2], opt: [7] },
  "dim": { name: "디미니시", req: [0, 3, 6], opt: [] },
  "dim7": { name: "디미니시 7", req: [0, 3, 6, 9], opt: [] },
  "m7b5": { name: "하프 디미니시", req: [0, 3, 6, 10], opt: [] },
  "aug": { name: "오그먼트", req: [0, 4, 8], opt: [] },
  "aug7": { name: "오그먼트 7", req: [0, 4, 8, 10], opt: [] },
  "sus2": { name: "서스2", req: [0, 2], opt: [7] },
  "sus4": { name: "서스4", req: [0, 5], opt: [7] },
  "7sus4": { name: "7 서스4", req: [0, 5, 10], opt: [7] },
  "add9": { name: "애드나인", req: [0, 4, 2], opt: [7] },
  "madd9": { name: "마이너 애드나인", req: [0, 3, 2], opt: [7] },
  "9": { name: "나인스", req: [0, 4, 10, 2], opt: [7] },
  "maj9": { name: "메이저 나인스", req: [0, 4, 11, 2], opt: [7] },
  "m9": { name: "마이너 나인스", req: [0, 3, 10, 2], opt: [7] },
  "7b9": { name: "7 플랫나인", req: [0, 4, 10, 1], opt: [7] },
  "7#9": { name: "7 샵나인", req: [0, 4, 10, 3], opt: [7] },
  "11": { name: "일레븐스", req: [0, 10, 5], opt: [7, 2, 4] },
  "m11": { name: "마이너 일레븐스", req: [0, 3, 10, 5], opt: [7, 2] },
  "13": { name: "써틴스", req: [0, 4, 10, 9], opt: [7, 2] },
  "maj13": { name: "메이저 써틴스", req: [0, 4, 11, 9], opt: [7, 2] },
  "m13": { name: "마이너 써틴스", req: [0, 3, 10, 9], opt: [7, 2] },
};

const ALIASES = {
  "": "", "M": "", "maj": "", "major": "",
  "m": "m", "min": "m", "-": "m", "minor": "m",
  "5": "5",
  "7": "7", "dom7": "7",
  "maj7": "maj7", "M7": "maj7", "Maj7": "maj7", "Δ": "maj7", "Δ7": "maj7", "ma7": "maj7",
  "m7": "m7", "min7": "m7", "-7": "m7",
  "mmaj7": "mmaj7", "mM7": "mmaj7", "m(maj7)": "mmaj7", "minmaj7": "mmaj7", "-maj7": "mmaj7",
  "6": "6", "m6": "m6", "min6": "m6",
  "69": "69", "6/9": "69", "6add9": "69",
  "dim": "dim", "o": "dim", "°": "dim",
  "dim7": "dim7", "o7": "dim7", "°7": "dim7",
  "m7b5": "m7b5", "m7-5": "m7b5", "ø": "m7b5", "ø7": "m7b5", "min7b5": "m7b5",
  "aug": "aug", "+": "aug", "#5": "aug",
  "aug7": "aug7", "+7": "aug7", "7#5": "aug7", "7+5": "aug7", "7aug": "aug7",
  "sus2": "sus2", "sus4": "sus4", "sus": "sus4",
  "7sus4": "7sus4", "7sus": "7sus4",
  "add9": "add9", "add2": "add9", "2": "add9",
  "madd9": "madd9", "m(add9)": "madd9", "madd2": "madd9",
  "9": "9", "maj9": "maj9", "M9": "maj9", "m9": "m9", "min9": "m9",
  "7b9": "7b9", "7-9": "7b9", "7#9": "7#9", "7+9": "7#9",
  "11": "11", "m11": "m11", "min11": "m11",
  "13": "13", "maj13": "maj13", "M13": "maj13", "m13": "m13", "min13": "m13",
};

function parseNote(str) {
  const m = /^([A-Ga-g])([#♯b♭]?)/.exec(str);
  if (!m) return null;
  let pc = LETTER_PC[m[1].toUpperCase()];
  if (m[2] === "#" || m[2] === "♯") pc += 1;
  if (m[2] === "b" || m[2] === "♭") pc -= 1;
  return { pc: (pc + 12) % 12, len: m[0].length, flat: m[2] === "b" || m[2] === "♭", text: m[1].toUpperCase() + (m[2] ? (m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : m[2]) : "") };
}

/** "Am7", "F#m7b5", "G/B", "C add9" 등 → 코드 객체. 실패 시 null */
export function parseChord(input) {
  if (!input) return null;
  const s = String(input).trim().replace(/\s+/g, "").replace(/♯/g, "#").replace(/♭/g, "b");
  const root = parseNote(s);
  if (!root) return null;
  let rest = s.slice(root.len);
  let bass = null;
  // 6/9 는 슬래시 코드가 아님
  const slash = rest.replace("6/9", "69").lastIndexOf("/");
  if (slash >= 0) {
    const bassStr = rest.replace("6/9", "69").slice(slash + 1);
    const b = parseNote(bassStr);
    if (!b || b.len !== bassStr.length) return null;
    bass = b;
    rest = rest.replace("6/9", "69").slice(0, slash);
  }
  const has = (k) => Object.prototype.hasOwnProperty.call(ALIASES, k);
  let key;
  if (has(rest)) key = ALIASES[rest];
  // 대문자 M 은 메이저 의미이므로 소문자화 대상에서 제외 (예: SUS4 → sus4, MAJ7 → maj7 은 허용)
  else if (!/^M(?!AJ)/.test(rest) && has(rest.toLowerCase())) key = ALIASES[rest.toLowerCase()];
  if (key === undefined) return null;
  const q = QUALITIES[key];
  const useFlat = root.flat || !!bass?.flat;
  const names = useFlat ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const intervals = [...q.req, ...q.opt];
  const tones = intervals.map(i => ({ pc: (root.pc + i) % 12, interval: i, label: INTERVAL_LABEL[i], name: names[(root.pc + i) % 12], required: q.req.includes(i) }));
  // 정렬: 근음부터 음정 순서
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  tones.sort((a, b) => order.indexOf(a.interval) - order.indexOf(b.interval));
  return {
    symbol: root.text + (key === "" ? "" : key === "mmaj7" ? "m(maj7)" : key === "69" ? "6/9" : key) + (bass ? "/" + bass.text : ""),
    root: root.pc,
    rootName: root.text,
    quality: key,
    qualityName: q.name,
    bass: bass ? bass.pc : root.pc,
    bassName: bass ? bass.text : root.text,
    tones,
    required: [...new Set(q.req.map(i => (root.pc + i) % 12))],
    optional: q.opt.map(i => (root.pc + i) % 12),
    useFlat,
  };
}

export function noteName(pc, useFlat = false) {
  return (useFlat ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[((pc % 12) + 12) % 12];
}

export function midiName(midi, useFlat = false) {
  return noteName(midi, useFlat) + (Math.floor(midi / 12) - 1);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 이조: 코드 기호를 semitones만큼 이동 (카포 모양 이름 표시용) */
export function transposeSymbol(chord, semitones) {
  const r = noteName(chord.root + semitones, chord.useFlat);
  const q = chord.symbol.slice(chord.rootName.length).split("/")[0];
  const b = chord.bass !== chord.root ? "/" + noteName(chord.bass + semitones, chord.useFlat) : "";
  return r + q + b;
}

function fingerCount(frets) {
  const fretted = frets.map((f, i) => ({ f, i })).filter(x => x.f > 0);
  if (fretted.length === 0) return { fingers: 0, barre: null };
  const min = Math.min(...fretted.map(x => x.f));
  const atMin = fretted.filter(x => x.f === min);
  if (atMin.length >= 2) {
    // 바레: 가장 낮은 바레 줄부터 위쪽 줄 중 개방현이 없어야 함
    const from = atMin[0].i;
    const to = atMin[atMin.length - 1].i;
    const blocked = frets.slice(from, to + 1).some(f => f === 0);
    if (!blocked) {
      const others = fretted.filter(x => x.f !== min).length;
      return { fingers: 1 + others, barre: { fret: min, from, to } };
    }
  }
  return { fingers: fretted.length, barre: null };
}

/**
 * 운지 목록 계산
 * @param chord parseChord 결과
 * @param tuning 개방현 MIDI 번호 배열 (낮은 줄 → 높은 줄)
 * @param opts { capo, maxFret, limit }
 * 반환 frets 는 카포 기준 상대 프렛 (-1 = 뮤트, 0 = 개방/카포)
 */
export function findVoicings(chord, tuning, opts = {}) {
  const capo = opts.capo || 0;
  const maxFret = opts.maxFret ?? 15;
  const limit = opts.limit ?? 10;
  const open = tuning.map(m => m + capo);
  const n = open.length;
  const chordPcs = new Set([...chord.required, ...chord.optional, chord.bass]);
  const minSounded = Math.min(n, chord.required.length <= 2 && chord.quality === "5" ? 2 : 3);
  const results = new Map();

  for (let base = 1; base <= maxFret - 3; base++) {
    const options = open.map(o => {
      const opt = [-1];
      if (chordPcs.has(o % 12)) opt.push(0);
      for (let f = base; f <= base + 3; f++) if (chordPcs.has((o + f) % 12)) opt.push(f);
      return opt;
    });
    const frets = new Array(n);
    const rec = (s) => {
      if (s === n) { evaluate(frets.slice()); return; }
      for (const f of options[s]) { frets[s] = f; rec(s + 1); }
    };
    rec(0);
  }

  function evaluate(frets) {
    const sounded = frets.map((f, i) => (f >= 0 ? { i, midi: open[i] + f } : null)).filter(Boolean);
    if (sounded.length < minSounded) return;
    const lowest = sounded.reduce((a, b) => (b.midi < a.midi ? b : a));
    if (lowest.midi % 12 !== chord.bass) return;
    const pcs = new Set(sounded.map(x => x.midi % 12));
    for (const r of chord.required) if (!pcs.has(r)) return;
    if (!pcs.has(chord.bass)) return;
    const fretted = frets.filter(f => f > 0);
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    if (span > 3) return;
    const { fingers, barre } = fingerCount(frets);
    if (fingers > 4) return;
    // 뮤트 위치: 저음쪽 연속 뮤트는 자연스러움, 중간/고음쪽 뮤트는 감점
    const firstSound = frets.findIndex(f => f >= 0);
    let interiorMutes = 0, topMutes = 0;
    let lastSound = n - 1; while (frets[lastSound] < 0) lastSound--;
    for (let i = firstSound; i <= lastSound; i++) if (frets[i] < 0) interiorMutes++;
    topMutes = n - 1 - lastSound;
    if (interiorMutes > 1) return;
    const bassMutes = firstSound;
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const missingOpt = chord.optional.filter(p => !pcs.has(p)).length;
    const openCount = frets.filter(f => f === 0).length;
    let score = 0;
    score += bassMutes * 1.6 + interiorMutes * 5 + topMutes * 3.5;
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    score += minF * 0.55 + [0, 0.6, 1.4, 3.2][span] + fingers * 0.4;
    // 개방현을 쓰면서 높은 프렛을 누르는 어색한 모양 감점
    if (openCount > 0 && maxF >= 4) score += (maxF - 3) * 3;
    if (bassMutes >= 3) score += 2;
    score += barre ? 1.2 : 0;
    score += missingOpt * 1.5;
    score -= openCount * (minF <= 3 ? 0.35 : 0);
    // 같은 음이 3번 이상 겹치면 소폭 감점
    const counts = {}; sounded.forEach(x => { counts[x.midi % 12] = (counts[x.midi % 12] || 0) + 1; });
    score += Object.values(counts).filter(c => c >= 3).length * 0.4;
    const key = frets.join(",");
    if (!results.has(key)) results.set(key, { frets, fingers, barre, score, notes: frets.map((f, i) => (f >= 0 ? open[i] + f : null)) });
  }

  let list = [...results.values()].sort((a, b) => a.score - b.score);
  // 거의 같은 모양(한 줄만 다르고 같은 포지션) 은 중복 제거해 다양성 확보
  const picked = [];
  for (const v of list) {
    const pos = Math.min(...v.frets.filter(f => f > 0), 99);
    const similar = picked.find(p => {
      const ppos = Math.min(...p.frets.filter(f => f > 0), 99);
      const diff = p.frets.filter((f, i) => f !== v.frets[i]).length;
      return Math.abs(ppos - pos) <= 1 && diff <= 1;
    });
    if (!similar) picked.push(v);
    if (picked.length >= limit) break;
  }
  return picked.map(v => ({ ...v, fingersMap: assignFingers(v.frets, v.barre) }));
}

/** 손가락 번호(1~4) 배정 */
function assignFingers(frets, barre) {
  const map = frets.map(f => (f > 0 ? 0 : null));
  let finger = 1;
  if (barre) {
    for (let i = barre.from; i <= barre.to; i++) if (frets[i] === barre.fret) map[i] = 1;
    finger = 2;
  }
  const rest = frets.map((f, i) => ({ f, i })).filter(x => x.f > 0 && map[x.i] === 0)
    .sort((a, b) => a.f - b.f || a.i - b.i);
  for (const x of rest) map[x.i] = Math.min(4, finger++);
  return map;
}

export const TUNINGS = {
  guitar: [
    { id: "std", name: "표준 (EADGBE)", notes: [40, 45, 50, 55, 59, 64] },
    { id: "dropd", name: "드롭 D (DADGBE)", notes: [38, 45, 50, 55, 59, 64] },
    { id: "half", name: "반음 다운 (Eb)", notes: [39, 44, 49, 54, 58, 63] },
    { id: "whole", name: "한음 다운 (D)", notes: [38, 43, 48, 53, 57, 62] },
    { id: "dadgad", name: "DADGAD", notes: [38, 45, 50, 55, 57, 62] },
    { id: "openg", name: "오픈 G (DGDGBD)", notes: [38, 43, 50, 55, 59, 62] },
    { id: "opend", name: "오픈 D (DADF#AD)", notes: [38, 45, 50, 54, 57, 62] },
  ],
};

export const QUALITY_CHIPS = ["", "m", "7", "maj7", "m7", "sus4", "sus2", "add9", "dim", "aug", "6", "9", "m7b5", "5"];
