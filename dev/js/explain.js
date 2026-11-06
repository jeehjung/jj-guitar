// 코드 생성 원리 설명 (순수 함수, 브라우저/Node 공용)
import { noteName, transposeSymbol } from "./chords.js";

/** 음정(반음 수)을 코드 종류에 맞는 한국어 이름과 공식 기호로 */
export function intervalInfo(interval, quality) {
  const sus2 = quality === "sus2";
  const sus4 = quality === "sus4" || quality === "7sus4";
  const eleven = quality === "11" || quality === "m11";
  const thirteen = ["13", "maj13", "m13"].includes(quality);
  switch (interval) {
    case 0: return { ko: "근음", sym: "1", role: "r" };
    case 1: return { ko: "단9도", sym: "♭9", role: "ext" };
    case 2: return sus2 ? { ko: "장2도", sym: "2", role: "ext" } : { ko: "장9도 (=장2도)", sym: "9", role: "ext" };
    case 3: return quality === "7#9" ? { ko: "증9도", sym: "♯9", role: "ext" } : { ko: "단3도", sym: "♭3", role: "third" };
    case 4: return { ko: "장3도", sym: "3", role: "third" };
    case 5: return sus4 ? { ko: "완전4도", sym: "4", role: "ext" } : eleven ? { ko: "11도 (=완전4도)", sym: "11", role: "ext" } : { ko: "완전4도", sym: "4", role: "ext" };
    case 6: return { ko: "감5도", sym: "♭5", role: "fifth" };
    case 7: return { ko: "완전5도", sym: "5", role: "fifth" };
    case 8: return { ko: "증5도", sym: "♯5", role: "fifth" };
    case 9: return quality === "dim7" ? { ko: "감7도", sym: "♭♭7", role: "seventh" } : thirteen ? { ko: "13도 (=장6도)", sym: "13", role: "ext" } : { ko: "장6도", sym: "6", role: "seventh" };
    case 10: return { ko: "단7도", sym: "♭7", role: "seventh" };
    case 11: return { ko: "장7도", sym: "7", role: "seventh" };
    default: return { ko: "", sym: "", role: "ext" };
  }
}

const CHARACTER = {
  "": "근음 위에 장3도와 완전5도를 쌓은 가장 기본적인 화음이에요. 장3도 덕분에 밝고 안정된 소리가 나요.",
  m: "메이저에서 3도만 반음 내린 화음이에요. 단3도 하나 차이로 어둡고 차분한 느낌이 돼요.",
  "5": "3도가 없어서 장조인지 단조인지 정해지지 않는 소리예요. 록에서 많이 쓰는 파워코드예요.",
  "7": "메이저 화음에 단7도를 더했어요. 장3도와 단7도 사이의 긴장감 때문에 다음 코드로 넘어가고 싶은 느낌을 줘요.",
  maj7: "메이저 화음에 장7도를 더했어요. 근음 바로 아래 음이 함께 울려 부드럽고 세련된 느낌이에요.",
  m7: "마이너 화음에 단7도를 더했어요. 마이너보다 덜 무겁고 부드러워서 발라드·재즈에 자주 쓰여요.",
  mmaj7: "마이너 화음에 장7도를 더한 독특한 소리로, 긴장감 있는 분위기를 만들어요.",
  "6": "메이저 화음에 장6도를 더해 따뜻하고 여유로운 느낌이에요.",
  m6: "마이너 화음에 장6도를 더한 소리예요.",
  "69": "메이저 화음에 6도와 9도를 함께 더해 넓게 퍼지는 소리예요.",
  dim: "단3도를 두 번 쌓아 감5도가 생기는 화음이에요. 불안정해서 다른 코드로 이어주는 역할을 해요.",
  dim7: "단3도를 세 번 쌓은 화음이라 네 음이 모두 같은 간격이에요. 긴장감이 아주 강해요.",
  m7b5: "디미니시 화음에 단7도를 더한 화음(하프 디미니시)으로, 마이너 키의 진행에서 자주 나와요.",
  aug: "장3도를 두 번 쌓아 5도가 반음 올라간 화음이에요. 붕 떠 있는 듯한 느낌을 줘요.",
  aug7: "오그먼트 화음에 단7도를 더한 소리예요.",
  sus2: "3도 대신 2도를 써서 장·단조가 정해지지 않은 열린 소리예요.",
  sus4: "3도 대신 4도를 써서 해결되지 않은 느낌을 줘요. 보통 다음에 메이저 코드로 돌아가요.",
  "7sus4": "sus4에 단7도를 더한 소리예요. 도미넌트 7 코드 전에 자주 쓰여요.",
  add9: "메이저 화음에 9도(한 옥타브 위의 2도)를 더해 반짝이는 느낌을 줘요.",
  madd9: "마이너 화음에 9도를 더해 몽환적인 느낌을 줘요.",
  "9": "도미넌트 7 코드에 9도를 더했어요. 펑크·블루스에서 많이 써요.",
  maj9: "메이저 7 코드에 9도를 더한 풍성하고 부드러운 소리예요.",
  m9: "마이너 7 코드에 9도를 더한 부드러운 소리예요.",
  "7b9": "도미넌트 7 코드에 반음 내린 9도를 더해 긴장감이 강해요.",
  "7#9": "도미넌트 7 코드에 반음 올린 9도를 더한 소리예요. 장3도와 단3도가 함께 울려 거친 블루스 느낌이에요.",
  "11": "도미넌트 7 코드 위에 11도를 쌓았어요. 기타에서는 3도를 빼고 치는 경우가 많아요.",
  m11: "마이너 7 코드 위에 11도를 쌓은 소리예요.",
  "13": "도미넌트 7 코드에 13도를 더했어요. 기타에서는 9도·11도를 보통 생략해요.",
  maj13: "메이저 7 코드에 13도를 더한 소리예요.",
  m13: "마이너 7 코드에 13도를 더한 소리예요.",
};

/**
 * @returns {{ formula, steps[], character, strings[], notes[] }}
 * strings: 낮은 줄(6번줄)부터 각 줄의 운지와 역할
 */
export function explainChord(chord, voicing, tuning, capo = 0) {
  const steps = chord.tones.map((t) => {
    const info = intervalInfo(t.interval, chord.quality);
    return { name: noteName(t.pc, chord.useFlat), semitones: t.interval, ...info, required: t.required };
  });
  const formula = steps.map((s) => s.sym).join(" – ");
  const out = { formula, steps, character: CHARACTER[chord.quality] || "", strings: [], notes: [] };
  if (!voicing) return out;

  const n = tuning.length;
  const sounded = [];
  voicing.frets.forEach((f, i) => {
    const stringNo = n - i;
    if (f < 0) { out.strings.push({ stringNo, fret: f, text: "치지 않음" }); return; }
    const midi = tuning[i] + capo + f;
    const pc = midi % 12;
    const interval = (pc - chord.root + 12) % 12;
    const info = intervalInfo(interval, chord.quality);
    sounded.push({ midi, pc, interval, info });
    out.strings.push({ stringNo, fret: f, note: noteName(pc, chord.useFlat), ko: info.ko, role: info.role, finger: voicing.fingersMap?.[i] || 0 });
  });

  // 최저음
  const lowest = sounded.reduce((a, b) => (b.midi < a.midi ? b : a));
  const lowName = noteName(lowest.pc, chord.useFlat);
  if (chord.bass !== chord.root) {
    out.notes.push(`가장 낮은 음을 ${lowName}로 잡는 분수 코드(${chord.symbol})예요. 기본 화음은 그대로 두고 베이스음만 바꿔 소리의 흐름을 부드럽게 이어줘요.`);
  } else {
    out.notes.push(`가장 낮은 음이 근음 ${lowName}라서 코드 이름 그대로의 기본형으로 들려요.`);
  }
  // 생략된 음
  const pcs = new Set(sounded.map((s) => s.pc));
  const omitted = steps.filter((s, i) => !pcs.has(chord.tones[i].pc));
  if (omitted.length) {
    out.notes.push(`${omitted.map((s) => `${s.ko} ${s.name}`).join(", ")}은(는) 이 운지에서 생략했어요. 손가락이 닿기 어려운 음을 빼도 코드의 성격을 정하는 근음·3도·7도가 남아 있으면 같은 코드로 들려요.`);
  }
  // 겹친 음
  const counts = {};
  sounded.forEach((s) => { counts[s.pc] = (counts[s.pc] || 0) + 1; });
  const doubled = Object.entries(counts).filter(([, c]) => c >= 2).map(([pc]) => {
    const interval = (Number(pc) - chord.root + 12) % 12;
    return `${intervalInfo(interval, chord.quality).ko} ${noteName(Number(pc), chord.useFlat)}`;
  });
  if (doubled.length) out.notes.push(`${doubled.join(", ")}은(는) 옥타브를 달리해 두 번 이상 울려서 소리를 풍성하게 만들어요.`);
  // 바레
  if (voicing.barre) out.notes.push(`검지로 ${voicing.barre.fret}프렛을 여러 줄 한꺼번에 누르는 바레 코드예요. 같은 모양을 그대로 옮기면 다른 근음의 같은 종류 코드가 돼요.`);
  // 카포
  if (capo) out.notes.push(`카포가 ${capo}프렛에서 모든 줄을 반음 ${capo}개만큼 올려 줘요. 그래서 ${transposeSymbol(chord, -capo)} 모양을 잡아도 실제로는 ${chord.symbol} 소리가 나요.`);
  return out;
}
