// 배포용 정적 사이트를 만든다.
//
//   web/index.html          ->  site/index.html     전체 앱 (과목 추가·출제·오답노트)
//   server/public/style.css ->  site/style.css      모양 (디자인.md 를 따른다)
//   server/lib/study.js     ->  site/study.js       자료 해석·출제·채점 (브라우저용으로 변환)
//   web/app.js              ->  site/app.js         화면 동작
//   시험대비.html            ->  site/20.html        미리 만들어 둔 고정 20문항
//
// 문제를 만들고 채점하는 규칙은 server/lib/study.js 한 곳에만 있다.
// 로컬 서버와 이 사이트가 같은 파일을 쓴다 — 두 군데 고칠 일이 없다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "site");

function die(message) {
  console.error("\n  빌드 실패: " + message + "\n");
  process.exit(1);
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) die(`파일이 없습니다: ${rel}`);
  return fs.readFileSync(p, "utf8");
};

/* ---------- 1. 고정 20문항 페이지 검사 ---------- */

const quizPage = read("시험대비.html");

// 주석에 적힌 낱말이 아니라 실제로 무언가를 불러오는 표현만 잡는다.
const OUTBOUND = [
  [/https?:\/\/[^\s"'`)]+/i, "외부 주소(http)"],
  [/<link\b/i, "<link> 태그"],
  [/<[a-z][^>]*\ssrc\s*=/i, "태그의 src 속성"],
  [/@import\b/i, "@import"],
  [/\bfetch\s*\(/i, "fetch()"],
  [/\bnew\s+XMLHttpRequest\b/i, "XMLHttpRequest"],
  [/@font-face/i, "@font-face"],
];
const outbound = OUTBOUND.filter(([re]) => re.test(quizPage)).map(([, n]) => n);
if (outbound.length) die(`시험대비.html 이 바깥에서 불러옵니다: ${outbound.join(", ")}`);

const qCount = (quizPage.match(/^\s{4}type:\s*"(choice|ox|short)"/gm) || []).length;
if (qCount < 10) die(`시험대비.html 의 문제가 ${qCount}개뿐입니다. 완료기준은 10개 이상입니다.`);

const sCount = (quizPage.match(/^\s{4}src:\s*"/gm) || []).length;
if (sCount !== qCount) die(`문제 ${qCount}개 중 출처가 붙은 것은 ${sCount}개입니다. 전부 있어야 합니다.`);

/* ---------- 2. 출제·채점 규칙을 브라우저용으로 ---------- */

const studySrc = read("server/lib/study.js");
const cut = studySrc.indexOf("module.exports");
if (cut < 0) die("server/lib/study.js 에서 module.exports 를 찾지 못했습니다.");

const studyBrowser =
  "/* 이 파일은 scripts/build.mjs 가 server/lib/study.js 에서 만들어 냅니다.\n" +
  "   직접 고치지 마세요 — 고칠 곳은 server/lib/study.js 입니다. */\n" +
  studySrc.slice(0, cut) +
  `window.Study = {
  parseMaterial, summarize, availability, makeQuestions,
  normalize, isCorrect, splitLines, TYPE_LABEL,
};
`;

for (const name of ["parseMaterial", "summarize", "availability", "makeQuestions", "isCorrect", "TYPE_LABEL"]) {
  if (!new RegExp(`\\b${name}\\b`).test(studyBrowser)) die(`브라우저용 study.js 에 ${name} 이 빠졌습니다.`);
}

/* ---------- 3. 내보내기 ---------- */

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ["web/index.html", "index.html"],
  ["web/app.js", "app.js"],
  ["server/public/style.css", "style.css"],
];
for (const [from, to] of files) fs.writeFileSync(path.join(OUT_DIR, to), read(from), "utf8");
fs.writeFileSync(path.join(OUT_DIR, "study.js"), studyBrowser, "utf8");
fs.writeFileSync(path.join(OUT_DIR, "20.html"), quizPage, "utf8");

const kb = (p) => (fs.statSync(path.join(OUT_DIR, p)).size / 1024).toFixed(1) + " KB";

console.log("");
console.log("  빌드 완료");
console.log(`    index.html  전체 앱 (과목 추가 · 출제 · 오답노트)   ${kb("index.html")}`);
console.log(`    app.js      화면 동작                              ${kb("app.js")}`);
console.log(`    study.js    출제·채점 규칙 (server/lib 에서 생성)   ${kb("study.js")}`);
console.log(`    style.css   모양 (디자인.md)                       ${kb("style.css")}`);
console.log(`    20.html     고정 ${qCount}문항 · 출처 ${sCount}개 · 외부요청 0건   ${kb("20.html")}`);
console.log("");
