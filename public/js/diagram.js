// 코드 다이어그램 / 지판 SVG 렌더링
import { midiName } from "./chords.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** 기타 코드 다이어그램 (세로형, 5프렛) */
export function chordDiagram(voicing, tuning, { capo = 0, useFlat = false } = {}) {
  const n = tuning.length;
  const frets = voicing.frets;
  const fretted = frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const start = maxF <= 5 ? 1 : minF;
  const rows = 5;
  const W = 240, H = 290;
  const left = 34, right = 22, top = 52, bottom = 46;
  const gw = (W - left - right) / (n - 1);
  const gh = (H - top - bottom) / rows;
  const x = (s) => left + s * gw;
  const y = (r) => top + r * gh;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="코드 운지 다이어그램">`;
  // 너트 또는 시작 프렛 표시
  if (start === 1) svg += `<rect x="${x(0) - 2}" y="${top - 6}" width="${x(n - 1) - x(0) + 4}" height="7" rx="2" class="nut"/>`;
  else svg += `<text x="${left - 12}" y="${y(0) + gh / 2 + 5}" class="fretnum" text-anchor="end">${start}</text>`;
  for (let r = 0; r <= rows; r++) svg += `<line x1="${x(0)}" y1="${y(r)}" x2="${x(n - 1)}" y2="${y(r)}" class="fret"/>`;
  for (let s = 0; s < n; s++) svg += `<line x1="${x(s)}" y1="${y(0)}" x2="${x(s)}" y2="${y(rows)}" class="string" stroke-width="${1 + (n - 1 - s) * 0.35}"/>`;
  // 바레
  if (voicing.barre) {
    const r = voicing.barre.fret - start;
    svg += `<rect x="${x(voicing.barre.from) - 11}" y="${y(r) + gh / 2 - 11}" width="${x(voicing.barre.to) - x(voicing.barre.from) + 22}" height="22" rx="11" class="dot barre"/>`;
  }
  frets.forEach((f, s) => {
    if (f < 0) svg += `<text x="${x(s)}" y="${top - 16}" class="mark mute" text-anchor="middle">×</text>`;
    else if (f === 0) svg += `<circle cx="${x(s)}" cy="${top - 21}" r="6" class="mark open"/>`;
    else {
      const r = f - start;
      const finger = voicing.fingersMap?.[s];
      const inBarre = voicing.barre && f === voicing.barre.fret && s >= voicing.barre.from && s <= voicing.barre.to;
      if (!inBarre) svg += `<circle cx="${x(s)}" cy="${y(r) + gh / 2}" r="11" class="dot"/>`;
      if (finger && (!inBarre || s === voicing.barre.from)) svg += `<text x="${x(s)}" y="${y(r) + gh / 2 + 4.5}" class="finger" text-anchor="middle">${finger}</text>`;
    }
  });
  // 하단: 각 줄 음이름
  frets.forEach((f, s) => {
    const label = f >= 0 ? midiName(tuning[s] + capo + f, useFlat).replace(/-?\d+$/, "") : "";
    svg += `<text x="${x(s)}" y="${H - 18}" class="notename" text-anchor="middle">${esc(label)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

const ROLE_CLASS = (p) => (p.interval === 0 ? "r" : [3, 4].includes(p.interval) ? "third" : [6, 7, 8].includes(p.interval) ? "fifth" : [10, 11, 9].includes(p.interval) ? "seventh" : "ext");

/** 가로형 지판 (베이스 모드 코드톤 표시) */
export function fretboard(positions, tuning, { maxFret = 12, useFlat = false } = {}) {
  const n = tuning.length;
  const fw = 46, sh = 34, left = 66, top = 18;
  const W = left + fw * (maxFret + 0.6), H = top * 2 + sh * (n - 1) + 22;
  const xFret = (f) => left + f * fw;
  const xNote = (f) => (f === 0 ? left - 18 : left + (f - 0.5) * fw);
  const yStr = (s) => top + (n - 1 - s) * sh; // 높은 줄이 위
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="board" style="min-width:${Math.round(W * 0.82)}px" role="img" aria-label="지판 코드톤 위치">`;
  [3, 5, 7, 9].forEach((f) => f <= maxFret && (svg += `<circle cx="${xNote(f)}" cy="${(yStr(0) + yStr(n - 1)) / 2}" r="5" class="inlay"/>`));
  if (maxFret >= 12) svg += `<circle cx="${xNote(12)}" cy="${yStr(0) - sh / 2 + (n > 4 ? 0 : 0)}" r="5" class="inlay"/><circle cx="${xNote(12)}" cy="${yStr(n - 1) + sh / 2}" r="5" class="inlay"/>`;
  for (let f = 0; f <= maxFret; f++) svg += `<line x1="${xFret(f)}" y1="${yStr(n - 1) - 8}" x2="${xFret(f)}" y2="${yStr(0) + 8}" class="${f === 0 ? "nutline" : "fret"}"/>`;
  for (let s = 0; s < n; s++) {
    svg += `<line x1="${left - 36}" y1="${yStr(s)}" x2="${W}" y2="${yStr(s)}" class="string" stroke-width="${1.2 + (n - 1 - s) * 0.5}"/>`;
    svg += `<text x="4" y="${yStr(s) + 4}" class="strname">${esc(midiName(tuning[s], useFlat).replace(/-?\d+$/, ""))}</text>`;
  }
  for (let f = 1; f <= maxFret; f++) svg += `<text x="${xNote(f)}" y="${H - 4}" class="fretnum" text-anchor="middle">${f}</text>`;
  positions.forEach((p) => {
    svg += `<g class="tone ${ROLE_CLASS(p)}" data-midi="${p.midi}"><circle cx="${xNote(p.fret)}" cy="${yStr(p.string)}" r="13"/><text x="${xNote(p.fret)}" y="${yStr(p.string) + 4}" text-anchor="middle">${esc(p.label)}</text></g>`;
  });
  svg += `</svg>`;
  return svg;
}
