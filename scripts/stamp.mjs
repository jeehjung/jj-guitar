// 배포용 build 폴더 만들기: 파일 주소에 버전(?v=)을 붙이고, 서비스워커·version.json에 버전 기록
// 사용: node scripts/stamp.mjs <원본 폴더> <출력 폴더> <버전>
import { cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const [src = "public", out = "build", version] = process.argv.slice(2);
if (!version || !/^[A-Za-z0-9._-]+$/.test(version)) {
  console.error("버전이 필요해요 (예: node scripts/stamp.mjs public build abc1234)");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

const edit = (file, fn) => {
  const p = join(out, file);
  const before = readFileSync(p, "utf8");
  const after = fn(before);
  writeFileSync(p, after);
  return { before, after };
};
const must = (cond, msg) => { if (!cond) { console.error("실패: " + msg); process.exit(1); } };

// 1) index.html: css/js 주소에 버전, 앱 버전 표시
const idx = edit("index.html", (s) => s
  .replace(/(href|src)="(css\/app\.css|js\/app\.js)"/g, `$1="$2?v=${version}"`)
  .replaceAll("__APP_VERSION__", version));
must(idx.after.includes(`js/app.js?v=${version}`) && idx.after.includes(`css/app.css?v=${version}`), "index.html 버전 표시");
must(!idx.after.includes("__APP_VERSION__"), "index.html 버전 자리 남음");

// 2) js 모듈끼리 import 할 때도 같은 버전
const jsFiles = readdirSync(join(out, "js")).filter((f) => f.endsWith(".js"));
for (const f of jsFiles) edit(join("js", f), (s) => s.replace(/(from\s+"\.\/[A-Za-z0-9_-]+\.js)"/g, `$1?v=${version}"`));
must(readFileSync(join(out, "js/app.js"), "utf8").includes(`./chords.js?v=${version}`), "app.js import 버전");

// 3) 서비스워커가 미리 저장할 파일 목록
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [relative(out, p).split("\\\\").join("/")];
});
const skip = new Set(["sw.js", "version.json", "_headers", "_redirects"]);
const assets = ["./", ...walk(out).filter((f) => !skip.has(f)).map((f) =>
  f === "css/app.css" || (f.startsWith("js/") && f.endsWith(".js")) ? `${f}?v=${version}` : f)];
const sw = edit("sw.js", (s) => s
  .replace('const ASSETS = ["./"]; /* __ASSETS__ */', `const ASSETS = ${JSON.stringify(assets)};`)
  .replaceAll("__APP_VERSION__", version));
must(sw.after.includes(`js/app.js?v=${version}`) && !sw.after.includes("__APP_VERSION__") && !sw.after.includes("__ASSETS__"), "sw.js 버전·목록");

// 4) 새 버전 확인용 파일
writeFileSync(join(out, "version.json"), JSON.stringify({ version }) + "\n");
console.log(`버전 ${version}: 파일 ${assets.length}개를 서비스워커 저장 목록에 넣음`);
