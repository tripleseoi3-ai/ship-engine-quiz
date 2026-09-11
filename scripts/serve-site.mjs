// 빌드된 site/ 폴더를 그대로 띄워 본다. 배포된 주소와 같은 모양으로 확인하기 위한 것이다.
//
//   node scripts/build.mjs        먼저 빌드하고
//   node scripts/serve-site.mjs   그다음 이 명령으로 http://localhost:4173 을 연다
//
// 파일을 읽어 내보내기만 한다. 저장하거나 바깥으로 보내는 일은 하지 않는다.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "site");
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

if (!fs.existsSync(DIR)) {
  console.error("\n  site/ 폴더가 없습니다. 먼저 node scripts/build.mjs 를 실행하세요.\n");
  process.exit(1);
}

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const file = path.join(DIR, rel);

  // site/ 밖으로 나가는 경로는 거절한다.
  if (!file.startsWith(DIR)) {
    res.writeHead(403).end("403");
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("찾을 수 없습니다: " + rel);
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\n  site/ 를 http://localhost:${PORT} 에서 띄웠습니다. 끄려면 Ctrl+C.\n`);
});
