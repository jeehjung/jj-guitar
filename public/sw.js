// JJ 기타 서비스워커: 화면 파일을 저장해 오프라인에서도 열리게 함
// __APP_VERSION__ 과 ASSETS 목록은 배포할 때 GitHub Actions가 채워 넣음
const VERSION = "__APP_VERSION__";
const ASSETS = ["./"]; /* __ASSETS__ */
const CACHE = "jjg-app-" + VERSION;
const FONT_CACHE = "jjg-fonts";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("jjg-app-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 글꼴: 저장해 둔 것을 먼저 쓰고 뒤에서 갱신
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 버전 확인 파일은 항상 서버에서
  if (url.pathname.endsWith("/version.json")) return;

  // 화면(페이지) 요청: 서버 우선 → 실패하면 저장본
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match("./", { ignoreSearch: true })) || (await caches.match("index.html", { ignoreSearch: true })) || Response.error())
    );
    return;
  }

  // 나머지(css·js·아이콘): 저장본 우선 (파일 주소에 버전이 붙어 있어 안전)
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
