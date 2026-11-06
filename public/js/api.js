// 서버 API 호출 래퍼
async function req(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
  return data;
}

export const api = {
  me: () => req("GET", "/me"),
  logout: () => req("POST", "/auth/logout"),
  loginUrl: () => "/api/auth/google",
  favorites: () => req("GET", "/favorites"),
  addFavorite: (f) => req("POST", "/favorites", f),
  removeFavorite: (id) => req("DELETE", `/favorites/${encodeURIComponent(id)}`),
  tunings: () => req("GET", "/tunings"),
  addTuning: (t) => req("POST", "/tunings", t),
  removeTuning: (id) => req("DELETE", `/tunings/${encodeURIComponent(id)}`),
  songs: () => req("GET", "/songs"),
  addSong: (s) => req("POST", "/songs", s),
  updateSong: (id, s) => req("PUT", `/songs/${encodeURIComponent(id)}`, s),
  removeSong: (id) => req("DELETE", `/songs/${encodeURIComponent(id)}`),
};
