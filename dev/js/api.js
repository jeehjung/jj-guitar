// 저장소: 로그인 없이 이 브라우저(localStorage)에 저장
const KEY = { favorites: "jjg.favorites", tunings: "jjg.tunings", songs: "jjg.songs" };
const LIMITS = { favorites: 300, tunings: 50, songs: 300 };

function load(k) {
  try { return JSON.parse(localStorage.getItem(KEY[k]) || "[]"); } catch { return []; }
}
function save(k, items) {
  try { localStorage.setItem(KEY[k], JSON.stringify(items)); }
  catch { throw new Error("이 브라우저에 저장할 수 없어요 (개인정보 보호 모드인지 확인해 주세요)"); }
}
const id = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function add(k, item, limitMsg) {
  const items = load(k);
  if (items.length >= LIMITS[k]) throw new Error(limitMsg);
  items.unshift(item);
  save(k, items);
  return item;
}
function remove(k, itemId) {
  save(k, load(k).filter((x) => x.id !== itemId));
  return { ok: true };
}

export const api = {
  favorites: async () => ({ items: load("favorites").filter((f) => f.instrument !== "bass") }),
  addFavorite: async ({ chord, instrument }) => {
    const existing = load("favorites").find((f) => f.chord === chord && f.instrument !== "bass");
    if (existing) return existing;
    return add("favorites", { id: id(), chord: str(chord, 24), instrument }, "즐겨찾기는 최대 300개까지 저장할 수 있어요");
  },
  removeFavorite: async (itemId) => remove("favorites", itemId),

  tunings: async () => ({ items: load("tunings").filter((t) => t.instrument !== "bass").reverse() }),
  addTuning: async ({ name, instrument, notes }) => {
    const n = str(name, 40);
    if (!n) throw new Error("튜닝 이름을 입력해 주세요");
    return add("tunings", { id: id(), name: n, instrument, notes }, "튜닝은 최대 50개까지 저장할 수 있어요");
  },
  removeTuning: async (itemId) => remove("tunings", itemId),

  songs: async () => ({ items: load("songs") }),
  addSong: async (s) => {
    const item = { id: id(), title: str(s.title, 80), progression: str(s.progression, 400), memo: str(s.memo, 2000) };
    if (!item.title) throw new Error("제목을 입력해 주세요");
    return add("songs", item, "메모는 최대 300개까지 저장할 수 있어요");
  },
  updateSong: async (itemId, s) => {
    const item = { id: itemId, title: str(s.title, 80), progression: str(s.progression, 400), memo: str(s.memo, 2000) };
    if (!item.title) throw new Error("제목을 입력해 주세요");
    save("songs", [item, ...load("songs").filter((x) => x.id !== itemId)]);
    return item;
  },
  removeSong: async (itemId) => remove("songs", itemId),
};
