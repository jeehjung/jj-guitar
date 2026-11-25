// PWA: 서비스워커 등록, 새 버전 감지 시 자동 새로고침, 앱 설치 버튼

const VERSION = document.querySelector('meta[name="app-version"]')?.content || "";
// 배포 때 버전이 채워졌을 때만 동작 (로컬 개발 중에는 저장·자동 새로고침 안 함)
const STAMPED = VERSION !== "" && !VERSION.startsWith("__");
const CHECK_EVERY_MS = 5 * 60 * 1000;

export function appVersion() {
  return STAMPED ? VERSION : "개발용";
}

/**
 * @param {object} o
 * @param {() => boolean} o.isBusy  지금 새로고침하면 곤란한지 (튜너 사용 중, 입력 중 등)
 * @param {(msg: string) => void} o.notify  짧은 안내 표시
 * @param {(html: string) => void} o.openSheet  안내 시트 열기
 */
export function initPWA({ isBusy, notify, openSheet }) {
  setupInstall({ openSheet });
  if (!STAMPED) return;

  let reg = null;
  let reloading = false;
  let waiting = false;

  const reloadNow = () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };

  // 새 버전으로 바꿔야 할 때: 바쁘면 끝날 때까지 기다렸다가 새로고침
  const requestReload = (newVersion) => {
    if (reloading) return;
    // 같은 버전으로 이미 한 번 새로고침했는데도 그대로면 반복하지 않음 (캐시가 늦게 풀리는 경우)
    try {
      if (newVersion && sessionStorage.getItem("jjg.reloadedFor") === newVersion) return;
      if (newVersion) sessionStorage.setItem("jjg.reloadedFor", newVersion);
    } catch { /* 저장 불가 환경 */ }
    if (!isBusy()) return reloadNow();
    if (waiting) return;
    waiting = true;
    notify("새 버전이 있어요. 지금 하던 일을 마치면 새로고침돼요");
    const timer = setInterval(() => {
      if (!isBusy()) { clearInterval(timer); reloadNow(); }
    }, 2000);
  };

  if ("serviceWorker" in navigator) {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // 처음 설치될 때는 새로고침하지 않음
      if (!hadController) { hadController = true; return; }
      requestReload();
    });
    navigator.serviceWorker.register("sw.js").then((r) => { reg = r; }).catch(() => {});
  }

  const check = async () => {
    if (reloading || document.visibilityState === "hidden") return;
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const { version } = await res.json();
      if (!version || version.startsWith("__") || version === VERSION) return;
      // 서비스워커도 새 버전으로 바꾸고 새로고침
      try { await reg?.update(); } catch { /* 무시 */ }
      requestReload(version);
    } catch { /* 오프라인 등 */ }
  };

  setTimeout(check, 3000);
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  window.addEventListener("online", check);
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

function setupInstall({ openSheet }) {
  const btn = document.getElementById("install-btn");
  if (!btn || isStandalone()) return;
  let deferred = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  window.addEventListener("appinstalled", () => { btn.hidden = true; deferred = null; });

  // 아이폰·아이패드 Safari는 설치 이벤트가 없어 안내로 대신함
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) btn.hidden = false;

  btn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* 무시 */ }
      deferred = null;
      btn.hidden = true;
      return;
    }
    openSheet(`
      <h3>홈 화면에 앱으로 설치</h3>
      <ol class="install-steps">
        <li>Safari 아래쪽의 <b>공유</b> 버튼(네모에 위쪽 화살표)을 눌러 주세요.</li>
        <li><b>홈 화면에 추가</b>를 눌러 주세요.</li>
        <li>오른쪽 위 <b>추가</b>를 누르면 홈 화면에 JJ 기타 아이콘이 생겨요.</li>
      </ol>
      <p class="muted small">카카오톡 등 다른 앱 안에서 열었다면 먼저 Safari로 열어 주세요.</p>`);
  });
}
