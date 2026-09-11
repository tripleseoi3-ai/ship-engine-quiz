// 배포용 정적 사이트를 만든다.
//
//   시험대비.html  ->  site/index.html
//
// 원본은 그대로 두고 site/ 만 다시 만든다. site/ 는 git 에 넣지 않는다.
// 이 파일이 하는 일은 복사 하나뿐이지만, 복사하면서 "정말 혼자 열리는지"를 검사한다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "시험대비.html");
const OUT_DIR = path.join(ROOT, "site");
const OUT = path.join(OUT_DIR, "index.html");

function die(message) {
  console.error("\n  빌드 실패: " + message + "\n");
  process.exit(1);
}

if (!fs.existsSync(SRC)) die(`원본이 없습니다: ${SRC}`);

const html = fs.readFileSync(SRC, "utf8");

// 1. 바깥에서 무언가 불러오면 안 된다 (완료기준.md 4장)
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
const found = OUTBOUND.filter(([re]) => re.test(html)).map(([, name]) => name);
if (found.length) die(`바깥에서 불러오는 것이 있습니다: ${found.join(", ")}`);

// 2. 문제 수가 완료기준(10개 이상)을 넘는지
const count = (html.match(/^\s{4}type:\s*"(choice|ox|short)"/gm) || []).length;
if (count < 10) die(`문제가 ${count}개뿐입니다. 완료기준은 10개 이상입니다.`);

// 3. 해설마다 출처가 붙어 있는지
const srcCount = (html.match(/^\s{4}src:\s*"/gm) || []).length;
if (srcCount !== count) die(`문제 ${count}개 중 출처가 붙은 것은 ${srcCount}개입니다. 전부 있어야 합니다.`);

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
console.log("");
console.log(`  빌드 완료`);
console.log(`    문제 ${count}개 · 출처 ${srcCount}개 · 외부 요청 0건`);
console.log(`    ${path.relative(ROOT, SRC)}  ->  ${path.relative(ROOT, OUT)}  (${kb} KB)`);
console.log("");
