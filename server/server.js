"use strict";

/* ============================================================
   백엔드 — 이 파일은 브라우저로 내려가지 않는다.

   하는 일 네 가지
     1) 자료를 소유한다        data/db.json 에 읽고 쓴다
     2) 문제를 만든다          lib/study.js 를 불러 쓴다
     3) 채점한다               정답은 여기서만 안다
     4) 프론트엔드를 내보낸다   public/ 의 파일을 그대로 준다

   포트를 바꾸려면:  set PORT=4000 && node server.js
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const study = require("./lib/study");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const QUIZ_SIZE = 10;

/* ---------- 저장소 ---------- */

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.subjects)) throw new Error("형식 오류");
    return parsed;
  } catch {
    return { version: 1, subjects: [] };
  }
}

function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE); // 쓰다 만 파일이 남지 않게
}

let db = loadDb();

const newId = () => crypto.randomBytes(6).toString("hex");
const findSubject = (id) => db.subjects.find((s) => s.id === id);

/* ---------- 시험 세션 ----------
   정답이 든 문제 묶음은 서버 메모리에만 둔다.
   서버를 끄면 사라진다 — 풀던 시험은 다시 시작해야 한다. */

const sessions = new Map();

function pruneSessions() {
  const cutoff = Date.now() - 1000 * 60 * 60 * 3; // 3시간
  for (const [id, s] of sessions) if (s.createdAt < cutoff) sessions.delete(id);
}

/* ---------- 응답 도우미 ---------- */

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

const fail = (res, status, message) => sendJson(res, status, { error: message });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 1024 * 1024) { reject(new Error("보낸 내용이 너무 큽니다 (1MB 제한)")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); }
      catch { reject(new Error("보낸 내용이 JSON 형식이 아닙니다")); }
    });
    req.on("error", reject);
  });
}

/* 문제에서 정답·해설·출처를 떼어내고 프론트에 보낼 몫만 남긴다.
   이 함수가 프론트/백엔드 경계다. */
function forClient(q, index) {
  return {
    index,
    type: q.type,
    typeLabel: study.TYPE_LABEL[q.type] || q.type,
    prompt: q.prompt,
    choices: q.choices || null,
  };
}

function subjectCard(s) {
  return {
    id: s.id,
    name: s.name,
    lines: study.splitLines(s.raw).length,
    wrongCount: (s.wrongs || []).length,
    lastAt: s.lastAt || null,
    lastScore: s.lastScore || null,
  };
}

/* ---------- API ---------- */

const api = {
  "GET /api/health": async () => ({ ok: true, questionsPerQuiz: QUIZ_SIZE }),

  "GET /api/subjects": async () => ({ subjects: db.subjects.map(subjectCard) }),

  "POST /api/subjects": async (req, res, _p, body) => {
    const name = String(body.name || "").trim();
    const raw = String(body.raw || "");
    if (!name) return fail(res, 400, "과목명을 입력하세요.");
    if (raw.trim().length < 20) return fail(res, 400, "학습 자료가 너무 짧습니다. 20자 이상 붙여넣으세요.");

    const subject = {
      id: newId(), name, raw,
      createdAt: new Date().toISOString(),
      lastAt: null, lastScore: null, wrongs: [],
    };
    db.subjects.push(subject);
    saveDb(db);
    return { subject: subjectCard(subject) };
  },

  "GET /api/subjects/:id": async (req, res, p) => {
    const s = findSubject(p.id);
    if (!s) return fail(res, 404, "그런 과목이 없습니다.");
    const m = study.parseMaterial(s.raw);
    const av = study.availability(m);
    return {
      id: s.id,
      name: s.name,
      lines: m.lines.length,
      termCount: av.termCount,
      kinds: ["choice", "ox", "short", "blank"].filter((k) => av[k]).map((k) => study.TYPE_LABEL[k]),
      summary: study.summarize(m),
      original: s.raw,          // 원문은 그대로 — 정리 화면에서 펼쳐 본다
      wrongCount: (s.wrongs || []).length,
      lastAt: s.lastAt || null,
      lastScore: s.lastScore || null,
    };
  },

  "DELETE /api/subjects/:id": async (req, res, p) => {
    const before = db.subjects.length;
    db.subjects = db.subjects.filter((s) => s.id !== p.id);
    if (db.subjects.length === before) return fail(res, 404, "그런 과목이 없습니다.");
    saveDb(db);
    return { deleted: true };
  },

  /* 시험 시작 — 문제만 내려간다. 정답은 서버에 남는다. */
  "POST /api/subjects/:id/quiz": async (req, res, p, body) => {
    const s = findSubject(p.id);
    if (!s) return fail(res, 404, "그런 과목이 없습니다.");
    pruneSessions();

    const mode = body.mode === "wrong" ? "wrong" : "new";
    let questions = [];
    let missing = [];

    if (mode === "wrong") {
      questions = (s.wrongs || []).map((w) => ({
        type: w.type, prompt: w.prompt, choices: w.choices || null,
        answer: w.answer, also: w.also || [], why: w.why || "", source: w.source || "",
      }));
      if (!questions.length) return fail(res, 400, "다시 풀 오답이 없습니다.");
    } else {
      const made = study.makeQuestions(study.parseMaterial(s.raw), QUIZ_SIZE, s.name);
      questions = made.questions;
      missing = made.missing;
    }

    const sessionId = newId();
    sessions.set(sessionId, {
      subjectId: s.id, mode, questions,
      answered: new Set(), right: 0,
      createdAt: Date.now(),
    });

    return {
      sessionId, mode, total: questions.length, missing,
      questions: questions.map(forClient),
    };
  },

  /* 채점 — 정답이 처음으로 프론트에 내려가는 지점 */
  "POST /api/quiz/:sid/answer": async (req, res, p, body) => {
    const sess = sessions.get(p.sid);
    if (!sess) return fail(res, 410, "시험이 만료되었습니다. 서버를 다시 켰거나 시간이 오래 지났습니다. 새로 시작하세요.");

    const index = Number(body.index);
    const q = sess.questions[index];
    if (!q) return fail(res, 400, "그런 문항 번호가 없습니다.");
    if (sess.answered.has(index)) return fail(res, 409, "이미 채점한 문항입니다.");

    const given = body.given == null ? "" : String(body.given);
    const correct = study.isCorrect(given, q);
    sess.answered.add(index);
    if (correct) sess.right++;

    const s = findSubject(sess.subjectId);
    if (s) {
      s.wrongs = s.wrongs || [];
      const sig = q.type + "|" + q.prompt;
      const at = s.wrongs.findIndex((w) => w.type + "|" + w.prompt === sig);

      if (correct) {
        if (at > -1) s.wrongs.splice(at, 1);              // 다시 맞히면 오답에서 빠진다
      } else if (at < 0) {
        s.wrongs.push({
          type: q.type, prompt: q.prompt, choices: q.choices || null,
          answer: q.answer, also: q.also || [], why: q.why || "", source: q.source || "",
          mine: given, at: new Date().toISOString(),
        });
      } else {
        s.wrongs[at].mine = given;
        s.wrongs[at].at = new Date().toISOString();
      }

      s.lastAt = new Date().toISOString();
      if (sess.answered.size === sess.questions.length) {
        s.lastScore = { right: sess.right, total: sess.questions.length, at: s.lastAt };
      }
      saveDb(db);
    }

    return {
      correct,
      answer: q.answer,
      why: q.why,
      source: q.source,
      gradingRule: (q.type === "short" || q.type === "blank")
        ? "띄어쓰기와 조사 차이는 정답으로 처리합니다." : null,
      progress: { answered: sess.answered.size, total: sess.questions.length, right: sess.right },
      wrongCount: s ? s.wrongs.length : 0,
    };
  },

  "GET /api/subjects/:id/wrongs": async (req, res, p) => {
    const s = findSubject(p.id);
    if (!s) return fail(res, 404, "그런 과목이 없습니다.");
    const wrongs = (s.wrongs || []).map((w) => ({
      type: w.type, typeLabel: study.TYPE_LABEL[w.type] || w.type,
      prompt: w.prompt, mine: w.mine || "", answer: w.answer,
      why: w.why || "", source: w.source || "", at: w.at || null,
    }));
    return { wrongs };
  },

  "DELETE /api/subjects/:id/wrongs": async (req, res, p) => {
    const s = findSubject(p.id);
    if (!s) return fail(res, 404, "그런 과목이 없습니다.");
    s.wrongs = [];
    saveDb(db);
    return { cleared: true };
  },
};

/* ---------- 라우팅 ---------- */

const ROUTES = Object.keys(api).map((key) => {
  const [method, pattern] = key.split(" ");
  const names = [];
  const regex = new RegExp("^" + pattern.replace(/:([A-Za-z]+)/g, (_, n) => {
    names.push(n);
    return "([^/]+)";
  }) + "$");
  return { method, regex, names, handler: api[key] };
});

function matchRoute(method, pathname) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    return { handler: r.handler, params };
  }
  return null;
}

/* ---------- 정적 파일 (프론트엔드) ---------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(PUBLIC_DIR, rel);

  // public/ 밖으로 나가려는 경로를 막는다 (../../ 같은 것)
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("허용되지 않는 경로입니다.");
  }

  fs.readFile(target, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("없는 주소입니다: " + pathname);
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": buf.length,
      "Cache-Control": "no-store",
    });
    res.end(buf);
  });
}

/* ---------- 서버 ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const started = Date.now();

  res.on("finish", () => {
    // 백엔드가 요청을 받는 게 눈에 보이도록 한 줄씩 찍는다
    console.log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started}ms)`);
  });

  if (!url.pathname.startsWith("/api/")) return serveStatic(res, url.pathname);

  const route = matchRoute(req.method, url.pathname);
  if (!route) return fail(res, 404, `그런 API 가 없습니다: ${req.method} ${url.pathname}`);

  try {
    const body = (req.method === "POST" || req.method === "PUT") ? await readBody(req) : {};
    const result = await route.handler(req, res, route.params, body);
    if (result !== undefined && !res.writableEnded) sendJson(res, 200, result);
  } catch (e) {
    if (!res.writableEnded) fail(res, 500, e.message || "서버에서 처리하지 못했습니다.");
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("  시험노트 서버가 떴습니다.");
  console.log("  주소 : http://localhost:" + PORT);
  console.log("  저장 : " + DB_FILE);
  console.log("  끄기 : 이 창에서 Ctrl+C");
  console.log("");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있습니다.`);
    console.error(`  다른 포트로 켜세요:  set PORT=4000 && node server.js\n`);
  } else {
    console.error("\n  서버를 켜지 못했습니다: " + e.message + "\n");
  }
  process.exit(1);
});
