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

import { detectPitch } from "../public/js/tuner.js";
test("튜너 음정 감지 (합성 파형)", () => {
  const sr = 48000;
  for (const f of [41.2, 55, 82.41, 110, 196, 329.63]) {
    const buf = new Float32Array(4096);
    // 배음이 섞인 현 소리 흉내
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      buf[i] = 0.5 * Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t) + 0.2 * Math.sin(2 * Math.PI * 3 * f * t);
    }
    const got = detectPitch(buf, sr);
    const cents = 1200 * Math.log2(got / f);
    assert.ok(Math.abs(cents) < 3, `${f}Hz → ${got}`);
  }
  assert.equal(detectPitch(new Float32Array(4096), sr), null);
});
