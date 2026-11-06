import { parseChord, findVoicings, transposeSymbol, TUNINGS, QUALITY_CHIPS, NOTE_NAMES_SHARP, noteName, midiName, midiToFreq } from "./chords.js?v=79699ac";
import { chordDiagram } from "./diagram.js?v=79699ac";
import { explainChord } from "./explain.js?v=79699ac";
import { strum, pluckOne } from "./audio.js?v=79699ac";
import { Tuner, freqToMidi } from "./tuner.js?v=79699ac";
import { api } from "./api.js?v=79699ac";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- 로컬 저장 (브라우저별 편의 설정) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("jjg." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("jjg." + k, JSON.stringify(v)); } catch { /* 무시 */ } },
};

const state = {
  // 예전 버전(기타/베이스 별도 저장) 값도 호환
  tuningId: (() => { const v = store.get("tuningId", "std"); return typeof v === "string" ? v : v?.guitar || "std"; })(),
  capo: store.get("capo", 0),
  chordText: store.get("chord", "C"),
  voicingIdx: 0,
  voicings: [],
  chord: null,
  recent: store.get("recent", []),
  tab: "chord",
  favorites: [],
  tunings: [],
  songs: [],
  picker: { root: "C", quality: "" },
};

// ---------- 토스트 ----------
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- 튜닝 ----------
function allTunings() {
  const custom = state.tunings.map((t) => ({ id: "c:" + t.id, name: t.name, notes: t.notes, custom: true, rawId: t.id }));
  return [...TUNINGS.guitar, ...custom];
}
function currentTuning() {
  const list = allTunings();
  return list.find((t) => t.id === state.tuningId) || list[0];
}
function renderTuningSelects() {
  const list = allTunings();
  const html = `<optgroup label="기본">${TUNINGS.guitar.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</optgroup>` +
    (list.some((t) => t.custom) ? `<optgroup label="내 튜닝">${list.filter((t) => t.custom).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</optgroup>` : "");
  $$(".tuning-select").forEach((sel) => { sel.innerHTML = html; sel.value = currentTuning().id; });
}

// ---------- 코드 피커 ----------
function renderPicker() {
  $("#root-chips").innerHTML = NOTE_NAMES_SHARP.map((n) => `<button type="button" class="chip ${state.picker.root === n ? "on" : ""}" data-root="${n}">${n}</button>`).join("");
  $("#quality-chips").innerHTML = QUALITY_CHIPS.map((q) => `<button type="button" class="chip ${state.picker.quality === q ? "on" : ""}" data-quality="${q}">${q === "" ? "maj" : esc(q)}</button>`).join("");
}

function renderRecent() {
  $("#recent").innerHTML = state.recent.length
    ? `<span class="muted small">최근</span>` + state.recent.map((c) => `<button type="button" class="chip ghost" data-chord="${esc(c)}">${esc(c)}</button>`).join("")
    : "";
}

function lookup(text, { remember = true } = {}) {
  state.chordText = text.trim();
  $("#chord-input").value = state.chordText;
  state.voicingIdx = 0;
  const c = parseChord(state.chordText);
  if (c && remember) {
    state.recent = [c.symbol, ...state.recent.filter((x) => x !== c.symbol)].slice(0, 8);
    store.set("recent", state.recent);
    store.set("chord", c.symbol);
    renderRecent();
  }
  if (c) {
    state.picker.root = noteName(c.root);
    const q = c.quality;
    state.picker.quality = QUALITY_CHIPS.includes(q) ? q : null;
    renderPicker();
  }
  renderChord();
}

// ---------- 코드 결과 ----------
function renderChord() {
  const out = $("#result");
  const c = parseChord(state.chordText);
  state.chord = c;
  if (!state.chordText) { out.innerHTML = ""; return; }
  if (!c) {
    out.innerHTML = `<div class="card empty"><p><b>${esc(state.chordText)}</b> 코드를 찾지 못했어요.</p><p class="muted small">예: C, Am7, F#m7b5, G/B, Cadd9, Dsus4</p></div>`;
    return;
  }
  const tuning = currentTuning().notes;
  const isFav = state.favorites.some((f) => f.chord === c.symbol);
  const tones = c.tones.map((t) => `<span class="tone-chip role-${t.interval === 0 ? "r" : [3, 4].includes(t.interval) ? "third" : [6, 7, 8].includes(t.interval) ? "fifth" : [9, 10, 11].includes(t.interval) ? "seventh" : "ext"}"><b>${esc(t.label)}</b>${esc(noteName(t.pc, c.useFlat))}${t.required ? "" : "<i>생략 가능</i>"}</span>`).join("");
  const head = `
    <div class="chord-head">
      <div>
        <h2 class="symbol">${esc(c.symbol)}</h2>
        <p class="muted">${esc(c.qualityName)}${c.bass !== c.root ? ` · 최저음 ${esc(c.bassName)}` : ""}</p>
      </div>
      <div class="head-actions">
        <button type="button" class="icon-btn" id="play-btn" aria-label="소리 듣기">${ICON.play}</button>
        <button type="button" class="icon-btn ${isFav ? "fav" : ""}" id="fav-btn" aria-label="즐겨찾기">${isFav ? ICON.starFill : ICON.star}</button>
      </div>
    </div>
    <div class="tones">${tones}</div>`;

  state.voicings = findVoicings(c, tuning, { capo: state.capo, limit: 10 });
  if (!state.voicings.length) {
    out.innerHTML = `<div class="card">${head}<p class="empty muted">이 튜닝에서는 4프렛 안에 잡히는 운지를 찾지 못했어요.</p></div>`;
    bindResult(c);
    return;
  }
  state.voicingIdx = Math.min(state.voicingIdx, state.voicings.length - 1);
  const v = state.voicings[state.voicingIdx];
  const capoNote = state.capo ? `<p class="capo-note">카포 ${state.capo}프렛 기준 · <b>${esc(transposeSymbol(c, -state.capo))}</b> 코드 모양</p>` : "";
  const shapeText = v.frets.map((f) => (f < 0 ? "x" : f)).join(" ");
  out.innerHTML = `
    <div class="card">
      ${head}
      ${capoNote}
      <div class="voicing" id="voicing">
        <button type="button" class="nav prev" aria-label="이전 운지" ${state.voicingIdx === 0 ? "disabled" : ""}>${ICON.left}</button>
        <div class="diagram-wrap">${chordDiagram(v, tuning, { capo: state.capo, useFlat: c.useFlat })}</div>
        <button type="button" class="nav next" aria-label="다음 운지" ${state.voicingIdx >= state.voicings.length - 1 ? "disabled" : ""}>${ICON.right}</button>
      </div>
      <div class="voicing-meta">
        <span class="pager">${state.voicings.map((_, i) => `<i class="${i === state.voicingIdx ? "on" : ""}"></i>`).join("")}</span>
        <span class="muted small">${state.voicingIdx + 1} / ${state.voicings.length} · <code>${shapeText}</code>${v.barre ? " · 바레" : ""}</span>
      </div>
      ${renderExplain(c, v, tuning)}
    </div>`;
  bindResult(c);
  bindSwipe($("#voicing"));
}

function renderExplain(c, v, tuning) {
  const ex = explainChord(c, v, tuning, state.capo);
  const open = store.get("explainOpen", true);
  const steps = ex.steps.map((s) => `
      <li class="role-${s.role}"><b>${esc(s.name)}</b><span>${esc(s.ko)}</span><em>${s.semitones === 0 ? "기준" : `반음 ${s.semitones}개 위`}</em>${s.required ? "" : `<i>생략 가능</i>`}</li>`).join("");
  const strings = ex.strings.map((r) => r.fret < 0
    ? `<li class="mute"><span class="sn">${r.stringNo}번줄</span><span class="pos">×</span><span class="muted">치지 않음</span></li>`
    : `<li><span class="sn">${r.stringNo}번줄</span><span class="pos">${r.fret === 0 ? (state.capo ? "카포" : "개방") : `${r.fret}프렛`}${r.finger ? ` · ${r.finger}번 손가락` : ""}</span><span class="role-${r.role}"><b>${esc(r.note)}</b> ${esc(r.ko)}</span></li>`).join("");
  return `
    <details class="explain" ${open ? "open" : ""}>
      <summary>이 코드는 어떻게 만들어지나요?</summary>
      <div class="ex-body">
        <h4>1. 구성음 쌓기</h4>
        <p class="muted small">근음 <b>${esc(noteName(c.root, c.useFlat))}</b>에서 반음 몇 개 위의 음을 쌓느냐가 코드 종류를 결정해요. 기타는 한 프렛이 반음 하나예요.</p>
        <ol class="ex-steps">${steps}</ol>
        <p class="formula">공식 <code>${esc(ex.formula)}</code></p>
        ${ex.character ? `<p class="ex-char">${esc(ex.character)}</p>` : ""}
        <h4>2. 이 운지에서 각 줄의 역할</h4>
        <ul class="ex-strings">${strings}</ul>
        ${ex.notes.length ? `<ul class="ex-notes">${ex.notes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      </div>
    </details>`;
}

function bindResult(c) {
  $("#play-btn")?.addEventListener("click", () => {
    const v = state.voicings[state.voicingIdx];
    if (v) strum(v.notes);
  });
  $("#fav-btn")?.addEventListener("click", () => toggleFavorite(c));
  $(".explain")?.addEventListener("toggle", (e) => store.set("explainOpen", e.target.open));
  $("#voicing .prev")?.addEventListener("click", () => moveVoicing(-1));
  $("#voicing .next")?.addEventListener("click", () => moveVoicing(1));
}

function moveVoicing(d) {
  const n = state.voicings.length;
  const next = Math.max(0, Math.min(n - 1, state.voicingIdx + d));
  if (next === state.voicingIdx) return;
  state.voicingIdx = next;
  renderChord();
}

function bindSwipe(el) {
  if (!el) return;
  let x0 = null;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) moveVoicing(dx < 0 ? 1 : -1);
    x0 = null;
  });
}

// ---------- 저장 (이 브라우저) ----------
async function toggleFavorite(c) {
  const existing = state.favorites.find((f) => f.chord === c.symbol);
  try {
    if (existing) {
      await api.removeFavorite(existing.id);
      state.favorites = state.favorites.filter((f) => f.id !== existing.id);
      toast("즐겨찾기에서 뺐어요");
    } else {
      const f = await api.addFavorite({ chord: c.symbol, instrument: "guitar" });
      state.favorites.unshift(f);
      toast("즐겨찾기에 추가했어요");
    }
    renderChord();
    renderSaved();
  } catch (e) { toast(e.message); }
}

async function loadUserData() {
  try {
    const [f, t, so] = await Promise.all([api.favorites(), api.tunings(), api.songs()]);
    state.favorites = f.items; state.tunings = t.items; state.songs = so.items;
  } catch (e) { toast(e.message); }
  renderTuningSelects();
  renderChord();
  renderSaved();
  renderTunerStrings();
}

// ---------- 내 저장 탭 ----------
function renderSaved() {
  const el = $("#saved");
  const favs = state.favorites;
  el.innerHTML = `
    <p class="muted small saved-note">로그인 없이 이 기기의 브라우저에 저장돼요. 다른 기기와는 공유되지 않아요.</p>
    <section class="card">
      <div class="sec-head"><h3>즐겨찾기 코드</h3></div>
      ${favs.length ? `<div class="chips">${favs.map((f) => `<button type="button" class="chip big" data-chord="${esc(f.chord)}">${esc(f.chord)}</button>`).join("")}</div>` : `<p class="muted small">코드 화면에서 ☆를 누르면 여기에 모여요.</p>`}
    </section>
    <section class="card">
      <div class="sec-head"><h3>내 튜닝</h3><button type="button" class="btn small" id="new-tuning">+ 새 튜닝</button></div>
      ${state.tunings.length ? `<ul class="list">${state.tunings.map((t) => `<li><div><b>${esc(t.name)}</b><span class="muted small">${t.notes.map((m) => esc(midiName(m).replace(/-?\d+$/, ""))).join(" ")}</span></div><div class="row"><button type="button" class="btn small" data-apply-tuning="${esc(t.id)}">적용</button><button type="button" class="icon-btn small" data-del-tuning="${esc(t.id)}" aria-label="삭제">${ICON.trash}</button></div></li>`).join("")}</ul>` : `<p class="muted small">드롭 C, 오픈 E 같은 나만의 튜닝을 저장해 두세요.</p>`}
    </section>
    <section class="card">
      <div class="sec-head"><h3>코드 진행 / 곡 메모</h3><button type="button" class="btn small" id="new-song">+ 새 메모</button></div>
      ${state.songs.length ? `<ul class="list songs">${state.songs.map((s) => `<li><div class="song"><div class="song-top"><b>${esc(s.title)}</b><div class="row"><button type="button" class="icon-btn small" data-edit-song="${esc(s.id)}" aria-label="수정">${ICON.edit}</button><button type="button" class="icon-btn small" data-del-song="${esc(s.id)}" aria-label="삭제">${ICON.trash}</button></div></div>${progressionChips(s.progression)}${s.memo ? `<p class="memo">${esc(s.memo)}</p>` : ""}</div></li>`).join("")}</ul>` : `<p class="muted small">예: 어쿠스틱 연습곡 — C G Am F</p>`}
    </section>`;
}

function progressionChips(text) {
  const tokens = String(text || "").split(/[\s,|\-–>→]+/).filter(Boolean);
  return `<div class="chips prog">${tokens.map((t) => (parseChord(t) ? `<button type="button" class="chip" data-chord="${esc(t)}">${esc(t)}</button>` : `<span class="muted small">${esc(t)}</span>`)).join("")}</div>`;
}

function openSongEditor(song) {
  openSheet(`
    <h3>${song ? "메모 수정" : "새 코드 진행 메모"}</h3>
    <form id="song-form" class="form">
      <label>제목<input name="title" required maxlength="80" value="${esc(song?.title || "")}" placeholder="곡 이름 또는 연습 메모"/></label>
      <label>코드 진행<input name="progression" maxlength="400" value="${esc(song?.progression || "")}" placeholder="C G Am F"/></label>
      <label>메모<textarea name="memo" rows="4" maxlength="2000" placeholder="스트럼 패턴, 카포 위치 등">${esc(song?.memo || "")}</textarea></label>
      <button class="btn primary block" type="submit">저장</button>
    </form>`);
  $("#song-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      if (song) {
        const s = await api.updateSong(song.id, data);
        state.songs = state.songs.map((x) => (x.id === song.id ? s : x));
      } else {
        state.songs.unshift(await api.addSong(data));
      }
      closeSheet(); renderSaved(); toast("저장했어요");
    } catch (err) { toast(err.message); }
  });
}

function openTuningEditor() {
  const base = currentTuning();
  const n = base.notes.length;
  const range = [33, 69];
  const options = (sel) => { let o = ""; for (let m = range[0]; m <= range[1]; m++) o += `<option value="${m}" ${m === sel ? "selected" : ""}>${midiName(m)}</option>`; return o; };
  openSheet(`
    <h3>새 기타 튜닝</h3>
    <form id="tuning-form" class="form">
      <label>이름<input name="name" required maxlength="40" placeholder="예: 드롭 C"/></label>
      <div class="string-pickers">${base.notes.map((m, i) => `<label class="sp"><span>${n - i}번줄</span><select name="s${i}">${options(m)}</select></label>`).join("")}</div>
      <p class="muted small">현재 선택된 튜닝(${esc(base.name)})에서 시작해요. 왼쪽이 가장 굵은 줄입니다.</p>
      <button class="btn primary block" type="submit">저장</button>
    </form>`);
  $("#tuning-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const notes = base.notes.map((_, i) => Number(fd.get("s" + i)));
    try {
      const t = await api.addTuning({ name: fd.get("name"), instrument: "guitar", notes });
      state.tunings.push(t);
      state.tuningId = "c:" + t.id;
      store.set("tuningId", state.tuningId);
      closeSheet(); renderTuningSelects(); renderChord(); renderSaved(); renderTunerStrings();
      toast("튜닝을 저장하고 적용했어요");
    } catch (err) { toast(err.message); }
  });
}

// ---------- 시트(모달) ----------
function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  $("#sheet").hidden = false;
  requestAnimationFrame(() => $("#sheet").classList.add("open"));
}
function closeSheet() {
  $("#sheet").classList.remove("open");
  setTimeout(() => { $("#sheet").hidden = true; }, 200);
}

// ---------- 튜너 ----------
let tuner = null;
let lockedString = null; // null = 자동

function renderTunerStrings() {
  const t = currentTuning();
  const el = $("#tuner-strings");
  if (!el) return;
  el.innerHTML = `<button type="button" class="chip ${lockedString === null ? "on" : ""}" data-string="auto">자동</button>` +
    t.notes.map((m, i) => `<button type="button" class="chip str ${lockedString === i ? "on" : ""}" data-string="${i}" data-midi="${m}"><small>${t.notes.length - i}</small>${esc(midiName(m).replace(/-?\d+$/, ""))}</button>`).join("");
}

function onPitch(freq) {
  const noteEl = $("#tuner-note"), centsEl = $("#tuner-cents"), needle = $("#needle"), hz = $("#tuner-hz"), box = $("#tuner-display");
  if (!freq) {
    box.classList.remove("in-tune", "close");
    hz.textContent = "줄을 튕겨 주세요";
    return;
  }
  const t = currentTuning().notes;
  const midiF = freqToMidi(freq);
  let target;
  if (lockedString !== null) target = t[lockedString];
  else target = t.reduce((a, b) => (Math.abs(b - midiF) < Math.abs(a - midiF) ? b : a));
  // 목표 줄과 1옥타브 이상 차이나면 가장 가까운 반음 기준으로 표시
  if (Math.abs(midiF - target) > 2.5) target = Math.round(midiF);
  const cents = Math.round((midiF - target) * 100);
  const idx = t.indexOf(target);
  noteEl.textContent = midiName(target).replace(/-?\d+$/, "");
  $("#tuner-octave").textContent = idx >= 0 ? `${t.length - idx}번줄` : midiName(target).match(/-?\d+$/)[0] + "옥타브";
  centsEl.textContent = (cents > 0 ? "+" : "") + cents + "¢";
  hz.textContent = `${freq.toFixed(1)} Hz · 목표 ${midiToFreq(target).toFixed(1)} Hz`;
  const clamped = Math.max(-50, Math.min(50, cents));
  needle.style.transform = `rotate(${clamped * 1.4}deg)`;
  box.classList.toggle("in-tune", Math.abs(cents) <= 5);
  box.classList.toggle("close", Math.abs(cents) > 5 && Math.abs(cents) <= 15);
  $("#tuner-hint").textContent = Math.abs(cents) <= 5 ? "정확해요" : cents < 0 ? "음이 낮아요 · 줄을 조여 주세요" : "음이 높아요 · 줄을 풀어 주세요";
  $$("#tuner-strings .str").forEach((b) => b.classList.toggle("hit", Number(b.dataset.midi) === target));
}

async function toggleTuner() {
  const btn = $("#tuner-toggle");
  if (tuner?.running) {
    tuner.stop();
    btn.textContent = "튜너 시작";
    btn.classList.remove("on");
    $("#tuner-display").classList.remove("live", "in-tune", "close");
    $("#tuner-hint").textContent = "마이크 권한을 허용하면 바로 음을 들을 수 있어요";
    return;
  }
  tuner = new Tuner(onPitch);
  try {
    await tuner.start();
    btn.textContent = "튜너 정지";
    btn.classList.add("on");
    $("#tuner-display").classList.add("live");
    $("#tuner-hint").textContent = "줄을 하나씩 튕겨 주세요";
  } catch (e) {
    toast("마이크를 사용할 수 없어요. 브라우저 설정에서 마이크 권한을 허용해 주세요.");
  }
}

// ---------- 탭 ----------
function setTab(tab) {
  state.tab = tab;
  $$(".tab-btn").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + tab));
  if (tab !== "tuner" && tuner?.running) toggleTuner();
  window.scrollTo({ top: 0 });
}

// ---------- 아이콘 ----------
const svg = (p, extra = "") => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
const ICON = {
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>'),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>'),
  starFill: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z" fill="currentColor"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 'width="18" height="18"'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 'width="18" height="18"'),
  bookmark: svg('<path d="M6 3h12v18l-6-4-6 4z"/>', 'width="40" height="40"'),
};

// ---------- 이벤트 연결 ----------
function init() {
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("#chord-form").addEventListener("submit", (e) => { e.preventDefault(); lookup($("#chord-input").value); $("#chord-input").blur(); });
  $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet" || e.target.closest("[data-close]")) closeSheet(); });

  // 위임 이벤트
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button, a");
    if (!b) return;
    if (b.dataset.root) { state.picker.root = b.dataset.root; if (state.picker.quality === null) state.picker.quality = ""; lookup(state.picker.root + state.picker.quality); }
    else if (b.dataset.quality !== undefined && b.closest("#quality-chips")) { state.picker.quality = b.dataset.quality; lookup(state.picker.root + state.picker.quality); }
    else if (b.dataset.chord) { lookup(b.dataset.chord); setTab("chord"); }
    else if (b.id === "new-song") openSongEditor(null);
    else if (b.id === "new-tuning" || b.id === "save-tuning-btn") openTuningEditor();
    else if (b.dataset.editSong) openSongEditor(state.songs.find((s) => s.id === b.dataset.editSong));
    else if (b.dataset.delSong) {
      if (!confirm("이 메모를 삭제할까요?")) return;
      try { await api.removeSong(b.dataset.delSong); state.songs = state.songs.filter((s) => s.id !== b.dataset.delSong); renderSaved(); } catch (err) { toast(err.message); }
    } else if (b.dataset.delTuning) {
      if (!confirm("이 튜닝을 삭제할까요?")) return;
      try {
        await api.removeTuning(b.dataset.delTuning);
        state.tunings = state.tunings.filter((t) => t.id !== b.dataset.delTuning);
        if (state.tuningId === "c:" + b.dataset.delTuning) state.tuningId = "std";
        store.set("tuningId", state.tuningId);
        renderSaved(); renderTuningSelects(); renderChord(); renderTunerStrings();
      } catch (err) { toast(err.message); }
    } else if (b.dataset.applyTuning) {
      const t = state.tunings.find((x) => x.id === b.dataset.applyTuning);
      state.tuningId = "c:" + t.id;
      store.set("tuningId", state.tuningId);
      renderTuningSelects(); renderChord(); renderTunerStrings();
      toast(`${t.name} 튜닝을 적용했어요`);
    } else if (b.dataset.string) {
      lockedString = b.dataset.string === "auto" ? null : Number(b.dataset.string);
      renderTunerStrings();
      if (b.dataset.midi) pluckOne(Number(b.dataset.midi));
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.classList.contains("tuning-select")) {
      state.tuningId = e.target.value;
      store.set("tuningId", state.tuningId);
      renderTuningSelects(); renderChord(); renderTunerStrings();
    } else if (e.target.id === "capo-select") {
      state.capo = Number(e.target.value);
      store.set("capo", state.capo);
      state.voicingIdx = 0;
      renderChord();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
    if (state.tab === "chord" && document.activeElement?.tagName !== "INPUT") {
      if (e.key === "ArrowRight") moveVoicing(1);
      if (e.key === "ArrowLeft") moveVoicing(-1);
    }
  });
  $("#tuner-toggle").addEventListener("click", toggleTuner);

  $("#capo-select").innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i === 0 ? "카포 없음" : `카포 ${i}프렛`}</option>`).join("");
  $("#capo-select").value = String(state.capo);

  renderTuningSelects();
  renderPicker();
  renderRecent();
  lookup(state.chordText, { remember: false });
  renderTunerStrings();
  renderSaved();
  loadUserData();
}

init();
