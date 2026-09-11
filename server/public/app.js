"use strict";

/* ============================================================
   프론트엔드 — 브라우저에서 도는 코드.

   여기에는 자료도 정답도 채점 규칙도 없다.
   전부 fetch() 로 서버에 물어보고, 받은 것을 화면에 그린다.

   서버와 이야기하는 곳은 아래 api() 하나뿐이다.
   ============================================================ */

const state = {
  subjects: [],
  activeId: null,
  tab: "summary",     // summary | quiz | wrong | new
  detail: null,       // GET /api/subjects/:id 결과
  wrongs: null,       // GET /api/subjects/:id/wrongs 결과
  quiz: null,         // 진행 중인 시험
  busy: false,
};

/* ---------- 서버와 이야기하는 단 하나의 통로 ---------- */

const wireLog = [];

async function api(method, url, body) {
  const started = Date.now();
  let status = 0;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.error || `서버가 ${res.status} 로 답했습니다.`);
    return data;
  } catch (e) {
    if (status === 0) throw new Error("서버에 닿지 못했습니다. 서버 창이 꺼졌는지 확인하세요.");
    throw e;
  } finally {
    wireLog.unshift({ method, url, status, ms: Date.now() - started });
    if (wireLog.length > 12) wireLog.pop();
    renderWire();
  }
}

/* ---------- 화면 만들기 도우미 ---------- */

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

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

function showError(message) {
  const box = el("div", "msg bad");
  box.appendChild(el("b", null, "문제가 생겼습니다. "));
  box.appendChild(document.createTextNode(message));
  $("main").prepend(box);
}

/* ---------- 고정 영역 그리기 ---------- */

function renderWire() {
  const ul = $("wire");
  if (!ul) return;
  ul.innerHTML = "";
  $("wireCount").textContent = wireLog.length;
  if (!wireLog.length) { ul.appendChild(el("li", null, "아직 없습니다.")); return; }
  wireLog.forEach((w) => {
    const li = el("li");
    li.appendChild(el("span", "m", w.method));
    li.appendChild(el("span", "u", w.url));
    li.appendChild(el("span", "s" + (w.status >= 400 || w.status === 0 ? " err" : ""), (w.status || "실패") + " · " + w.ms + "ms"));
    ul.appendChild(li);
  });
}

function renderChrome() {
  const total = state.subjects.reduce((n, s) => n + s.wrongCount, 0);
  const chips = $("chips");
  chips.innerHTML = "";
  const c1 = el("span", "chip");
  c1.append(document.createTextNode("등록 과목 "), el("b", null, String(state.subjects.length)));
  const c2 = el("span", "chip" + (total ? " alert" : ""));
  c2.append(document.createTextNode("오답 "), el("b", null, String(total)));
  chips.append(c1, c2);

  const list = $("courses");
  list.innerHTML = "";
  $("courseCount").textContent = state.subjects.length;
  $("coursesEmpty").hidden = state.subjects.length > 0;

  state.subjects.forEach((s) => {
    const li = el("li");
    const b = el("button", "course");
    b.type = "button";
    b.setAttribute("aria-current", s.id === state.activeId ? "true" : "false");
    b.appendChild(el("span", "nm", s.name));
    const n = el("span", s.wrongCount ? "n bad" : "n", s.wrongCount ? `오답 ${s.wrongCount}` : `${s.lines}줄`);
    b.appendChild(n);
    b.addEventListener("click", () => selectSubject(s.id));
    li.appendChild(b);
    list.appendChild(li);
  });
}

function renderCrumb() {
  const c = $("crumb");
  c.innerHTML = "";
  const parts = ["홈", "내 과목"];
  const cur = state.subjects.find((s) => s.id === state.activeId);
  if (state.tab === "new") parts.push("과목 등록");
  else if (cur) {
    parts.push(cur.name);
    parts.push(state.tab === "quiz" ? "문제 풀이" : state.tab === "wrong" ? "오답 노트" : "학습 자료");
  }
  parts.forEach((p, i) => {
    if (i) c.appendChild(el("span", "sl", "›"));
    c.appendChild(el("span", i === parts.length - 1 ? "here" : null, p));
  });
}

function renderStats() {
  const box = $("statPanel");
  const d = state.detail;
  if (!d || state.tab === "new") { box.hidden = true; return; }
  box.hidden = false;
  const dl = $("stats");
  dl.innerHTML = "";
  const row = (k, v, cls) => {
    const w = el("div", "stat");
    w.append(el("dt", null, k), el("dd", cls || null, v));
    dl.appendChild(w);
  };
  row("자료 분량", d.lines + "줄");
  row("추출 용어", d.termCount + "개");
  row("출제 가능 유형", d.kinds.length + " / 4", d.kinds.length === 4 ? "ok" : null);
  row("오답", d.wrongCount + "건", d.wrongCount ? "bad" : "ok");
  row("최근 학습", fmtDate(d.lastAt));
  if (d.lastScore) row("최근 회차", `${d.lastScore.right} / ${d.lastScore.total}`);
}

function tabs() {
  const bar = el("div", "tabs");
  bar.setAttribute("role", "tablist");
  const cur = state.subjects.find((s) => s.id === state.activeId);
  [
    { id: "summary", label: "학습 자료" },
    { id: "quiz", label: "문제 풀이" },
    { id: "wrong", label: "오답 노트", n: cur ? cur.wrongCount : 0 },
  ].forEach((d) => {
    const t = el("button", "tab");
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", state.tab === d.id ? "true" : "false");
    t.appendChild(el("span", null, d.label));
    if (d.n) t.appendChild(el("span", "n hot", String(d.n)));
    t.addEventListener("click", () => goTab(d.id));
    bar.appendChild(t);
  });
  return bar;
}

/* ---------- 화면 1. 과목 등록 ---------- */

function viewNew() {
  const first = state.subjects.length === 0;
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

  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "예: 항해학 기초";

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

  p.body.append(
    mk("과목명", name),
    mk("학습 자료", raw, [
      "표나 「용어: 설명」 형태의 줄이 많을수록 문제가 잘 나옵니다. 20자 이상.",
      "보낸 자료는 이 컴퓨터의 server/data/db.json 에만 저장됩니다.",
    ])
  );

  const footer = el("div", "panel-body");
  footer.style.borderTop = "1px solid var(--line)";
  const row = el("div", "btn-row");
  row.style.marginTop = "0";
  const save = el("button", "btn btn-primary", "서버에 등록하기");
  save.type = "button";
  row.appendChild(save);
  if (!first) {
    const cancel = el("button", "btn", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", () => goTab("summary"));
    row.appendChild(cancel);
  }
  footer.appendChild(row);
  p.box.appendChild(footer);

  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const { subject } = await api("POST", "/api/subjects", { name: name.value, raw: raw.value });
      await loadSubjects();
      await selectSubject(subject.id);
    } catch (e) {
      save.disabled = false;
      render();
      showError(e.message);
    }
  });

  setTimeout(() => name.focus(), 0);
  return p.box;
}

/* ---------- 화면 2. 학습 자료 ---------- */

function viewSummary() {
  const d = state.detail;
  const frag = document.createDocumentFragment();
  const p = panel(d.name, `용어 ${d.termCount}개`);

  p.body.appendChild(el("div", "msg", "서버가 자료를 읽어 핵심만 골라 보냈습니다. 아래에서 원문을 펼쳐 볼 수 있습니다."));

  const holder = el("div");
  holder.style.marginTop = "14px";
  if (!d.summary.length) {
    holder.appendChild(el("p", "empty", "핵심으로 뽑을 줄을 찾지 못했습니다. 표나 「용어: 설명」 형태를 넣어 보세요."));
  } else {
    d.summary.forEach((g) => {
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
  sum.append(el("span", null, "원문 전체 보기"), el("span", "cnt", `원문 ${d.lines}줄 전량`));
  det.append(sum, el("div", "src-body", d.original));
  p.body.appendChild(det);

  const row = el("div", "btn-row");
  const go = el("button", "btn btn-primary", "문제 풀이로 이동");
  go.type = "button";
  go.addEventListener("click", () => goTab("quiz"));
  const del = el("button", "btn btn-text", "과목 삭제");
  del.type = "button";
  del.addEventListener("click", () => deleteSubject(d));
  row.append(go, del);
  p.body.appendChild(row);

  frag.appendChild(p.box);
  return frag;
}

/* ---------- 화면 3. 문제 풀이 ---------- */

function viewQuizStart() {
  const d = state.detail;
  const frag = document.createDocumentFragment();
  const p = panel("시험 시작", "10문항");
  p.body.appendChild(el("div", "msg",
    "시작을 누르면 서버가 문제를 만들어 보냅니다. 이때 정답은 오지 않습니다. 답을 보내야 채점 결과가 옵니다."));

  const grid = el("div", "mode-grid");
  grid.style.marginTop = "14px";

  const b1 = el("button", "mode");
  b1.type = "button";
  b1.append(el("b", null, "새로 출제"), el("span", null, "자료에서 10문항을 새로 뽑습니다. 객관식·OX·주관식·빈칸이 섞입니다."));
  b1.addEventListener("click", () => startQuiz("new"));
  grid.appendChild(b1);

  const b2 = el("button", "mode");
  b2.type = "button";
  b2.append(el("b", null, "오답만 다시 풀기"), el("span", null, `틀린 문항 ${d.wrongCount}개만 다시 냅니다. 맞히면 오답 노트에서 빠집니다.`));
  b2.disabled = d.wrongCount === 0;
  b2.addEventListener("click", () => startQuiz("wrong"));
  grid.appendChild(b2);

  p.body.appendChild(grid);
  frag.appendChild(p.box);
  return frag;
}

function viewQuizQuestion() {
  const q = state.quiz;
  const item = q.questions[q.ix];
  const frag = document.createDocumentFragment();
  const p = panel(q.mode === "wrong" ? "오답 다시 풀기" : "문제 풀이", `문항 ${q.ix + 1}`);
  p.body.className = "panel-body tight";

  const bar = el("div", "qbar");
  bar.appendChild(el("span", null, `${q.ix + 1} / ${q.total}`));
  const track = el("div", "track");
  const fill = el("i");
  fill.style.width = (q.ix / q.total * 100) + "%";
  track.appendChild(fill);
  bar.append(track, el("span", null, `정답 ${q.right}`));
  p.body.appendChild(bar);

  const inner = el("div");
  inner.style.padding = "14px";
  inner.appendChild(el("span", "badge b-" + item.type, item.typeLabel));
  inner.appendChild(promptNode(item.prompt));

  const v = q.verdict;

  if (item.choices) {
    const box = el("div", item.type === "ox" ? "ox" : "choices");
    item.choices.forEach((c, i) => {
      const b = el("button", "choice");
      b.type = "button";
      if (item.type !== "ox") b.appendChild(el("span", "ix", (i + 1) + "."));
      b.appendChild(el("span", null, c));
      if (v) {
        b.disabled = true;
        if (c === v.answer) b.classList.add(c === q.given ? "pick-right" : "show-answer");
        else if (c === q.given) b.classList.add("pick-wrong");
      } else {
        b.addEventListener("click", () => submitAnswer(c));
      }
      box.appendChild(b);
    });
    inner.appendChild(box);
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = item.type === "blank" ? "빈칸에 들어갈 말" : "답을 입력하세요";
    input.style.maxWidth = "340px";
    if (v) { input.value = q.given || ""; input.disabled = true; }
    inner.appendChild(input);
    if (!v) {
      const row = el("div", "btn-row");
      const sb = el("button", "btn btn-primary", "서버에 제출");
      sb.type = "button";
      sb.addEventListener("click", () => submitAnswer(input.value));
      const sk = el("button", "btn", "모르겠습니다");
      sk.type = "button";
      sk.addEventListener("click", () => submitAnswer(""));
      row.append(sb, sk);
      inner.appendChild(row);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submitAnswer(input.value); }
      });
      setTimeout(() => input.focus(), 0);
    }
  }

  if (v) {
    const box = el("div", "verdict " + (v.correct ? "right" : "wrong"));
    box.appendChild(el("div", "vh", v.correct ? "정답입니다" : "오답입니다"));
    const vb = el("div", "vb");

    const l1 = el("p", "line");
    l1.append(document.createTextNode("정답 · "), el("span", "ans", v.answer));
    vb.appendChild(l1);

    if (!v.correct) {
      const l2 = el("p", "line");
      if (String(q.given || "").trim()) l2.append(document.createTextNode("제출한 답 · "), el("span", "mine", q.given));
      else l2.appendChild(document.createTextNode("제출한 답 · 없음 (모르겠습니다)"));
      vb.appendChild(l2);
    }
    if (v.why) vb.appendChild(el("p", "line", v.why));
    if (v.gradingRule) vb.appendChild(el("p", "rule", "채점 기준 · " + v.gradingRule));
    if (v.source) vb.appendChild(el("p", "rule", "출처 · " + v.source));

    const row = el("div", "btn-row");
    row.style.marginTop = "6px";
    const next = el("button", "btn btn-primary", q.ix + 1 >= q.total ? "결과 보기" : "다음 문제");
    next.type = "button";
    next.addEventListener("click", () => {
      if (q.ix + 1 >= q.total) q.done = true;
      else { q.ix++; q.given = null; q.verdict = null; }
      render();
    });
    row.appendChild(next);
    vb.appendChild(row);
    box.appendChild(vb);
    inner.appendChild(box);
    setTimeout(() => next.focus(), 0);
  }

  p.body.appendChild(inner);
  frag.appendChild(p.box);

  if (q.missing && q.missing.length && q.ix === 0 && !v) {
    const mp = panel("만들지 못한 유형");
    const msg = el("div", "msg warn");
    msg.appendChild(el("b", null, "자료에서 다음 유형을 만들 수 없었습니다."));
    const ul = el("ul");
    q.missing.forEach((m) => ul.appendChild(el("li", null, `${m.type} — ${m.why}`)));
    msg.appendChild(ul);
    mp.body.appendChild(msg);
    frag.appendChild(mp.box);
  }
  return frag;
}

function viewQuizResult() {
  const q = state.quiz;
  const p = panel("풀이 결과", q.mode === "wrong" ? "오답 다시 풀기" : "새로 출제");

  const res = el("div", "result");
  res.append(el("b", null, String(q.right)), el("span", null, `/ ${q.total} 문항 · 정답률 ${Math.round(q.right / q.total * 100)}%`));
  p.body.appendChild(res);

  const msg = el("div", "msg");
  msg.style.marginTop = "14px";
  msg.textContent = `서버가 채점했고 오답 노트도 서버에 저장했습니다. 현재 오답 ${q.wrongCount}건.`;
  p.body.appendChild(msg);

  const row = el("div", "btn-row");
  const again = el("button", "btn btn-primary", "새로 출제");
  again.type = "button";
  again.addEventListener("click", () => { state.quiz = null; render(); });
  row.appendChild(again);
  if (q.wrongCount) {
    const wb = el("button", "btn", `오답 노트 (${q.wrongCount}건)`);
    wb.type = "button";
    wb.addEventListener("click", () => { state.quiz = null; goTab("wrong"); });
    row.appendChild(wb);
  }
  p.body.appendChild(row);
  return p.box;
}

/* ---------- 화면 4. 오답 노트 ---------- */

function viewWrong() {
  const list = state.wrongs || [];
  const p = panel("오답 노트", `${list.length}건`);

  if (!list.length) {
    p.body.appendChild(el("div", "msg", "아직 오답이 없습니다. 문제를 풀면 틀린 문항만 서버에 쌓입니다."));
    return p.box;
  }

  p.body.className = "panel-body tight";
  const head = el("div", "panel-body");
  head.style.paddingBottom = "0";
  head.appendChild(el("div", "msg", "다시 풀어 맞히면 서버가 그 문항을 목록에서 지웁니다."));
  p.body.appendChild(head);

  const scroll = el("div", "tbl-scroll");
  scroll.style.marginTop = "14px";
  const tbl = el("table", "lms");
  const thead = el("thead");
  const htr = el("tr");
  ["번호", "유형", "문항", "제출한 답", "정답", "틀린 일시"].forEach((h) => htr.appendChild(el("th", null, h)));
  thead.appendChild(htr);
  const tbody = el("tbody");
  list.slice().reverse().forEach((w, i) => {
    const tr = el("tr");
    tr.appendChild(el("td", "num", String(list.length - i)));
    const t = el("td");
    t.appendChild(el("span", "badge b-" + w.type, w.typeLabel));
    tr.appendChild(t);
    const q = el("td", "q");
    q.appendChild(el("div", null, String(w.prompt).replace(/\n/g, " ")));
    if (w.source) q.appendChild(el("div", "when", "출처 · " + w.source));
    tr.appendChild(q);
    tr.appendChild(el("td", "mine", w.mine && w.mine.trim() ? w.mine : "(빈 답)"));
    tr.appendChild(el("td", "real", w.answer));
    tr.appendChild(el("td", "when", fmtDate(w.at)));
    tbody.appendChild(tr);
  });
  tbl.append(thead, tbody);
  scroll.appendChild(tbl);
  p.body.appendChild(scroll);

  const foot = el("div", "panel-body");
  foot.style.borderTop = "1px solid var(--line)";
  const row = el("div", "btn-row");
  row.style.marginTop = "0";
  const rb = el("button", "btn btn-primary", "오답만 다시 풀기");
  rb.type = "button";
  rb.addEventListener("click", () => { state.tab = "quiz"; startQuiz("wrong"); });
  const cb = el("button", "btn btn-text", "오답 전체 삭제");
  cb.type = "button";
  cb.addEventListener("click", clearWrongs);
  row.append(rb, cb);
  foot.appendChild(row);
  p.box.appendChild(foot);

  return p.box;
}

/* ---------- 동작 ---------- */

async function loadSubjects() {
  const { subjects } = await api("GET", "/api/subjects");
  state.subjects = subjects;
}

async function selectSubject(id) {
  state.activeId = id;
  state.tab = "summary";
  state.quiz = null;
  state.wrongs = null;
  try {
    state.detail = await api("GET", "/api/subjects/" + id);
  } catch (e) {
    state.detail = null;
    render();
    return showError(e.message);
  }
  render();
}

async function goTab(tab) {
  state.tab = tab;
  if (tab !== "quiz") state.quiz = null;
  if (tab === "wrong") {
    try {
      const { wrongs } = await api("GET", `/api/subjects/${state.activeId}/wrongs`);
      state.wrongs = wrongs;
    } catch (e) { render(); return showError(e.message); }
  }
  render();
}

async function startQuiz(mode) {
  try {
    const data = await api("POST", `/api/subjects/${state.activeId}/quiz`, { mode });
    state.tab = "quiz";
    state.quiz = {
      sessionId: data.sessionId, mode: data.mode, questions: data.questions,
      total: data.total, missing: data.missing || [],
      ix: 0, given: null, verdict: null, right: 0, wrongCount: 0, done: false,
    };
    render();
  } catch (e) { render(); showError(e.message); }
}

async function submitAnswer(given) {
  const q = state.quiz;
  if (!q || q.verdict || state.busy) return;
  state.busy = true;
  q.given = given;
  try {
    const v = await api("POST", `/api/quiz/${q.sessionId}/answer`, { index: q.questions[q.ix].index, given });
    q.verdict = v;
    q.right = v.progress.right;
    q.wrongCount = v.wrongCount;
    const cur = state.subjects.find((s) => s.id === state.activeId);
    if (cur) cur.wrongCount = v.wrongCount;
    if (state.detail) state.detail.wrongCount = v.wrongCount;
  } catch (e) {
    render();
    showError(e.message);
  } finally {
    state.busy = false;
    render();
  }
}

async function deleteSubject(d) {
  if (!window.confirm(`「${d.name}」을 삭제할까요?\n\n등록한 자료와 오답 노트가 서버에서 함께 사라집니다. 되돌릴 수 없습니다.`)) return;
  try {
    await api("DELETE", "/api/subjects/" + d.id);
    await loadSubjects();
    state.detail = null;
    state.activeId = state.subjects.length ? state.subjects[0].id : null;
    if (state.activeId) await selectSubject(state.activeId);
    else { state.tab = "new"; render(); }
  } catch (e) { render(); showError(e.message); }
}

async function clearWrongs() {
  const n = (state.wrongs || []).length;
  if (!window.confirm(`오답 ${n}건을 삭제할까요?\n\n되돌릴 수 없습니다.`)) return;
  try {
    await api("DELETE", `/api/subjects/${state.activeId}/wrongs`);
    state.wrongs = [];
    const cur = state.subjects.find((s) => s.id === state.activeId);
    if (cur) cur.wrongCount = 0;
    if (state.detail) state.detail.wrongCount = 0;
    render();
  } catch (e) { render(); showError(e.message); }
}

/* ---------- 전체 그리기 ---------- */

function render() {
  renderChrome();
  renderCrumb();
  renderStats();

  const main = $("main");
  main.innerHTML = "";

  if (state.tab === "new" || !state.subjects.length) { main.appendChild(viewNew()); return; }
  if (!state.detail) { main.appendChild(el("div", "msg", "과목을 고르세요.")); return; }

  main.appendChild(tabs());
  if (state.tab === "quiz") {
    if (!state.quiz) main.appendChild(viewQuizStart());
    else if (state.quiz.done) main.appendChild(viewQuizResult());
    else main.appendChild(viewQuizQuestion());
  } else if (state.tab === "wrong") {
    main.appendChild(viewWrong());
  } else {
    main.appendChild(viewSummary());
  }
}

/* ---------- 시작 ---------- */

$("btnNew").addEventListener("click", () => { state.tab = "new"; state.quiz = null; render(); });

(async function boot() {
  renderWire();
  try {
    await api("GET", "/api/health");
    $("connText").textContent = "서버 연결됨";
  } catch {
    $("conn").className = "conn down";
    $("connText").textContent = "서버 없음";
    render();
    return showError("서버에 닿지 못했습니다. 검은 창에서 node server.js 가 돌고 있는지 확인하세요.");
  }
  try {
    await loadSubjects();
    if (state.subjects.length) { await selectSubject(state.subjects[0].id); return; }
  } catch (e) {
    render();
    return showError(e.message);
  }
  render();
})();
