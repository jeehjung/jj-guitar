// JJ 기타 API (Cloudflare Pages Functions + D1)
// env: DB (D1), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (secret), APP_ORIGIN

const SESSION_COOKIE = "jjg_session";
const STATE_COOKIE = "jjg_oauth_state";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const LIMITS = { favorites: 300, tunings: 50, songs: 300 };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
function redirect(url, cookies = []) {
  const h = new Headers({ Location: url, "cache-control": "no-store" });
  cookies.forEach((c) => h.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers: h });
}
function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const hit = raw.split(";").map((v) => v.trim()).find((v) => v.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : null;
}
function base64url(bytes) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken(n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return base64url(a);
}
async function sha256(v) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))));
}
const now = () => Math.floor(Date.now() / 1000);
const sessionCookie = (token, maxAge) => `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const clearState = `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/callback; Max-Age=0`;

async function sessionUser(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.picture_url FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?"
  ).bind(await sha256(token), now()).first();
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const INSTRUMENTS = new Set(["guitar", "bass"]);

function loginError(env, message) {
  const u = new URL(env.APP_ORIGIN);
  u.searchParams.set("login", "error");
  u.searchParams.set("message", message);
  return redirect(u.toString(), [clearState]);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  const method = request.method;

  // 상태 변경 요청은 같은 출처에서만 허용 (CSRF 방지)
  if (method !== "GET") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== env.APP_ORIGIN && origin !== url.origin) return json({ error: "허용되지 않은 요청 출처입니다." }, 403);
  }

  try {
    if (path === "/health") return json({ ok: true, service: "jj-guitar-api" });

    // ---------- Google 로그인 ----------
    if (path === "/auth/google" && method === "GET") {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.APP_ORIGIN) return json({ error: "Google 로그인 설정이 아직 완료되지 않았습니다." }, 503);
      const state = randomToken();
      const verifier = randomToken(48);
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<?").bind(now()).run();
      await env.DB.prepare("INSERT INTO oauth_states(state_hash,code_verifier,expires_at) VALUES(?,?,?)").bind(await sha256(state), verifier, now() + 600).run();
      const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      google.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.APP_ORIGIN.replace(/\/$/, "") + "/api/auth/callback",
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return redirect(google.toString(), [`${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/callback; Max-Age=600`]);
    }

    if (path === "/auth/callback" && method === "GET") {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (url.searchParams.get("error")) return loginError(env, "로그인이 취소되었어요");
      if (!state || !code || state !== cookieValue(request, STATE_COOKIE)) return loginError(env, "로그인 확인에 실패했어요. 다시 시도해 주세요");
      const stateHash = await sha256(state);
      const row = await env.DB.prepare("SELECT code_verifier FROM oauth_states WHERE state_hash=? AND expires_at>?").bind(stateHash, now()).first();
      await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash=?").bind(stateHash).run();
      if (!row) return loginError(env, "로그인 요청이 만료되었어요. 다시 시도해 주세요");

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.APP_ORIGIN.replace(/\/$/, "") + "/api/auth/callback",
          grant_type: "authorization_code",
          code_verifier: row.code_verifier,
        }),
      });
      if (!tokenRes.ok) return loginError(env, "Google 인증에 실패했어요");
      const tokens = await tokenRes.json();
      const profRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!profRes.ok) return loginError(env, "Google 사용자 정보를 확인하지 못했어요");
      const p = await profRes.json();
      if (!p.sub || !p.email || !p.email_verified) return loginError(env, "인증된 Google 이메일이 필요해요");

      const existing = await env.DB.prepare("SELECT id FROM users WHERE google_sub=?").bind(p.sub).first();
      const userId = existing?.id || crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO users(id,google_sub,email,name,picture_url) VALUES(?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name,picture_url=excluded.picture_url,updated_at=CURRENT_TIMESTAMP"
      ).bind(userId, p.sub, p.email, p.name || p.email, p.picture || null).run();
      const token = randomToken();
      await env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now()).run();
      await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256(token), userId, now() + SESSION_SECONDS).run();
      return redirect(env.APP_ORIGIN.replace(/\/$/, "") + "/?login=ok", [sessionCookie(token, SESSION_SECONDS), clearState]);
    }

    if (path === "/auth/logout" && method === "POST") {
      const token = cookieValue(request, SESSION_COOKIE);
      if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }

    if (path === "/me" && method === "GET") {
      const u = await sessionUser(request, env);
      return json({ user: u ? { id: u.id, email: u.email, name: u.name, picture: u.picture_url } : null });
    }

    // ---------- 이하 로그인 필요 ----------
    const user = await sessionUser(request, env);
    if (!user) return json({ error: "로그인이 필요해요" }, 401);
    const seg = path.split("/").filter(Boolean); // ["favorites", ":id"]

    // 즐겨찾기 코드
    if (seg[0] === "favorites") {
      if (method === "GET" && seg.length === 1) {
        const r = await env.DB.prepare("SELECT id, chord, instrument, created_at FROM favorites WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
        return json({ items: r.results || [] });
      }
      if (method === "POST" && seg.length === 1) {
        const b = await readJson(request);
        const chord = str(b?.chord, 24);
        const instrument = b?.instrument;
        if (!chord || !INSTRUMENTS.has(instrument)) return json({ error: "코드 정보가 올바르지 않아요" }, 400);
        const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM favorites WHERE user_id=?").bind(user.id).first();
        if (cnt.n >= LIMITS.favorites) return json({ error: "즐겨찾기는 최대 300개까지 저장할 수 있어요" }, 400);
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO favorites(id,user_id,chord,instrument) VALUES(?,?,?,?) ON CONFLICT(user_id,chord,instrument) DO NOTHING").bind(id, user.id, chord, instrument).run();
        const row = await env.DB.prepare("SELECT id, chord, instrument, created_at FROM favorites WHERE user_id=? AND chord=? AND instrument=?").bind(user.id, chord, instrument).first();
        return json(row, 201);
      }
      if (method === "DELETE" && seg.length === 2) {
        await env.DB.prepare("DELETE FROM favorites WHERE id=? AND user_id=?").bind(seg[1], user.id).run();
        return json({ ok: true });
      }
    }

    // 내 튜닝 프리셋
    if (seg[0] === "tunings") {
      if (method === "GET" && seg.length === 1) {
        const r = await env.DB.prepare("SELECT id, name, instrument, notes FROM tunings WHERE user_id=? ORDER BY created_at").bind(user.id).all();
        return json({ items: (r.results || []).map((t) => ({ ...t, notes: JSON.parse(t.notes) })) });
      }
      if (method === "POST" && seg.length === 1) {
        const b = await readJson(request);
        const name = str(b?.name, 40);
        const instrument = b?.instrument;
        const notes = Array.isArray(b?.notes) ? b.notes.map(Number) : [];
        const okCount = instrument === "guitar" ? notes.length === 6 : [4, 5].includes(notes.length);
        if (!name || !INSTRUMENTS.has(instrument) || !okCount || notes.some((m) => !Number.isInteger(m) || m < 15 || m > 80)) return json({ error: "튜닝 정보가 올바르지 않아요" }, 400);
        const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM tunings WHERE user_id=?").bind(user.id).first();
        if (cnt.n >= LIMITS.tunings) return json({ error: "튜닝은 최대 50개까지 저장할 수 있어요" }, 400);
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO tunings(id,user_id,name,instrument,notes) VALUES(?,?,?,?,?)").bind(id, user.id, name, instrument, JSON.stringify(notes)).run();
        return json({ id, name, instrument, notes }, 201);
      }
      if (method === "DELETE" && seg.length === 2) {
        await env.DB.prepare("DELETE FROM tunings WHERE id=? AND user_id=?").bind(seg[1], user.id).run();
        return json({ ok: true });
      }
    }

    // 코드 진행 / 곡 메모
    if (seg[0] === "songs") {
      const pick = (b) => ({ title: str(b?.title, 80), progression: str(b?.progression, 400), memo: str(b?.memo, 2000) });
      if (method === "GET" && seg.length === 1) {
        const r = await env.DB.prepare("SELECT id, title, progression, memo, updated_at FROM songs WHERE user_id=? ORDER BY updated_at DESC").bind(user.id).all();
        return json({ items: r.results || [] });
      }
      if (method === "POST" && seg.length === 1) {
        const s = pick(await readJson(request));
        if (!s.title) return json({ error: "제목을 입력해 주세요" }, 400);
        const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM songs WHERE user_id=?").bind(user.id).first();
        if (cnt.n >= LIMITS.songs) return json({ error: "메모는 최대 300개까지 저장할 수 있어요" }, 400);
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO songs(id,user_id,title,progression,memo) VALUES(?,?,?,?,?)").bind(id, user.id, s.title, s.progression, s.memo).run();
        return json({ id, ...s }, 201);
      }
      if (method === "PUT" && seg.length === 2) {
        const s = pick(await readJson(request));
        if (!s.title) return json({ error: "제목을 입력해 주세요" }, 400);
        await env.DB.prepare("UPDATE songs SET title=?, progression=?, memo=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(s.title, s.progression, s.memo, seg[1], user.id).run();
        return json({ id: seg[1], ...s });
      }
      if (method === "DELETE" && seg.length === 2) {
        await env.DB.prepare("DELETE FROM songs WHERE id=? AND user_id=?").bind(seg[1], user.id).run();
        return json({ ok: true });
      }
    }

    return json({ error: "찾을 수 없는 요청이에요" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "서버 오류가 발생했어요" }, 500);
  }
}
