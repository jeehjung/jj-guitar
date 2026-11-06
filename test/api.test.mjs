import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { onRequest } from "../functions/api/[[path]].js";

// D1 인터페이스를 흉내 내는 인메모리 SQLite
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"));
const DB = {
  prepare(q) {
    const st = db.prepare(q);
    let args = [];
    const o = { bind(...a) { args = a; return o; }, async first() { return st.get(...args) ?? null; }, async all() { return { results: st.all(...args) }; }, async run() { return st.run(...args); } };
    return o;
  },
};
const ORIGIN = "https://jj-guitar-dev.pages.dev";
const env = { DB, APP_ORIGIN: ORIGIN, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
const b64 = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
db.prepare("INSERT INTO users(id,google_sub,email,name) VALUES('u1','s1','a@b.c','테스터')").run();
db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(b64(createHash("sha256").update("tok").digest()), "u1", Math.floor(Date.now() / 1000) + 999);

async function call(method, path, body, { cookie = "jjg_session=tok", origin = ORIGIN } = {}) {
  const res = await onRequest({ env, request: new Request(ORIGIN + "/api" + path, { method, headers: { Cookie: cookie, Origin: origin, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }) });
  return { status: res.status, location: res.headers.get("location"), data: res.status === 302 ? null : await res.json() };
}

test("로그인 상태 확인", async () => {
  assert.equal((await call("GET", "/me")).data.user.email, "a@b.c");
  assert.equal((await call("GET", "/me", null, { cookie: "" })).data.user, null);
  assert.equal((await call("GET", "/favorites", null, { cookie: "" })).status, 401);
});

test("즐겨찾기 추가/중복/삭제", async () => {
  const a = await call("POST", "/favorites", { chord: "Am7", instrument: "guitar" });
  assert.equal(a.status, 201);
  const b = await call("POST", "/favorites", { chord: "Am7", instrument: "guitar" });
  assert.equal(b.data.id, a.data.id);
  assert.equal((await call("GET", "/favorites")).data.items.length, 1);
  await call("DELETE", "/favorites/" + a.data.id);
  assert.equal((await call("GET", "/favorites")).data.items.length, 0);
});

test("다른 출처의 변경 요청 차단", async () => {
  assert.equal((await call("POST", "/favorites", { chord: "C", instrument: "guitar" }, { origin: "https://evil.example" })).status, 403);
});

test("튜닝 검증과 저장", async () => {
  assert.equal((await call("POST", "/tunings", { name: "드롭 C", instrument: "guitar", notes: [36, 43, 48, 53, 57, 62] })).status, 201);
  assert.equal((await call("POST", "/tunings", { name: "잘못", instrument: "guitar", notes: [40, 45] })).status, 400);
  assert.deepEqual((await call("GET", "/tunings")).data.items[0].notes, [36, 43, 48, 53, 57, 62]);
});

test("곡 메모 저장/수정", async () => {
  const s = await call("POST", "/songs", { title: "연습곡", progression: "C G Am F", memo: "다운업" });
  assert.equal(s.status, 201);
  await call("PUT", "/songs/" + s.data.id, { title: "연습곡2", progression: "C G", memo: "" });
  assert.equal((await call("GET", "/songs")).data.items[0].title, "연습곡2");
  assert.equal((await call("POST", "/songs", { title: "" })).status, 400);
});

test("Google 로그인 시작/실패 리디렉트", async () => {
  const r = await call("GET", "/auth/google", null, { cookie: "" });
  assert.equal(r.status, 302);
  assert.ok(r.location.startsWith("https://accounts.google.com/"));
  assert.ok(r.location.includes(encodeURIComponent(ORIGIN + "/api/auth/callback")));
  const bad = await call("GET", "/auth/callback?state=a&code=b", null, { cookie: "" });
  assert.ok(bad.location.startsWith(ORIGIN + "/?login=error"));
});
