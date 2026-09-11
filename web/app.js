"use strict";

/* ============================================================
   전체 앱 — 오늘 · 플래너 · 할 일 · 학습 기록
            · 과목 등록 · 정리 · 출제 · 채점 · 오답노트(복습 주기)

   서버가 없다. 전부 이 브라우저 안에서 돈다.
   - 자료 해석과 출제·채점 규칙 : study.js  (server/lib/study.js 에서 만들어진 것)
   - 저장                      : localStorage

   붙여넣은 자료는 어디로도 전송되지 않는다.
   모양은 디자인.md 를 따른다. 여기서 새 색·새 글자 크기를 만들지 않는다.
   ============================================================ */

const S = window.Study;
const KEY = "exam-notebook/web/v1";
const QUIZ_SIZE = 10;
const EXAM_SIZE = 20;

/* 오답을 다시 띄우는 간격(일). 틀리면 0단계로 돌아가고,
   맞힐 때마다 한 단계 올라간다. 4단계를 넘기면 오답 노트에서 빠진다. */
const REVIEW_STEPS = [1, 3, 7, 14];

let storeOk = true;
let storeWhy = "";
let clockTimer = null;

/* ---------- 날짜 ---------- */

const DAY_MS = 86400000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

const pad2 = (n) => String(n).padStart(2, "0");

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

const todayKey = () => ymd(new Date());

function addDays(key, n) {
  const d = parseYmd(key) || new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function daysBetween(from, to) {
  const a = parseYmd(from), b = parseYmd(to);
  if (!a || !b) return null;
  return Math.round((b - a) / DAY_MS);
}

/** 디자인.md 8장 — 화면에는 `9.15 (월)` 모양으로 적는다. */
function fmtDay(key) {
  const d = parseYmd(key);
  if (!d) return "—";
  return `${d.getMonth() + 1}.${pad2(d.getDate())} (${WEEKDAY[d.getDay()]})`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function mmss(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

/** 월요일부터 시작하는 주. */
function startOfWeek(key) {
  const d = parseYmd(key) || new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

/* ---------- 저장 ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function normalizeWrong(w) {
  const today = todayKey();
  return {
    type: w.type, prompt: String(w.prompt || ""), choices: w.choices || null,
    answer: w.answer, also: Array.isArray(w.also) ? w.also : [],
    why: w.why || "", source: w.source || "",
    mine: String(w.mine || ""), at: w.at || new Date().toISOString(),
    stage: Number.isInteger(w.stage) ? w.stage : 0,
    due: parseYmd(w.due) ? w.due : today,
    missCount: Number.isInteger(w.missCount) ? w.missCount : 1,
  };
}

function normalizeSubject(s) {
  return {
    id: s.id || uid(),
    name: String(s.name || "이름 없는 과목"),
    raw: String(s.raw || ""),
    createdAt: s.createdAt || new Date().toISOString(),
    lastAt: s.lastAt || null,
    lastScore: s.lastScore || null,
    examAt: parseYmd(s.examAt) ? s.examAt : null,
    wrongs: (Array.isArray(s.wrongs) ? s.wrongs : []).filter((w) => w && w.prompt).map(normalizeWrong),
  };
}

/** v1(과목만) 저장본을 v2(과목 + 계획 + 할 일 + 기록)로 올린다. 데이터를 버리지 않는다. */
function migrate(p) {
  const out = { version: 2, subjects: [], plans: [], todos: [], sessions: [] };
  if (!p || typeof p !== "object") return out;

  if (Array.isArray(p.subjects)) out.subjects = p.subjects.filter(Boolean).map(normalizeSubject);

  if (Array.isArray(p.plans)) {
    out.plans = p.plans.filter((x) => x && typeof x.text === "string" && parseYmd(x.date)).map((x) => ({
      id: x.id || uid(), date: x.date, subjectId: x.subjectId || null,
      text: String(x.text), done: !!x.done,
    }));
  }
  if (Array.isArray(p.todos)) {
    out.todos = p.todos.filter((x) => x && typeof x.text === "string").map((x) => ({
      id: x.id || uid(), text: String(x.text), subjectId: x.subjectId || null,
      due: parseYmd(x.due) ? x.due : null, done: !!x.done,
      doneAt: x.doneAt || null, createdAt: x.createdAt || new Date().toISOString(),
    }));
  }
  if (Array.isArray(p.sessions)) {
    out.sessions = p.sessions.filter((x) => x && parseYmd(x.day)).map((x) => ({
      id: x.id || uid(), at: x.at || new Date().toISOString(), day: x.day,
      subjectId: x.subjectId || null, name: String(x.name || "—"),
      mode: x.mode || "new", total: Number(x.total) || 0, right: Number(x.right) || 0,
    }));
  }
  return out;
}

function loadStore() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return migrate(null);
    return migrate(JSON.parse(raw));
  } catch {
    storeOk = false;
    storeWhy = "이 브라우저가 저장을 막고 있습니다(시크릿 창이거나 사이트 데이터 차단).";
    return migrate(null);
  }
}

function saveStore() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state.store));
    if (!storeOk) { storeOk = true; storeWhy = ""; }
    return true;
  } catch (e) {
    storeOk = false;
    storeWhy = (e && e.name === "QuotaExceededError")
      ? "저장 공간이 꽉 찼습니다. 과목을 지우거나 내보낸 뒤 정리하세요."
      : "이 브라우저가 저장을 막고 있습니다. 창을 닫으면 사라집니다.";
    return false;
  }
}

const state = {
  store: loadStore(),
  activeId: null,
  view: "today",   // today | planner | todo | report | subject | new
  tab: "summary",  // subject 안에서만: summary | quiz | wrong
  quiz: null,
  week: startOfWeek(todayKey()),
};

const findSubject = (id) => state.store.subjects.find((s) => s.id === id);
const active = () => findSubject(state.activeId);
const subjectName = (id) => { const s = findSubject(id); return s ? s.name : null; };

/* ---------- 집계 ---------- */

function allWrongs() {
  const out = [];
  state.store.subjects.forEach((s) => (s.wrongs || []).forEach((w) => out.push({ w, s })));
  return out;
}

function dueWrongs() {
  const t = todayKey();
  return allWrongs().filter(({ w }) => String(w.due || t) <= t);
}

const openTodos = () => state.store.todos.filter((t) => !t.done);
const doneTodos = () => state.store.todos.filter((t) => t.done);

function todayTodos() {
  const t = todayKey();
  return openTodos().filter((x) => !x.due || x.due <= t);
}

const plansOn = (day) => state.store.plans.filter((p) => p.date === day);

/** 어제까지 이어 온 날 수. 오늘 아직 안 풀었으면 어제부터 센다. */
function streakDays() {
  const days = new Set(state.store.sessions.map((x) => x.day));
  let d = todayKey();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

function totalSolved() {
  return state.store.sessions.reduce((a, x) => ({ total: a.total + x.total, right: a.right + x.right }), { total: 0, right: 0 });
}

/** 가까운 시험부터. 지난 시험은 뒤로 보낸다. */
function examList() {
  const t = todayKey();
  return state.store.subjects
    .filter((s) => s.examAt)
    .map((s) => ({ s, left: daysBetween(t, s.examAt) }))
    .sort((a, b) => (a.left < 0) - (b.left < 0) || a.left - b.left);
}

/** 오답이 어느 절에서 나왔는지 센다 — 약한 곳. */
function weakSpots(limit) {
  const map = new Map();
  allWrongs().forEach(({ w, s }) => {
    const key = w.source || `${s.name} · 출처 없음`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, limit || 8);
}

/** 최근 n일 동안 날짜별로 푼 문항 수. 0인 날도 남긴다 (디자인.md 9장). */
function recentDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(todayKey(), -i);
    const total = state.store.sessions.filter((x) => x.day === day).reduce((a, x) => a + x.total, 0);
    out.push({ day, total });
  }
  return out;
}

/* ---------- 화면 도우미 ---------- */

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function panel(title, aside) {
  const box = el("section", "panel");
  const head = el("header", "panel-head");
  head.appendChild(el("h2", null, title));
  if (aside) head.appendChild(el("span", "aside", aside));
  const body = el("div", "panel-body");
  box.append(head, body);
  return { box, body };
}

function btn(label, kind, onClick) {
  const b = el("button", "btn" + (kind ? " " + kind : ""), label);
  b.type = "button";
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

function notice(kind, strong, rest) {
  const box = el("div", "msg" + (kind ? " " + kind : ""));
  if (strong) box.appendChild(el("b", null, strong));
  if (rest) box.appendChild(document.createTextNode(rest));
  return box;
}

function field(label, node, wide) {
  const f = el("div", "f" + (wide ? " wide" : ""));
  f.append(el("div", "lb2", label), node);
  return f;
}

function textInput(placeholder) {
  const i = document.createElement("input");
  i.type = "text";
  if (placeholder) i.placeholder = placeholder;
  return i;
}

function dateInput(value) {
  const i = document.createElement("input");
  i.type = "date";
  if (value) i.value = value;
  return i;
}

function subjectSelect(value, firstLabel) {
  const s = document.createElement("select");
  const none = document.createElement("option");
  none.value = "";
  none.textContent = firstLabel || "과목 없음";
  s.appendChild(none);
  state.store.subjects.forEach((sub) => {
    const o = document.createElement("option");
    o.value = sub.id;
    o.textContent = sub.name;
    if (sub.id === value) o.selected = true;
    s.appendChild(o);
  });
  return s;
}

function promptNode(text) {
  const p = el("p", "question");
  String(text).split("\n").forEach((line, i) => {
    if (i) p.appendChild(document.createElement("br"));
    line.split("____").forEach((part, j) => {
      if (j) p.appendChild(el("span", "blank", "____"));
      if (part) p.appendChild(document.createTextNode(part));
    });
  });
  return p;
}

/** 디자인.md 8장 — 남은 날은 숫자로 적는다. 빨강만으로 알리지 않는다. */
function ddayBadge(examAt) {
  const left = daysBetween(todayKey(), examAt);
  if (left === null) return null;
  if (left < 0) return el("span", "badge b-past", "지남");
  if (left === 0) return el("span", "badge b-near", "D-DAY");
  return el("span", "badge" + (left <= 7 ? " b-near" : ""), "D-" + left);
}

/** 디자인.md 7장 — 끝난 줄은 취소선 + `완료` 글자로도 구분된다. */
function checkRow(opt) {
  const li = el("li");
  const row = el("div", "row" + (opt.done ? " done" : ""));

  const lab = document.createElement("label");
  lab.className = "pick";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "chk";
  cb.checked = !!opt.done;
  cb.addEventListener("change", opt.onToggle);
  lab.append(cb, el("span", "tx", opt.text));
  row.appendChild(lab);

  const rt = el("span", "rt");
  if (opt.done) rt.appendChild(el("span", "fin", "완료"));
  if (opt.onDelete) {
    const d = el("button", "btn-mini", "삭제");
    d.type = "button";
    d.addEventListener("click", opt.onDelete);
    rt.appendChild(d);
  }
  row.appendChild(rt);

  if (opt.meta) row.appendChild(el("span", "mt", opt.meta));
  li.appendChild(row);
  return li;
}

function figure(k, v, u, cls) {
  const f = el("div", "fig");
  f.appendChild(el("div", "k", k));
  f.appendChild(el("div", "v" + (cls ? " " + cls : ""), v));
  if (u) f.appendChild(el("div", "u", u));
  return f;
}

/** 디자인.md 9장 — 막대 오른쪽에 숫자를 반드시 글자로 적는다. */
function barList(items) {
  const max = Math.max(1, ...items.map((x) => x.n));
  const ul = el("ul", "bars");
  items.forEach((it) => {
    const li = el("li");
    li.appendChild(el("span", "nm", it.label));
    const t = el("span", "t");
    const i = document.createElement("i");
    i.style.width = Math.round(it.n / max * 100) + "%";
    t.appendChild(i);
    li.append(t, el("span", "n", String(it.n)));
    ul.appendChild(li);
  });
  return ul;
}

function emptyLine(text) {
  const p = el("p", "empty", text);
  p.style.margin = "0";
  return p;
}

/* ---------- 고정 영역 ---------- */

const NAV = [
  { id: "today", label: "오늘" },
  { id: "planner", label: "플래너" },
  { id: "todo", label: "할 일" },
  { id: "report", label: "학습 기록" },
];

function renderChrome() {
  const subs = state.store.subjects;
  const wrongTotal = allWrongs().length;
  const due = dueWrongs().length;
  const todo = todayTodos().length;

  $("conn").className = storeOk ? "conn" : "conn down";
  $("connText").textContent = storeOk ? "이 브라우저에 저장" : "저장 안 됨";

  const chips = $("chips");
  chips.innerHTML = "";
  const chip = (label, n, alert) => {
    const c = el("span", "chip" + (alert ? " alert" : ""));
    c.append(document.createTextNode(label + " "), el("b", null, String(n)));
    return c;
  };
  chips.append(
    chip("등록 과목", subs.length),
    chip("오늘 복습", due, due > 0),
    chip("할 일", todo, false),
    chip("오답", wrongTotal, false)
  );
  const near = examList()[0];
  if (near && near.left >= 0) {
    const c = el("span", "chip" + (near.left <= 7 ? " alert" : ""));
    c.append(document.createTextNode(near.s.name + " "), el("b", null, near.left === 0 ? "D-DAY" : "D-" + near.left));
    chips.appendChild(c);
  }

  const nav = $("nav");
  nav.innerHTML = "";
  NAV.forEach((d) => {
    const li = el("li");
    const b = el("button", "course");
    b.type = "button";
    b.setAttribute("aria-current", state.view === d.id ? "true" : "false");
    b.appendChild(el("span", "nm", d.label));
    let n = "";
    let bad = false;
    if (d.id === "today") { n = due ? `복습 ${due}` : ""; bad = due > 0; }
    if (d.id === "todo") { n = todo ? `${todo}건` : ""; }
    if (d.id === "planner") { const c = plansOn(todayKey()).filter((p) => !p.done).length; n = c ? `${c}건` : ""; }
    if (d.id === "report") { n = state.store.sessions.length ? `${state.store.sessions.length}회` : ""; }
    b.appendChild(el("span", bad ? "n bad" : "n", n));
    b.addEventListener("click", () => { state.view = d.id; state.quiz = null; render(); });
    li.appendChild(b);
    nav.appendChild(li);
  });

  const list = $("courses");
  list.innerHTML = "";
  $("courseCount").textContent = subs.length;
  $("coursesEmpty").hidden = subs.length > 0;

  subs.forEach((s) => {
    const li = el("li");
    const b = el("button", "course");
    b.type = "button";
    b.setAttribute("aria-current", state.view === "subject" && s.id === state.activeId ? "true" : "false");
    b.appendChild(el("span", "nm", s.name));
    const w = (s.wrongs || []).length;
    b.appendChild(el("span", w ? "n bad" : "n", w ? `오답 ${w}` : `${S.splitLines(s.raw).length}줄`));
    b.addEventListener("click", () => {
      state.activeId = s.id; state.view = "subject"; state.tab = "summary"; state.quiz = null; render();
    });
    li.appendChild(b);
    list.appendChild(li);
  });
}

function renderCrumb() {
  const c = $("crumb");
  c.innerHTML = "";
  const parts = ["홈"];
  if (state.view === "new") parts.push("과목 등록");
  else if (state.view === "subject") {
    const cur = active();
    parts.push("내 과목");
    if (cur) {
      parts.push(cur.name);
      parts.push(state.tab === "quiz" ? "문제 풀이" : state.tab === "wrong" ? "오답 노트" : "학습 자료");
    }
  } else {
    const d = NAV.find((x) => x.id === state.view);
    parts.push(d ? d.label : "오늘");
  }
  parts.forEach((p, i) => {
    if (i) c.appendChild(el("span", "sl", "›"));
    c.appendChild(el("span", i === parts.length - 1 ? "here" : null, p));
  });
}

function renderStats() {
  const box = $("statPanel");
  const s = active();
  if (state.view !== "subject" || !s) { box.hidden = true; return; }
  box.hidden = false;

  const m = S.parseMaterial(s.raw);
  const av = S.availability(m);
  const kinds = ["choice", "ox", "short", "blank"].filter((k) => av[k]);
  const wrongs = s.wrongs || [];
  const t = todayKey();
  const dueN = wrongs.filter((w) => String(w.due || t) <= t).length;

  const dl = $("stats");
  dl.innerHTML = "";
  const row = (k, v, cls) => {
    const w = el("div", "stat");
    w.append(el("dt", null, k), el("dd", cls || null, v));
    dl.appendChild(w);
  };
  row("자료 분량", m.lines.length + "줄");
  row("추출 용어", av.termCount + "개");
  row("출제 가능 유형", kinds.length + " / 4", kinds.length === 4 ? "ok" : null);
  row("오답", wrongs.length + "건", wrongs.length ? "bad" : "ok");
  row("오늘 복습", dueN + "건", dueN ? "bad" : "ok");
  row("시험일", s.examAt ? fmtDay(s.examAt) : "미정");
  row("최근 학습", fmtDate(s.lastAt));
  if (s.lastScore) row("최근 회차", `${s.lastScore.right} / ${s.lastScore.total}`);
}

function tabs() {
  const bar = el("div", "tabs");
  bar.setAttribute("role", "tablist");
  const cur = active();
  [
    { id: "summary", label: "학습 자료" },
    { id: "quiz", label: "문제 풀이" },
    { id: "wrong", label: "오답 노트", n: (cur.wrongs || []).length },
  ].forEach((d) => {
    const t = el("button", "tab");
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", state.tab === d.id ? "true" : "false");
    t.appendChild(el("span", null, d.label));
    if (d.n) t.appendChild(el("span", "n hot", String(d.n)));
    t.addEventListener("click", () => {
      state.tab = d.id;
      if (d.id !== "quiz") state.quiz = null;
      render();
    });
    bar.appendChild(t);
  });
  return bar;
}

/* ============================================================
   화면 1. 오늘
   ============================================================ */

function viewToday() {
  const frag = document.createDocumentFragment();
  const t = todayKey();
  const due = dueWrongs();
  const todos = todayTodos();
  const plans = plansOn(t);
  const openPlans = plans.filter((p) => !p.done);

  /* 요약 + 그 화면의 주 버튼 하나 */
  const p1 = panel("오늘", fmtDay(t));
  const figs = el("div", "figs");
  figs.append(
    figure("연속 학습", String(streakDays()), "일"),
    figure("오늘 복습할 오답", String(due.length), "건", due.length ? "hot" : "ok"),
    figure("남은 할 일", String(todos.length), "건"),
    figure("오늘 계획", `${plans.length - openPlans.length} / ${plans.length}`, "끝냄")
  );
  p1.body.appendChild(figs);

  const row = el("div", "btn-row");
  if (due.length) {
    row.appendChild(btn(`오늘 복습 시작 (${due.length}문항)`, "btn-primary", () => startReview(due)));
  } else if (state.store.subjects.length) {
    row.appendChild(btn("새 문제 풀기", "btn-primary", () => {
      if (!state.activeId) state.activeId = state.store.subjects[0].id;
      state.view = "subject"; state.tab = "quiz"; state.quiz = null; render();
    }));
  } else {
    row.appendChild(btn("첫 과목 등록하기", "btn-primary", () => { state.view = "new"; render(); }));
  }
  if (due.length === 0 && allWrongs().length) {
    row.appendChild(btn("오답 노트 보기", null, () => {
      const first = allWrongs()[0];
      state.activeId = first.s.id; state.view = "subject"; state.tab = "wrong"; render();
    }));
  }
  p1.body.appendChild(row);

  if (due.length) {
    const m = notice(null, null, `틀린 문제는 ${REVIEW_STEPS.join("·")}일 간격으로 다시 올라옵니다. ${REVIEW_STEPS.length}번 연속으로 맞히면 오답 노트에서 빠집니다.`);
    m.style.marginTop = "14px";
    p1.body.appendChild(m);
  }
  frag.appendChild(p1.box);

  /* 시험일 */
  const exams = examList();
  const p2 = panel("시험일", exams.length ? `${exams.length}과목` : "미정");
  if (!exams.length) {
    p2.body.appendChild(emptyLine("아직 시험일을 정한 과목이 없습니다. 플래너에서 과목마다 시험 날짜를 고르면 여기에 남은 날이 나옵니다."));
  } else {
    p2.body.className = "panel-body tight";
    const ul = el("ul", "rows");
    exams.forEach(({ s, left }) => {
      const li = el("li");
      const r = el("div", "row plain");
      r.appendChild(el("span", "tx", s.name));
      const rt = el("span", "rt");
      const b = ddayBadge(s.examAt);
      if (b) rt.appendChild(b);
      r.appendChild(rt);
      r.appendChild(el("span", "mt",
        `${fmtDay(s.examAt)} · ${left < 0 ? "지난 시험" : left === 0 ? "오늘이 시험" : "남은 " + left + "일"}`));
      li.appendChild(r);
      ul.appendChild(li);
    });
    p2.body.appendChild(ul);
    const f = el("div", "panel-body");
    f.style.borderTop = "1px solid var(--line)";
    const r2 = el("div", "btn-row");
    r2.style.marginTop = "0";
    r2.appendChild(btn("플래너에서 고치기", "btn-text", () => { state.view = "planner"; render(); }));
    f.appendChild(r2);
    p2.box.appendChild(f);
  }
  frag.appendChild(p2.box);

  /* 오늘 할 일 */
  const p3 = panel("오늘 할 일", `${todos.length}건`);
  if (!todos.length) {
    p3.body.appendChild(emptyLine("오늘까지 끝낼 할 일이 없습니다. ‘할 일’ 화면에서 추가할 수 있습니다."));
  } else {
    p3.body.className = "panel-body tight";
    const ul = el("ul", "rows");
    todos.forEach((x) => ul.appendChild(todoRow(x)));
    p3.body.appendChild(ul);
  }
  const f3 = el("div", "panel-body");
  f3.style.borderTop = "1px solid var(--line)";
  const r3 = el("div", "btn-row");
  r3.style.marginTop = "0";
  r3.appendChild(btn("할 일 전체 보기", "btn-text", () => { state.view = "todo"; render(); }));
  f3.appendChild(r3);
  p3.box.appendChild(f3);
  frag.appendChild(p3.box);

  /* 오늘 계획 */
  const p4 = panel("오늘 계획", `${plans.length}건`);
  if (!plans.length) {
    p4.body.appendChild(emptyLine("오늘 날짜에 넣어 둔 계획이 없습니다. 플래너에서 시험일까지 자동으로 나눌 수 있습니다."));
  } else {
    p4.body.className = "panel-body tight";
    const ul = el("ul", "rows");
    plans.forEach((x) => ul.appendChild(planRow(x)));
    p4.body.appendChild(ul);
  }
  const f4 = el("div", "panel-body");
  f4.style.borderTop = "1px solid var(--line)";
  const r4 = el("div", "btn-row");
  r4.style.marginTop = "0";
  r4.appendChild(btn("플래너 열기", "btn-text", () => { state.view = "planner"; render(); }));
  f4.appendChild(r4);
  p4.box.appendChild(f4);
  frag.appendChild(p4.box);

  return frag;
}

/* ============================================================
   화면 2. 플래너
   ============================================================ */

function planRow(p) {
  const name = subjectName(p.subjectId);
  return checkRow({
    done: p.done,
    text: p.text,
    meta: [name, fmtDay(p.date)].filter(Boolean).join(" · "),
    onToggle: () => { p.done = !p.done; saveStore(); render(); },
    onDelete: () => {
      state.store.plans = state.store.plans.filter((x) => x.id !== p.id);
      saveStore(); render();
    },
  });
}

function viewPlanner() {
  const frag = document.createDocumentFragment();
  const t = todayKey();

  /* 시험일 정하기 */
  const p1 = panel("과목별 시험일", `${state.store.subjects.length}과목`);
  if (!state.store.subjects.length) {
    p1.body.appendChild(emptyLine("등록된 과목이 없습니다. 왼쪽에서 과목을 먼저 등록하세요."));
  } else {
    p1.body.appendChild(notice(null, null, "날짜를 고르면 바로 저장됩니다. 시험일을 정하면 자료의 절을 남은 날짜에 자동으로 나눠 줄 수 있습니다."));
    const wrap = el("div");
    wrap.style.marginTop = "14px";
    state.store.subjects.forEach((s) => {
      const line = el("div", "inline");
      line.style.marginTop = "10px";
      const d = dateInput(s.examAt || "");
      d.addEventListener("change", () => {
        s.examAt = d.value || null;
        saveStore();
        render();
      });
      const nameBox = el("div", "f wide");
      nameBox.append(el("div", "lb2", "과목"), el("div", null, s.name));
      line.append(nameBox, field("시험일", d));

      const act = el("div", "f");
      const b = btn("남은 날에 자동으로 나누기", null, () => autoPlan(s));
      b.disabled = !s.examAt;
      act.append(el("div", "lb2", " "), b);
      line.appendChild(act);

      const badge = ddayBadge(s.examAt || "");
      if (badge) {
        const bb = el("div", "f");
        bb.append(el("div", "lb2", "남은 날"), badge);
        line.appendChild(bb);
      }
      wrap.appendChild(line);
    });
    p1.body.appendChild(wrap);
  }
  frag.appendChild(p1.box);

  /* 주간 계획 — 하루 한 줄씩 세로로 7줄 (디자인.md 8장) */
  const weekEnd = addDays(state.week, 6);
  const p2 = panel("주간 계획", `${fmtDay(state.week)} — ${fmtDay(weekEnd)}`);
  p2.body.className = "panel-body tight";

  const nav = el("div", "panel-body");
  nav.style.paddingBottom = "0";
  const navRow = el("div", "btn-row");
  navRow.style.marginTop = "0";
  navRow.append(
    btn("‹ 지난 주", null, () => { state.week = addDays(state.week, -7); render(); }),
    btn("이번 주", null, () => { state.week = startOfWeek(todayKey()); render(); }),
    btn("다음 주 ›", null, () => { state.week = addDays(state.week, 7); render(); })
  );
  nav.appendChild(navRow);
  p2.body.appendChild(nav);

  const exams = examList();
  const days = el("ul", "days");
  days.style.marginTop = "14px";
  for (let i = 0; i < 7; i++) {
    const day = addDays(state.week, i);
    const items = plansOn(day);
    const li = el("li", day === t ? "now" : null);
    const h = el("div", "day-h");
    h.appendChild(el("span", "d", fmtDay(day)));
    if (day === t) h.appendChild(el("span", "badge b-today", "오늘"));
    exams.forEach(({ s }) => {
      if (s.examAt === day) h.appendChild(el("span", "badge b-near", "시험 · " + s.name));
    });
    h.appendChild(el("span", "cnt", items.length ? `${items.filter((x) => x.done).length} / ${items.length}` : "계획 없음"));
    li.appendChild(h);
    if (!items.length) {
      li.appendChild(el("div", "day-empty", "이 날에 넣어 둔 계획이 없습니다."));
    } else {
      const ul = el("ul", "rows");
      items.forEach((x) => ul.appendChild(planRow(x)));
      li.appendChild(ul);
    }
    days.appendChild(li);
  }
  p2.body.appendChild(days);
  frag.appendChild(p2.box);

  /* 계획 추가 — 이 화면의 주 버튼 */
  const p3 = panel("계획 추가");
  const date = dateInput(t);
  const sub = subjectSelect(state.activeId || "", "과목 없음");
  const text = textInput("예: 항해학 3장 표 외우기");
  const line = el("div", "inline");
  line.append(field("날짜", date), field("과목", sub), field("할 내용", text, true));
  p3.body.appendChild(line);

  const msg = notice("bad");
  msg.hidden = true;
  msg.style.marginTop = "10px";
  p3.body.appendChild(msg);

  const r = el("div", "btn-row");
  r.appendChild(btn("계획 추가", "btn-primary", () => {
    const v = text.value.trim();
    if (!v) { msg.hidden = false; msg.textContent = "할 내용을 입력하세요."; text.focus(); return; }
    if (!parseYmd(date.value)) { msg.hidden = false; msg.textContent = "날짜를 고르세요."; date.focus(); return; }
    state.store.plans.push({ id: uid(), date: date.value, subjectId: sub.value || null, text: v, done: false });
    state.week = startOfWeek(date.value);
    saveStore();
    render();
  }));
  p3.body.appendChild(r);
  frag.appendChild(p3.box);

  return frag;
}

/** 자료의 절을 오늘부터 시험일까지 고르게 나눠 계획으로 넣는다. */
function autoPlan(s) {
  if (!s.examAt) { window.alert("먼저 시험일을 고르세요."); return; }
  const t = todayKey();
  const span = daysBetween(t, s.examAt);
  if (span === null) { window.alert("시험일을 읽지 못했습니다."); return; }
  if (span < 0) { window.alert(`「${s.name}」의 시험일(${fmtDay(s.examAt)})이 이미 지났습니다.`); return; }

  const m = S.parseMaterial(s.raw);
  const units = m.headings.filter(Boolean);
  const list = units.length ? units : ["전체 자료 훑어보기"];
  const window_ = Math.max(1, span);   // 시험 전날까지 나눈다

  const made = list.map((u, i) => ({
    id: uid(),
    date: addDays(t, Math.min(window_ - 1, Math.floor(i * window_ / list.length))),
    subjectId: s.id,
    text: `${u} 복습`,
    done: false,
  }));
  made.push({ id: uid(), date: s.examAt, subjectId: s.id, text: `${s.name} 시험 — 오답 노트 최종 점검`, done: false });

  const ok = window.confirm(
    `「${s.name}」 계획 ${made.length}건을 ${fmtDay(t)}부터 ${fmtDay(s.examAt)} 사이에 넣습니다.\n\n` +
    `${units.length ? `자료에서 찾은 절 ${units.length}개` : "자료에 절 제목(## 로 시작하는 줄)이 없어 한 건으로 묶었습니다"}\n\n` +
    `[확인] 넣기   [취소] 넣지 않기`
  );
  if (!ok) return;

  state.store.plans.push(...made);
  state.week = startOfWeek(t);
  saveStore();
  render();
}

/* ============================================================
   화면 3. 할 일
   ============================================================ */

function todoRow(x) {
  const name = subjectName(x.subjectId);
  const t = todayKey();
  let when = "마감 없음";
  if (x.due) {
    const left = daysBetween(t, x.due);
    when = left === 0 ? "오늘까지" : left < 0 ? `${-left}일 지남` : `${fmtDay(x.due)}까지`;
  }
  return checkRow({
    done: x.done,
    text: x.text,
    meta: [name, when].filter(Boolean).join(" · "),
    onToggle: () => {
      x.done = !x.done;
      x.doneAt = x.done ? new Date().toISOString() : null;
      saveStore();
      render();
    },
    onDelete: () => {
      state.store.todos = state.store.todos.filter((y) => y.id !== x.id);
      saveStore();
      render();
    },
  });
}

function viewTodo() {
  const frag = document.createDocumentFragment();
  const open = openTodos();
  const done = doneTodos();

  /* 추가 — 이 화면의 주 버튼 */
  const p1 = panel("할 일 추가");
  const text = textInput("예: 해사법규 오답 20문항 다시 풀기");
  const sub = subjectSelect(state.activeId || "", "과목 없음");
  const due = dateInput("");
  const line = el("div", "inline");
  line.append(field("할 일", text, true), field("과목", sub), field("마감일 (선택)", due));
  p1.body.appendChild(line);

  const msg = notice("bad");
  msg.hidden = true;
  msg.style.marginTop = "10px";
  p1.body.appendChild(msg);

  const add = () => {
    const v = text.value.trim();
    if (!v) { msg.hidden = false; msg.textContent = "할 일을 입력하세요."; text.focus(); return; }
    state.store.todos.push({
      id: uid(), text: v, subjectId: sub.value || null,
      due: parseYmd(due.value) ? due.value : null,
      done: false, doneAt: null, createdAt: new Date().toISOString(),
    });
    saveStore();
    render();
  };
  text.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });

  const r = el("div", "btn-row");
  r.appendChild(btn("할 일 추가", "btn-primary", add));
  p1.body.appendChild(r);
  frag.appendChild(p1.box);

  /* 남은 할 일 — 마감이 빠른 것부터 */
  const p2 = panel("남은 할 일", `${open.length}건`);
  if (!open.length) {
    p2.body.appendChild(emptyLine("남은 할 일이 없습니다. 위에서 추가하세요."));
  } else {
    p2.body.className = "panel-body tight";
    const sorted = open.slice().sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    });
    const ul = el("ul", "rows");
    sorted.forEach((x) => ul.appendChild(todoRow(x)));
    p2.body.appendChild(ul);
  }
  frag.appendChild(p2.box);

  /* 끝낸 할 일 */
  const p3 = panel("끝낸 할 일", `${done.length}건`);
  if (!done.length) {
    p3.body.appendChild(emptyLine("아직 끝낸 할 일이 없습니다."));
  } else {
    p3.body.className = "panel-body tight";
    const ul = el("ul", "rows");
    done.slice().reverse().slice(0, 30).forEach((x) => ul.appendChild(todoRow(x)));
    p3.body.appendChild(ul);

    const f = el("div", "panel-body");
    f.style.borderTop = "1px solid var(--line)";
    const rr = el("div", "btn-row");
    rr.style.marginTop = "0";
    rr.appendChild(btn("끝낸 할 일 지우기", "btn-text", () => {
      if (!window.confirm(`끝낸 할 일 ${done.length}건을 지울까요?\n\n되돌릴 수 없습니다. 남은 할 일은 그대로 있습니다.`)) return;
      state.store.todos = openTodos();
      saveStore();
      render();
    }));
    f.appendChild(rr);
    p3.box.appendChild(f);
  }
  frag.appendChild(p3.box);

  return frag;
}

/* ============================================================
   화면 4. 학습 기록
   ============================================================ */

function viewReport() {
  const frag = document.createDocumentFragment();
  const sum = totalSolved();
  const rate = sum.total ? Math.round(sum.right / sum.total * 100) : 0;
  const wrongs = allWrongs();

  const p1 = panel("학습 기록", `${state.store.sessions.length}회차`);
  const figs = el("div", "figs");
  figs.append(
    figure("연속 학습", String(streakDays()), "일"),
    figure("푼 문항", String(sum.total), "문항"),
    figure("정답률", String(rate), "%", rate >= 80 ? "ok" : null),
    figure("남은 오답", String(wrongs.length), "건", wrongs.length ? "hot" : "ok")
  );
  p1.body.appendChild(figs);
  if (!state.store.sessions.length) {
    const m = notice(null, null, "아직 푼 회차가 없습니다. 문제를 한 번 풀면 여기에 기록이 쌓입니다.");
    m.style.marginTop = "14px";
    p1.body.appendChild(m);
  }
  frag.appendChild(p1.box);

  /* 최근 14일 */
  const p2 = panel("최근 14일 푼 문항", "하루 기준");
  p2.body.appendChild(barList(recentDays(14).map((d) => ({ label: fmtDay(d.day), n: d.total }))));
  frag.appendChild(p2.box);

  /* 약점 */
  const weak = weakSpots(8);
  const p3 = panel("자주 틀리는 곳", weak.length ? `상위 ${weak.length}개` : "없음");
  if (!weak.length) {
    p3.body.appendChild(emptyLine("남은 오답이 없습니다. 틀린 문항이 쌓이면 어느 절에서 자주 틀리는지 여기에 나옵니다."));
  } else {
    p3.body.appendChild(notice(null, null, "오답에 적힌 출처(과목 · 절)를 세었습니다. 건수가 많은 절부터 다시 보세요."));
    const holder = el("div");
    holder.style.marginTop = "14px";
    holder.appendChild(barList(weak.map((x) => ({ label: x.k, n: x.n }))));
    p3.body.appendChild(holder);
  }
  frag.appendChild(p3.box);

  /* 회차 목록 */
  const p4 = panel("회차별 점수", `${state.store.sessions.length}회`);
  if (!state.store.sessions.length) {
    p4.body.appendChild(emptyLine("기록이 없습니다."));
  } else {
    p4.body.className = "panel-body tight";
    const scroll = el("div", "tbl-scroll");
    const tbl = el("table", "lms");
    const thead = el("thead");
    const htr = el("tr");
    ["번호", "일시", "과목", "방식", "점수", "정답률"].forEach((h) => htr.appendChild(el("th", null, h)));
    thead.appendChild(htr);
    const tbody = el("tbody");
    const MODE = { new: "새로 출제", wrong: "오답 다시", due: "오늘 복습", exam: "모의고사" };
    const rows = state.store.sessions.slice().reverse().slice(0, 40);
    rows.forEach((x, i) => {
      const tr = el("tr");
      tr.appendChild(el("td", "num", String(state.store.sessions.length - i)));
      tr.appendChild(el("td", "when", fmtDate(x.at)));
      tr.appendChild(el("td", null, x.name));
      tr.appendChild(el("td", null, MODE[x.mode] || x.mode));
      tr.appendChild(el("td", null, `${x.right} / ${x.total}`));
      tr.appendChild(el("td", x.total && x.right / x.total >= 0.8 ? "real" : "when",
        x.total ? Math.round(x.right / x.total * 100) + "%" : "—"));
      tbody.appendChild(tr);
    });
    tbl.append(thead, tbody);
    scroll.appendChild(tbl);
    p4.body.appendChild(scroll);
  }
  frag.appendChild(p4.box);

  return frag;
}

/* ============================================================
   화면 5. 과목 등록
   ============================================================ */

function viewNew() {
  const first = state.store.subjects.length === 0;
  const p = panel(first ? "과목 등록 — 첫 과목을 등록하세요" : "과목 등록");
  p.body.className = "panel-body tight";

  const mk = (label, node, notes) => {
    const row = el("div", "form-row");
    const lb = el("div", "lb");
    lb.append(document.createTextNode(label), el("span", "req", " *"));
    const fd = el("div", "fd");
    fd.appendChild(node);
    (notes || []).forEach((t) => fd.appendChild(el("div", "note", t)));
    row.append(lb, fd);
    return row;
  };

  const name = textInput("예: 항해학 기초");
  const exam = dateInput("");

  const raw = document.createElement("textarea");
  raw.placeholder = [
    "## 항법의 종류",
    "| 항법 | 개요 |",
    "|---|---|",
    "| 지문항법 | 육지의 물표를 관측해 위치를 구하는 방법 |",
    "",
    "- 편차: 진북과 자북의 차이",
    "- 관계식으로 정리하면 진방위 = 나침방위 + 자차 + 편차가 된다.",
  ].join("\n");

  const examRow = el("div", "form-row");
  const examLb = el("div", "lb", "시험일");
  const examFd = el("div", "fd");
  examFd.appendChild(exam);
  examFd.appendChild(el("div", "note", "선택 사항입니다. 정해 두면 플래너가 남은 날에 맞춰 자료의 절을 나눠 줍니다. 나중에 플래너에서 바꿀 수 있습니다."));
  examRow.append(examLb, examFd);

  p.body.append(
    mk("과목명", name),
    examRow,
    mk("학습 자료", raw, [
      "수업 필기나 요약을 그대로 붙여넣으세요. 표나 「용어: 설명」 형태의 줄이 많을수록 문제가 잘 나옵니다. 20자 이상.",
      "붙여넣은 내용은 이 브라우저에만 저장되고 어디로도 전송되지 않습니다. 학번·이름·성적이 섞여 있다면 지우고 넣으세요.",
    ])
  );

  const footer = el("div", "panel-body");
  footer.style.borderTop = "1px solid var(--line)";
  const msg = notice("bad");
  msg.hidden = true;
  footer.appendChild(msg);

  const row = el("div", "btn-row");
  row.appendChild(btn("등록하고 정리 보기", "btn-primary", () => {
    const n = name.value.trim();
    const r = raw.value;
    if (!n) { msg.hidden = false; msg.textContent = "과목명을 입력하세요."; name.focus(); return; }
    if (r.trim().length < 20) { msg.hidden = false; msg.textContent = "학습 자료가 너무 짧습니다. 20자 이상 붙여넣으세요."; raw.focus(); return; }
    const s = normalizeSubject({ id: uid(), name: n, raw: r, examAt: exam.value || null });
    state.store.subjects.push(s);
    state.activeId = s.id;
    state.view = "subject";
    state.tab = "summary";
    const ok = saveStore();
    render();
    if (!ok) $("main").prepend(notice("bad", "저장에 실패했습니다. ", storeWhy));
  }));
  if (!first) {
    row.appendChild(btn("취소", null, () => { state.view = "subject"; state.tab = "summary"; render(); }));
  }
  footer.appendChild(row);
  p.box.appendChild(footer);

  setTimeout(() => name.focus(), 0);
  return p.box;
}

/* ============================================================
   화면 6. 학습 자료
   ============================================================ */

function viewSummary() {
  const s = active();
  const m = S.parseMaterial(s.raw);
  const groups = S.summarize(m);
  const av = S.availability(m);

  const p = panel(s.name, `용어 ${av.termCount}개`);

  const head = el("div", "dmeta");
  head.style.marginBottom = "10px";
  head.appendChild(el("span", null, `원문 ${m.lines.length}줄`));
  head.appendChild(el("span", null, `절 ${m.headings.length}개`));
  if (s.examAt) {
    head.appendChild(el("span", null, `시험 ${fmtDay(s.examAt)}`));
    const b = ddayBadge(s.examAt);
    if (b) head.appendChild(b);
  } else {
    head.appendChild(el("span", null, "시험일 미정"));
  }
  p.body.appendChild(head);

  p.body.appendChild(notice(null, null, "핵심만 골라 두었습니다. 아래에서 원문을 펼쳐 볼 수 있습니다."));

  const holder = el("div");
  holder.style.marginTop = "14px";
  if (!groups.length) {
    holder.appendChild(el("p", "empty", "핵심으로 뽑을 줄을 찾지 못했습니다. 표나 「용어: 설명」 형태를 넣으면 여기에 정리됩니다. 원문은 아래에서 그대로 볼 수 있습니다."));
  } else {
    groups.forEach((g) => {
      const sec = el("div", "key-sect");
      sec.appendChild(el("h3", null, g.name));
      const ul = el("ul", "kv");
      g.items.forEach((it) => {
        const li = el("li");
        if (it.formula) li.appendChild(el("span", "formula", it.formula));
        else if (it.solo) li.appendChild(el("span", "solo v", it.solo));
        else li.append(el("span", "k", it.k), el("span", "v", it.v));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      holder.appendChild(sec);
    });
  }
  p.body.appendChild(holder);

  const det = el("details", "src");
  const sum = el("summary");
  sum.append(el("span", null, "원문 전체 보기"), el("span", "cnt", `원문 ${m.lines.length}줄 전량`));
  det.append(sum, el("div", "src-body", s.raw));
  p.body.appendChild(det);

  const row = el("div", "btn-row");
  row.append(
    btn("문제 풀이로 이동", "btn-primary", () => { state.tab = "quiz"; render(); }),
    btn("인쇄하기", null, () => window.print()),
    btn("과목 삭제", "btn-text", () => deleteSubject(s))
  );
  p.body.appendChild(row);

  return p.box;
}

/* ============================================================
   화면 7. 문제 풀이
   ============================================================ */

function viewQuizStart() {
  const s = active();
  const t = todayKey();
  const wrongs = s.wrongs || [];
  const dueHere = wrongs.filter((w) => String(w.due || t) <= t);

  const p = panel("출제 방식 선택", `${QUIZ_SIZE}문항`);
  p.body.appendChild(notice(null, null, "객관식 · OX · 주관식 · 빈칸이 섞여 나옵니다. 유형마다 최소 1문항을 먼저 채웁니다. 보기는 숫자 키(1~4), OX는 O·X 키로도 고를 수 있습니다."));

  const grid = el("div", "mode-grid");
  grid.style.marginTop = "14px";

  const mode = (title, desc, disabled, onClick) => {
    const b = el("button", "mode");
    b.type = "button";
    b.append(el("b", null, title), el("span", null, desc));
    b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    grid.appendChild(b);
  };

  mode("새로 출제", `내 자료에서 ${QUIZ_SIZE}문항을 새로 뽑습니다. 풀 때마다 조금씩 달라집니다.`, false, () => startQuiz("new"));
  mode("오늘 복습할 것", dueHere.length
    ? `오늘이 복습일인 ${dueHere.length}문항을 냅니다. 맞히면 다음 복습일로 미뤄집니다.`
    : "오늘 복습할 문항이 없습니다. 틀린 문항은 하루 뒤부터 올라옵니다.", dueHere.length === 0,
    () => startReview(dueHere.map((w) => ({ w, s }))));
  mode("오답 전부 다시 풀기", wrongs.length
    ? `쌓인 오답 ${wrongs.length}문항을 복습일과 상관없이 전부 냅니다.`
    : "아직 오답이 없습니다.", wrongs.length === 0, () => startQuiz("wrong"));
  mode("모의고사", `${EXAM_SIZE}문항을 중간 채점 없이 풉니다. 시간을 재고, 끝에 한꺼번에 채점합니다.`, false, () => startQuiz("exam"));

  p.body.appendChild(grid);
  return p.box;
}

function fromWrong(w, subjectId) {
  return {
    type: w.type, prompt: w.prompt, choices: w.choices || null,
    answer: w.answer, also: w.also || [], why: w.why || "", source: w.source || "",
    subjectId,
  };
}

function shuffled(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/** 여러 과목에 걸친 오늘 복습. 오늘 화면과 과목 화면이 같이 쓴다. */
function startReview(pairs) {
  const questions = shuffled(pairs.map(({ w, s }) => fromWrong(w, s.id)));
  const ids = new Set(pairs.map(({ s }) => s.id));
  state.view = "subject";
  if (!active() && pairs.length) state.activeId = pairs[0].s.id;
  state.tab = "quiz";
  state.quiz = {
    mode: "due", questions, total: questions.length, ix: 0, given: null, checked: false,
    right: 0, missing: [], done: questions.length === 0, answers: [],
    subjectId: ids.size === 1 ? [...ids][0] : null,
    startedAt: Date.now(),
  };
  render();
}

function startQuiz(mode) {
  const s = active();
  let questions = [];
  let missing = [];

  if (mode === "wrong") {
    questions = shuffled((s.wrongs || []).map((w) => fromWrong(w, s.id)));
  } else {
    const want = mode === "exam" ? EXAM_SIZE : QUIZ_SIZE;
    const made = S.makeQuestions(S.parseMaterial(s.raw), want, s.name);
    questions = made.questions.map((q) => ({ ...q, subjectId: s.id }));
    missing = made.missing;
  }

  state.tab = "quiz";
  state.quiz = {
    mode, questions, total: questions.length, ix: 0, given: null, checked: false,
    right: 0, missing, done: questions.length === 0,
    answers: new Array(questions.length).fill(""),
    subjectId: s.id,
    startedAt: Date.now(),
  };
  render();
}

/**
 * 정답 여부를 오답 노트와 복습 일정에 반영한다.
 * 무슨 일이 일어났는지 돌려준다 — 화면이 그대로 글자로 알려 줘야 하기 때문이다.
 *   clean     오답 노트에 없던 문항을 맞혔다 (아무 일도 일어나지 않음)
 *   advanced  연속 맞힘이 한 단계 올라갔다
 *   graduated 끝까지 맞혀 목록에서 뺐다
 *   added     새로 오답 노트에 넣었다
 *   reset     이미 있던 문항을 또 틀려 처음으로 돌렸다
 */
function recordAnswer(item, given, ok) {
  const s = findSubject(item.subjectId) || active();
  if (!s) return "none";
  s.wrongs = s.wrongs || [];
  const today = todayKey();
  const sig = item.type + "|" + item.prompt;
  const at = s.wrongs.findIndex((w) => w.type + "|" + w.prompt === sig);
  const stamp = new Date().toISOString();
  let outcome;

  if (ok) {
    if (at < 0) {
      outcome = "clean";                   // 처음부터 맞힌 문항 — 오답 노트와 무관하다
    } else {
      const w = s.wrongs[at];
      w.stage = (w.stage || 0) + 1;
      if (w.stage >= REVIEW_STEPS.length) {
        s.wrongs.splice(at, 1);            // 다 외웠다 — 목록에서 뺀다
        outcome = "graduated";
      } else {
        w.due = addDays(today, REVIEW_STEPS[w.stage]);
        w.at = stamp;
        outcome = "advanced";
      }
    }
  } else if (at < 0) {
    s.wrongs.push(normalizeWrong({
      type: item.type, prompt: item.prompt, choices: item.choices || null,
      answer: item.answer, also: item.also || [], why: item.why || "", source: item.source || "",
      mine: String(given || ""), at: stamp,
      stage: 0, due: addDays(today, REVIEW_STEPS[0]), missCount: 1,
    }));
    outcome = "added";
  } else {
    const w = s.wrongs[at];
    w.mine = String(given || "");
    w.at = stamp;
    w.stage = 0;
    w.due = addDays(today, REVIEW_STEPS[0]);
    w.missCount = (w.missCount || 1) + 1;
    outcome = "reset";
  }
  s.lastAt = stamp;
  return outcome;
}

function endSession(q) {
  if (!q.total) return;
  const s = findSubject(q.subjectId);
  state.store.sessions.push({
    id: uid(), at: new Date().toISOString(), day: todayKey(),
    subjectId: q.subjectId || null, name: s ? s.name : "여러 과목",
    mode: q.mode, total: q.total, right: q.right,
  });
  if (state.store.sessions.length > 300) state.store.sessions = state.store.sessions.slice(-300);
  if (s) s.lastScore = { right: q.right, total: q.total, at: new Date().toISOString() };
}

function submit(given) {
  const q = state.quiz;
  const item = q.questions[q.ix];
  q.given = given;
  q.checked = true;

  const ok = S.isCorrect(given, item);
  if (ok) q.right++;
  q.outcome = recordAnswer(item, given, ok);
  saveStore();
  render();
}

function nextQuestion() {
  const q = state.quiz;
  if (q.ix + 1 >= q.total) {
    q.done = true;
    endSession(q);
    saveStore();
  } else {
    q.ix++; q.given = null; q.checked = false; q.outcome = null;
  }
  render();
}

const MODE_TITLE = { new: "문제 풀이", wrong: "오답 다시 풀기", due: "오늘 복습", exam: "모의고사" };

function viewQuizQuestion() {
  const q = state.quiz;
  const item = q.questions[q.ix];
  const frag = document.createDocumentFragment();
  const p = panel(MODE_TITLE[q.mode] || "문제 풀이", `문항 ${q.ix + 1}`);
  p.body.className = "panel-body tight";

  const bar = el("div", "qbar");
  bar.appendChild(el("span", null, `${q.ix + 1} / ${q.total}`));
  const track = el("div", "track");
  const fill = document.createElement("i");
  fill.style.width = (q.ix / q.total * 100) + "%";
  track.appendChild(fill);
  bar.append(track, el("span", null, `정답 ${q.right}`));
  p.body.appendChild(bar);

  const inner = el("div");
  inner.style.padding = "14px";
  inner.appendChild(el("span", "badge b-" + item.type, S.TYPE_LABEL[item.type] || item.type));
  if (q.mode === "due" && subjectName(item.subjectId)) {
    inner.appendChild(el("span", "badge", subjectName(item.subjectId)));
  }
  inner.appendChild(promptNode(item.prompt));

  if (item.choices) {
    const box = el("div", item.type === "ox" ? "ox" : "choices");
    item.choices.forEach((c, i) => {
      const b = el("button", "choice");
      b.type = "button";
      if (item.type !== "ox") b.appendChild(el("span", "ix", (i + 1) + "."));
      b.appendChild(el("span", null, c));
      if (q.checked) {
        b.disabled = true;
        const isAnswer = S.normalize(c) === S.normalize(item.answer);
        const isPick = S.normalize(c) === S.normalize(q.given);
        if (isPick && isAnswer) b.classList.add("pick-right");
        else if (isPick) b.classList.add("pick-wrong");
        else if (isAnswer) b.classList.add("show-answer");
      } else {
        b.addEventListener("click", () => submit(c));
      }
      box.appendChild(b);
    });
    inner.appendChild(box);
  } else {
    const input = textInput(item.type === "blank" ? "빈칸에 들어갈 말" : "답을 입력하세요");
    input.style.maxWidth = "340px";
    if (q.checked) { input.value = q.given || ""; input.disabled = true; }
    inner.appendChild(input);
    if (!q.checked) {
      const row = el("div", "btn-row");
      row.append(
        btn("제출", "btn-primary", () => submit(input.value)),
        btn("모르겠습니다", null, () => submit(""))
      );
      inner.appendChild(row);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submit(input.value); }
      });
      setTimeout(() => input.focus(), 0);
    }
  }

  if (q.checked) {
    const ok = S.isCorrect(q.given, item);
    const v = el("div", "verdict " + (ok ? "right" : "wrong"));
    v.appendChild(el("div", "vh", ok ? "정답입니다" : "오답입니다"));
    const vb = el("div", "vb");

    const l1 = el("p", "line");
    l1.append(document.createTextNode("정답 · "), el("span", "ans", item.answer));
    vb.appendChild(l1);

    if (!ok) {
      const l2 = el("p", "line");
      if (String(q.given || "").trim()) l2.append(document.createTextNode("제출한 답 · "), el("span", "mine", q.given));
      else l2.appendChild(document.createTextNode("제출한 답 · 없음 (모르겠습니다)"));
      vb.appendChild(l2);
    }
    if (item.why) vb.appendChild(el("p", "line", item.why));
    if (item.type === "short" || item.type === "blank") {
      vb.appendChild(el("p", "rule", "채점 기준 · 띄어쓰기와 조사 차이는 정답으로 처리합니다."));
    }
    if (item.source) vb.appendChild(el("p", "rule", "출처 · " + item.source));
    const note = reviewNote(item, q.outcome);
    if (note) vb.appendChild(el("p", "rule", note));

    const row = el("div", "btn-row");
    row.style.marginTop = "6px";
    const next = btn(q.ix + 1 >= q.total ? "결과 보기" : "다음 문제", "btn-primary", nextQuestion);
    row.appendChild(next);
    vb.appendChild(row);
    v.appendChild(vb);
    inner.appendChild(v);
    setTimeout(() => next.focus(), 0);
  }

  p.body.appendChild(inner);
  frag.appendChild(p.box);

  if (q.missing.length && q.ix === 0 && !q.checked) {
    const mp = panel("만들지 못한 유형");
    const msg = notice("warn", "자료에서 다음 유형을 만들 수 없었습니다.");
    const ul = el("ul");
    q.missing.forEach((m) => ul.appendChild(el("li", null, `${m.type} — ${m.why}`)));
    msg.appendChild(ul);
    mp.body.appendChild(msg);
    frag.appendChild(mp.box);
  }
  return frag;
}

/** 이 문항이 어떻게 됐고 언제 다시 올라오는지 글자로 알려 준다. */
function reviewNote(item, outcome) {
  const total = REVIEW_STEPS.length;
  if (outcome === "clean") return "복습 · 처음부터 맞혔습니다. 오답 노트에 넣지 않습니다.";
  if (outcome === "graduated") return `복습 · 연속 ${total}번 맞혀 오답 노트에서 뺐습니다.`;

  const s = findSubject(item.subjectId);
  const w = s && (s.wrongs || []).find((x) => x.type + "|" + x.prompt === item.type + "|" + item.prompt);
  if (!w) return "";

  if (outcome === "advanced") return `복습 · 연속 ${w.stage} / ${total}번 맞힘 · 다음 복습일 ${fmtDay(w.due)}`;
  if (outcome === "added") return `복습 · 오답 노트에 넣었습니다 · 다음 복습일 ${fmtDay(w.due)}`;
  if (outcome === "reset") return `복습 · 다시 틀려 처음으로 돌아갔습니다 · 다음 복습일 ${fmtDay(w.due)}`;
  return "";
}

function viewQuizResult() {
  const q = state.quiz;
  const s = findSubject(q.subjectId);
  const p = panel("풀이 결과", MODE_TITLE[q.mode] || "");

  if (!q.total) {
    p.body.appendChild(notice("bad", null, "자료에서 문제로 쓸 부분을 찾지 못했습니다. 표나 「용어: 설명」 형태의 줄을 더 넣어 보세요."));
    if (q.missing.length) {
      const msg = notice("warn");
      const ul = el("ul");
      q.missing.forEach((m) => ul.appendChild(el("li", null, `${m.type} — ${m.why}`)));
      msg.appendChild(ul);
      msg.style.marginTop = "10px";
      p.body.appendChild(msg);
    }
  } else {
    const res = el("div", "result");
    res.append(el("b", null, String(q.right)), el("span", null, `/ ${q.total} 문항 · 정답률 ${Math.round(q.right / q.total * 100)}%`));
    p.body.appendChild(res);

    const left = s ? (s.wrongs || []).length : allWrongs().length;
    const m = notice(null, null, `남은 오답 ${left}건입니다. 틀린 문항은 ${fmtDay(addDays(todayKey(), REVIEW_STEPS[0]))}부터 다시 올라옵니다.`);
    m.style.marginTop = "14px";
    p.body.appendChild(m);
  }

  const row = el("div", "btn-row");
  row.appendChild(btn("새로 출제", "btn-primary", () => { state.quiz = null; render(); }));
  row.appendChild(btn("오늘 화면으로", null, () => { state.quiz = null; state.view = "today"; render(); }));
  if (s && (s.wrongs || []).length) {
    row.appendChild(btn(`오답 노트 (${s.wrongs.length}건)`, "btn-text", () => { state.quiz = null; state.tab = "wrong"; render(); }));
  }
  p.body.appendChild(row);
  return p.box;
}

/* ---------- 모의고사 ---------- */

function examPick(value) {
  const q = state.quiz;
  q.answers[q.ix] = value;
  render();
}

function gradeExam() {
  const q = state.quiz;
  q.right = 0;
  q.questions.forEach((item, i) => {
    const ok = S.isCorrect(q.answers[i], item);
    if (ok) q.right++;
    recordAnswer(item, q.answers[i], ok);
  });
  q.done = true;
  q.tookMs = Date.now() - q.startedAt;
  endSession(q);
  saveStore();
  render();
}

function viewExamQuestion() {
  const q = state.quiz;
  const item = q.questions[q.ix];
  const p = panel("모의고사", `${q.total}문항 · 중간 채점 없음`);
  p.body.className = "panel-body tight";

  const answered = q.answers.filter((a) => String(a || "").trim()).length;

  const bar = el("div", "qbar");
  bar.appendChild(el("span", null, `${q.ix + 1} / ${q.total}`));
  const track = el("div", "track");
  const fill = document.createElement("i");
  fill.style.width = (answered / q.total * 100) + "%";
  track.appendChild(fill);
  bar.append(track, el("span", null, `푼 문항 ${answered}`));
  const clock = el("span", null, mmss(Date.now() - q.startedAt));
  clock.id = "examClock";
  bar.appendChild(clock);
  p.body.appendChild(bar);

  const inner = el("div");
  inner.style.padding = "14px";
  inner.appendChild(el("span", "badge b-" + item.type, S.TYPE_LABEL[item.type] || item.type));
  inner.appendChild(promptNode(item.prompt));

  if (item.choices) {
    const box = el("div", item.type === "ox" ? "ox" : "choices");
    item.choices.forEach((c, i) => {
      const b = el("button", "choice");
      b.type = "button";
      if (item.type !== "ox") b.appendChild(el("span", "ix", (i + 1) + "."));
      b.appendChild(el("span", null, c));
      // 채점 전이므로 초록(정답 색)을 쓰지 않는다 — 디자인.md 4장
      if (S.normalize(q.answers[q.ix]) === S.normalize(c) && String(q.answers[q.ix] || "").trim()) {
        b.classList.add("picked");
        b.appendChild(el("span", "mark", "고름"));
      }
      b.addEventListener("click", () => examPick(c));
      box.appendChild(b);
    });
    inner.appendChild(box);
  } else {
    const input = textInput(item.type === "blank" ? "빈칸에 들어갈 말" : "답을 입력하세요");
    input.style.maxWidth = "340px";
    input.value = q.answers[q.ix] || "";
    input.addEventListener("input", () => { q.answers[q.ix] = input.value; });
    inner.appendChild(input);
  }

  const row = el("div", "btn-row");
  if (q.ix + 1 >= q.total) {
    row.appendChild(btn("제출하고 채점", "btn-primary", () => {
      const blank = q.total - q.answers.filter((a) => String(a || "").trim()).length;
      if (blank && !window.confirm(`아직 ${blank}문항을 비워 두었습니다.\n\n비운 문항은 오답으로 처리됩니다. 제출할까요?`)) return;
      gradeExam();
    }));
  } else {
    row.appendChild(btn("다음 문제", "btn-primary", () => { q.ix++; render(); }));
  }
  if (q.ix > 0) row.appendChild(btn("이전 문제", null, () => { q.ix--; render(); }));
  if (q.ix + 1 < q.total) {
    row.appendChild(btn("지금 제출하기", "btn-text", () => {
      const blank = q.total - q.answers.filter((a) => String(a || "").trim()).length;
      if (!window.confirm(`${blank}문항을 비운 채로 제출합니다.\n\n비운 문항은 오답으로 처리됩니다. 제출할까요?`)) return;
      gradeExam();
    }));
  }
  inner.appendChild(row);
  p.body.appendChild(inner);

  clockTimer = window.setInterval(() => {
    const n = $("examClock");
    if (!n) { window.clearInterval(clockTimer); clockTimer = null; return; }
    n.textContent = mmss(Date.now() - q.startedAt);
  }, 1000);

  return p.box;
}

function viewExamResult() {
  const q = state.quiz;
  const frag = document.createDocumentFragment();
  const p = panel("모의고사 결과", mmss(q.tookMs || 0) + " 걸림");

  const res = el("div", "result");
  res.append(el("b", null, String(q.right)), el("span", null, `/ ${q.total} 문항 · 정답률 ${Math.round(q.right / q.total * 100)}%`));
  p.body.appendChild(res);

  const m = notice(null, null, `틀린 문항은 오답 노트에 들어갔고 ${fmtDay(addDays(todayKey(), REVIEW_STEPS[0]))}부터 다시 올라옵니다.`);
  m.style.marginTop = "14px";
  p.body.appendChild(m);

  const row = el("div", "btn-row");
  row.append(
    btn("다시 출제", "btn-primary", () => { state.quiz = null; render(); }),
    btn("오답 노트", null, () => { state.quiz = null; state.tab = "wrong"; render(); }),
    btn("인쇄하기", "btn-text", () => window.print())
  );
  p.body.appendChild(row);
  frag.appendChild(p.box);

  /* 문항별 정오 — 색만으로 알리지 않는다 (디자인.md 4장) */
  const p2 = panel("문항별 채점", `${q.total}문항`);
  p2.body.className = "panel-body tight";
  const scroll = el("div", "tbl-scroll");
  const tbl = el("table", "lms");
  const thead = el("thead");
  const htr = el("tr");
  ["번호", "유형", "문항", "제출한 답", "정답", "결과"].forEach((h) => htr.appendChild(el("th", null, h)));
  thead.appendChild(htr);
  const tbody = el("tbody");
  q.questions.forEach((item, i) => {
    const ok = S.isCorrect(q.answers[i], item);
    const tr = el("tr");
    tr.appendChild(el("td", "num", String(i + 1)));
    const t = el("td");
    t.appendChild(el("span", "badge b-" + item.type, S.TYPE_LABEL[item.type] || item.type));
    tr.appendChild(t);
    const qc = el("td", "q");
    qc.appendChild(el("div", null, String(item.prompt).replace(/\n/g, " ")));
    if (item.source) qc.appendChild(el("div", "when", "출처 · " + item.source));
    tr.appendChild(qc);
    tr.appendChild(el("td", ok ? null : "mine", String(q.answers[i] || "").trim() || "(빈 답)"));
    tr.appendChild(el("td", "real", item.answer));
    tr.appendChild(el("td", ok ? "real" : "mine", ok ? "정답" : "오답"));
    tbody.appendChild(tr);
  });
  tbl.append(thead, tbody);
  scroll.appendChild(tbl);
  p2.body.appendChild(scroll);
  frag.appendChild(p2.box);

  return frag;
}

/* ============================================================
   화면 8. 오답 노트
   ============================================================ */

function viewWrong() {
  const s = active();
  const list = s.wrongs || [];
  const t = todayKey();
  const due = list.filter((w) => String(w.due || t) <= t);
  const p = panel("오답 노트", `${list.length}건`);

  if (!list.length) {
    p.body.appendChild(notice(null, null, "아직 오답이 없습니다. 문제를 풀면 틀린 문항만 여기에 모입니다."));
    return p.box;
  }

  p.body.className = "panel-body tight";
  const head = el("div", "panel-body");
  head.style.paddingBottom = "0";
  head.appendChild(notice(null, null,
    `틀린 문항은 ${REVIEW_STEPS.join("·")}일 간격으로 다시 올라옵니다. 다시 풀어 맞힐 때마다 간격이 한 칸씩 늘고, 연속 ${REVIEW_STEPS.length}번 맞히면 목록에서 빠집니다. 한 번이라도 틀리면 처음으로 돌아갑니다.`));
  const figs = el("div", "figs");
  figs.style.marginTop = "14px";
  figs.append(
    figure("오늘 복습할 것", String(due.length), "건", due.length ? "hot" : "ok"),
    figure("쌓인 오답", String(list.length), "건")
  );
  head.appendChild(figs);
  p.body.appendChild(head);

  const scroll = el("div", "tbl-scroll");
  scroll.style.marginTop = "14px";
  const tbl = el("table", "lms");
  const thead = el("thead");
  const htr = el("tr");
  ["번호", "유형", "문항", "제출한 답", "정답", "연속 맞힘", "다음 복습일"].forEach((h) => htr.appendChild(el("th", null, h)));
  thead.appendChild(htr);
  const tbody = el("tbody");
  list.slice().reverse().forEach((w, i) => {
    const tr = el("tr");
    tr.appendChild(el("td", "num", String(list.length - i)));
    const td = el("td");
    td.appendChild(el("span", "badge b-" + w.type, S.TYPE_LABEL[w.type] || w.type));
    tr.appendChild(td);
    const qc = el("td", "q");
    qc.appendChild(el("div", null, String(w.prompt).replace(/\n/g, " ")));
    if (w.source) qc.appendChild(el("div", "when", "출처 · " + w.source));
    qc.appendChild(el("div", "when", `틀린 횟수 ${w.missCount}회 · 마지막 ${fmtDate(w.at)}`));
    tr.appendChild(qc);
    tr.appendChild(el("td", "mine", w.mine && w.mine.trim() ? w.mine : "(빈 답)"));
    tr.appendChild(el("td", "real", w.answer));
    tr.appendChild(el("td", "when", `${w.stage}/${REVIEW_STEPS.length}`));
    const dueTd = el("td", "when", fmtDay(w.due) + " ");
    if (String(w.due || t) <= t) dueTd.appendChild(el("span", "badge b-near", "오늘 복습"));
    tr.appendChild(dueTd);
    tbody.appendChild(tr);
  });
  tbl.append(thead, tbody);
  scroll.appendChild(tbl);
  p.body.appendChild(scroll);

  const foot = el("div", "panel-body");
  foot.style.borderTop = "1px solid var(--line)";
  const row = el("div", "btn-row");
  row.style.marginTop = "0";
  row.appendChild(btn(due.length ? `오늘 복습할 ${due.length}문항 풀기` : "오답 전부 다시 풀기", "btn-primary",
    () => due.length ? startReview(due.map((w) => ({ w, s }))) : startQuiz("wrong")));
  row.appendChild(btn("인쇄하기", null, () => window.print()));
  row.appendChild(btn("오답 전체 삭제", "btn-text", () => {
    if (!window.confirm(`「${s.name}」의 오답 ${list.length}건을 삭제할까요?\n\n복습 일정도 함께 사라집니다. 되돌릴 수 없습니다.`)) return;
    s.wrongs = [];
    saveStore();
    render();
  }));
  foot.appendChild(row);
  p.box.appendChild(foot);

  return p.box;
}

/* ---------- 과목 삭제 · 백업 ---------- */

function deleteSubject(s) {
  if (!window.confirm(`「${s.name}」을 삭제할까요?\n\n등록한 자료 · 오답 노트 · 이 과목에 달린 계획과 할 일이 함께 사라집니다. 되돌릴 수 없습니다.`)) return;
  state.store.subjects = state.store.subjects.filter((x) => x.id !== s.id);
  state.store.plans = state.store.plans.filter((p) => p.subjectId !== s.id);
  state.store.todos = state.store.todos.filter((t) => t.subjectId !== s.id);
  state.activeId = state.store.subjects.length ? state.store.subjects[0].id : null;
  state.view = state.store.subjects.length ? "subject" : "new";
  state.tab = "summary";
  state.quiz = null;
  saveStore();
  render();
}

function exportBackup() {
  const st = state.store;
  if (!st.subjects.length && !st.plans.length && !st.todos.length) {
    window.alert("내보낼 내용이 없습니다.");
    return;
  }
  const text = JSON.stringify({
    version: 2, savedAt: new Date().toISOString(),
    subjects: st.subjects, plans: st.plans, todos: st.todos, sessions: st.sessions,
  }, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "시험노트_백업_" + todayKey() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBackup(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { window.alert("백업 내용을 읽지 못했습니다. 파일 전체가 온전한지 확인하세요."); return; }
  if (!data || !Array.isArray(data.subjects)) { window.alert("백업 형태가 아닙니다. subjects 목록이 있는 파일이 필요합니다."); return; }

  const incoming = migrate(data);
  if (!incoming.subjects.length && !incoming.plans.length && !incoming.todos.length) {
    window.alert("불러올 내용이 없습니다.");
    return;
  }

  const merge = window.confirm(
    `과목 ${incoming.subjects.length}개 · 계획 ${incoming.plans.length}건 · 할 일 ${incoming.todos.length}건을 찾았습니다.\n\n` +
    `${incoming.subjects.map((s) => s.name).join(" · ") || "(과목 없음)"}\n\n` +
    `[확인] 지금 것에 합치기\n[취소] 지금 것을 지우고 덮어쓰기`
  );

  if (merge) {
    const idMap = new Map();
    incoming.subjects.forEach((s) => {
      const old = s.id;
      let name = s.name, n = 2;
      while (state.store.subjects.some((x) => x.name === name)) name = `${s.name} (${n++})`;
      const fresh = { ...s, id: uid(), name };
      idMap.set(old, fresh.id);
      state.store.subjects.push(fresh);
    });
    const remap = (x) => ({ ...x, id: uid(), subjectId: x.subjectId ? (idMap.get(x.subjectId) || null) : null });
    state.store.plans.push(...incoming.plans.map(remap));
    state.store.todos.push(...incoming.todos.map(remap));
    state.store.sessions.push(...incoming.sessions.map(remap));
  } else {
    state.store = incoming;
  }

  state.activeId = state.store.subjects.length ? state.store.subjects[0].id : null;
  state.view = "today";
  state.tab = "summary";
  state.quiz = null;
  const ok = saveStore();
  render();
  if (!ok) $("main").prepend(notice("bad", "불러왔지만 저장에 실패했습니다. ", storeWhy));
}

/* ---------- 전체 그리기 ---------- */

function render() {
  if (clockTimer) { window.clearInterval(clockTimer); clockTimer = null; }

  renderChrome();
  renderCrumb();
  renderStats();

  const main = $("main");
  main.innerHTML = "";

  if (!storeOk) {
    main.appendChild(notice("bad", "저장되지 않습니다. ", storeWhy + " 창을 닫으면 등록한 자료가 사라집니다."));
  }

  if (state.view === "new" || (state.view === "subject" && !state.store.subjects.length)) {
    main.appendChild(viewNew());
    return;
  }
  if (state.view === "today") { main.appendChild(viewToday()); return; }
  if (state.view === "planner") { main.appendChild(viewPlanner()); return; }
  if (state.view === "todo") { main.appendChild(viewTodo()); return; }
  if (state.view === "report") { main.appendChild(viewReport()); return; }

  if (!state.store.subjects.length) { main.appendChild(viewNew()); return; }
  if (!active()) state.activeId = state.store.subjects[0].id;

  main.appendChild(tabs());
  if (state.tab === "quiz") {
    if (!state.quiz) main.appendChild(viewQuizStart());
    else if (state.quiz.mode === "exam") {
      // 자료가 얇아 한 문항도 못 만들면 일반 결과 화면이 그 사정을 설명한다.
      if (!state.quiz.total) main.appendChild(viewQuizResult());
      else main.appendChild(state.quiz.done ? viewExamResult() : viewExamQuestion());
    }
    else if (state.quiz.done) main.appendChild(viewQuizResult());
    else main.appendChild(viewQuizQuestion());
  } else if (state.tab === "wrong") {
    main.appendChild(viewWrong());
  } else {
    main.appendChild(viewSummary());
  }
}

/* ---------- 키보드 ---------- */

document.addEventListener("keydown", (e) => {
  const q = state.quiz;
  if (!q || q.done) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const tag = ((e.target && e.target.tagName) || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  const item = q.questions[q.ix];
  if (!item || !item.choices) return;

  if (q.checked) return;   // 결과가 떠 있으면 다음 버튼에 포커스가 있다. 그쪽이 Enter 를 받는다.
  if (tag === "button") return;

  const pick = q.mode === "exam" ? examPick : submit;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= item.choices.length) { e.preventDefault(); pick(item.choices[n - 1]); return; }
  const k = e.key.toUpperCase();
  if (item.type === "ox" && (k === "O" || k === "X")) { e.preventDefault(); pick(k); }
});

/* ---------- 시작 ---------- */

$("btnNew").addEventListener("click", () => { state.view = "new"; state.quiz = null; render(); });
$("btnExport").addEventListener("click", exportBackup);
$("btnImport").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => importBackup(String(rd.result));
  rd.onerror = () => window.alert("파일을 읽지 못했습니다.");
  rd.readAsText(f);
  e.target.value = "";
});

if (state.store.subjects.length) state.activeId = state.store.subjects[0].id;
else state.view = "new";
render();
