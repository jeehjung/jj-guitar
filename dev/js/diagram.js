// 코드 다이어그램 / 지판 SVG 렌더링
import { midiName } from "./chords.js?v=79699ac";

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
