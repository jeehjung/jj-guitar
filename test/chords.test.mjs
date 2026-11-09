import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChord, findVoicings, transposeSymbol, TUNINGS } from "../public/js/chords.js";

const std = TUNINGS.guitar[0].notes;
const shape = (v) => v.frets.map((f) => (f < 0 ? "x" : f)).join("");

test("코드 기호 해석", () => {
  assert.equal(parseChord("Am7").quality, "m7");
  assert.equal(parseChord("F#m7b5").rootName, "F#");
  assert.equal(parseChord("G/B").bassName, "B");
  assert.equal(parseChord("C6/9").quality, "69");
  assert.equal(parseChord("CM7").quality, "maj7");
  assert.equal(parseChord("Cmaj7").quality, "maj7");
  assert.equal(parseChord("Csus").quality, "sus4");
  assert.equal(parseChord("Bb").useFlat, true);
  assert.equal(parseChord("H"), null);
  assert.equal(parseChord("Cxyz"), null);
});

test("대표 오픈 코드가 첫 번째 운지로 나온다", () => {
  const expected = { C: "x32010", G: "320003", D: "xx0232", A: "x02220", E: "022100", Am: "x02210", Em: "022000", Dm: "xx0231", F: "133211", Bm: "x24432", Cmaj7: "x32000", G7: "320001" };
  for (const [sym, s] of Object.entries(expected)) {
    assert.equal(shape(findVoicings(parseChord(sym), std)[0]), s, sym);
  }
});

test("모든 운지는 필수 구성음과 최저음을 만족한다", () => {
  for (const sym of ["C", "F#m7b5", "G/B", "E7#9", "Bdim", "Asus2", "Dm9", "Ebmaj7"]) {
    const c = parseChord(sym);
    const vs = findVoicings(c, std);
    assert.ok(vs.length > 0, sym);
    for (const v of vs) {
      const notes = v.notes.filter((n) => n !== null);
      const pcs = new Set(notes.map((n) => n % 12));
      for (const r of c.required) assert.ok(pcs.has(r), `${sym} ${shape(v)}`);
      assert.equal(Math.min(...notes) % 12, c.bass, `${sym} bass ${shape(v)}`);
    }
  }
});

test("카포를 적용하면 같은 소리를 내는 다른 모양이 된다", () => {
  const c = parseChord("D");
  const v = findVoicings(c, std, { capo: 2 })[0];
  assert.equal(shape(v), "x32010"); // 카포 2 + C 모양 = D
  assert.equal(transposeSymbol(c, -2), "C");
});

import { detectPitch, analyzeString, describeOffset } from "../public/js/tuner.js";
function pluck(f, sr, n = 4096, noise = 0) {
  const buf = new Float32Array(n);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // 배음이 섞인 현 소리 + 약한 휴대폰 마이크 수준 크기
    buf[i] = 0.02 * (0.5 * Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * 2 * f * t) + 0.25 * Math.sin(2 * Math.PI * 3 * f * t)) + noise * rnd();
  }
  return buf;
}
test("튜너 음정 감지 (기타 음역, 작은 소리·잡음 포함)", () => {
  for (const sr of [44100, 48000]) {
    for (const f of [73.42, 82.41, 110, 146.83, 196, 246.94, 329.63]) {
      const got = detectPitch(pluck(f, sr, 4096, 0.002), sr);
      assert.ok(got, `${sr} ${f}Hz 감지 실패`);
      const cents = 1200 * Math.log2(got / f);
      assert.ok(Math.abs(cents) < 3, `${sr} ${f}Hz → ${got}`);
    }
  }
  assert.equal(detectPitch(new Float32Array(4096), 48000), null);
});

test("튜너 줄 판별과 높낮이 표시", () => {
  const std = TUNINGS.guitar[0].notes; // E2 A2 D3 G3 B3 E4
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  let r = analyzeString(hz(45) * Math.pow(2, -30 / 1200), std);
  assert.deepEqual([r.stringNo, r.cents, r.direction], [5, -30, "low"]);
  r = analyzeString(hz(64) * Math.pow(2, 12 / 1200), std);
  assert.deepEqual([r.stringNo, r.cents, r.direction], [1, 12, "high"]);
  r = analyzeString(hz(55), std);
  assert.deepEqual([r.stringNo, r.inTune], [3, true]);
  // 줄을 고정하면 많이 벗어나도 그 줄 기준으로 알려줌
  r = analyzeString(hz(38), std, 0);
  assert.deepEqual([r.stringNo, r.cents], [6, -200]);
  assert.equal(describeOffset(3), "정확해요");
  assert.equal(describeOffset(-30), "30센트 낮아요");
  assert.equal(describeOffset(12), "12센트 높아요");
  assert.equal(describeOffset(-200), "반음 2개 낮아요");
  assert.equal(describeOffset(235), "반음 2개 + 35센트 높아요");
});

import { explainChord } from "../public/js/explain.js";
test("코드 원리 설명", () => {
  const std = TUNINGS.guitar[0].notes;
  const am7 = parseChord("Am7");
  const ex = explainChord(am7, findVoicings(am7, std)[0], std);
  assert.equal(ex.formula, "1 – ♭3 – 5 – ♭7");
  assert.deepEqual(ex.steps.map((s) => s.ko), ["근음", "단3도", "완전5도", "단7도"]);
  assert.equal(ex.strings.length, 6);
  assert.equal(ex.strings[0].text, "치지 않음"); // x02010 의 6번줄
  assert.equal(ex.strings[1].ko, "근음");
  const gb = parseChord("G/B");
  assert.ok(explainChord(gb, findVoicings(gb, std)[0], std).notes[0].includes("분수 코드"));
  const d = parseChord("D");
  assert.ok(explainChord(d, findVoicings(d, std, { capo: 2 })[0], std, 2).notes.some((t) => t.includes("C 모양")));
  assert.equal(explainChord(parseChord("Cdim7"), null, std).steps[3].ko, "감7도");
});
