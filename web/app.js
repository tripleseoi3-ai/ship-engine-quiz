"use strict";

/* ============================================================
   전체 앱 — 과목 등록 · 정리 · 출제 · 채점 · 오답노트.

   서버가 없다. 전부 이 브라우저 안에서 돈다.
   - 자료 해석과 출제·채점 규칙 : study.js  (server/lib/study.js 에서 만들어진 것)
   - 저장                      : localStorage

   붙여넣은 자료는 어디로도 전송되지 않는다.
   ============================================================ */

const S = window.Study;
const KEY = "exam-notebook/web/v1";
const QUIZ_SIZE = 10;

let storeOk = true;
let storeWhy = "";

function loadStore() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { version: 1, subjects: [] };
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.subjects)) return { version: 1, subjects: [] };
    return { version: 1, subjects: p.subjects };
  } catch {
    storeOk = false;
    storeWhy = "이 브라우저가 저장을 막고 있습니다(시크릿 창이거나 사이트 데이터 차단).";
    return { version: 1, subjects: [] };
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
  tab: "summary",   // summary | quiz | wrong | new
  quiz: null,
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const findSubject = (id) => state.store.subjects.find((s) => s.id === id);
const active = () => findSubject(state.activeId);

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

function notice(kind, strong, rest) {
  const box = el("div", "msg" + (kind ? " " + kind : ""));
  if (strong) box.appendChild(el("b", null, strong));
  if (rest) box.appendChild(document.createTextNode(rest));
  return box;
}

/* ---------- 고정 영역 ---------- */

function renderChrome() {
  const subs = state.store.subjects;
  const wrongTotal = subs.reduce((n, s) => n + (s.wrongs || []).length, 0);

  const conn = $("conn");
  conn.className = storeOk ? "conn" : "conn down";
  $("connText").textContent = storeOk ? "이 브라우저에 저장" : "저장 안 됨";

  const chips = $("chips");
  chips.innerHTML = "";
  const c1 = el("span", "chip");
  c1.append(document.createTextNode("등록 과목 "), el("b", null, String(subs.length)));
  const c2 = el("span", "chip" + (wrongTotal ? " alert" : ""));
  c2.append(document.createTextNode("오답 "), el("b", null, String(wrongTotal)));
  chips.append(c1, c2);

  const list = $("courses");
  list.innerHTML = "";
  $("courseCount").textContent = subs.length;
  $("coursesEmpty").hidden = subs.length > 0;

  subs.forEach((s) => {
    const li = el("li");
    const b = el("button", "course");
    b.type = "button";
    b.setAttribute("aria-current", s.id === state.activeId ? "true" : "false");
    b.appendChild(el("span", "nm", s.name));
    const w = (s.wrongs || []).length;
    b.appendChild(el("span", w ? "n bad" : "n", w ? `오답 ${w}` : `${S.splitLines(s.raw).length}줄`));
    b.addEventListener("click", () => {
      state.activeId = s.id; state.tab = "summary"; state.quiz = null; render();
    });
    li.appendChild(b);
    list.appendChild(li);
  });
}

function renderCrumb() {
  const c = $("crumb");
  c.innerHTML = "";
  const cur = active();
  const parts = ["홈", "내 과목"];
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
  const s = active();
  if (!s || state.tab === "new") { box.hidden = true; return; }
  box.hidden = false;

  const m = S.parseMaterial(s.raw);
  const av = S.availability(m);
  const kinds = ["choice", "ox", "short", "blank"].filter((k) => av[k]);

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
  row("오답", (s.wrongs || []).length + "건", (s.wrongs || []).length ? "bad" : "ok");
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

/* ---------- 화면 1. 과목 등록 ---------- */

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
  const save = el("button", "btn btn-primary", "등록하고 정리 보기");
  save.type = "button";
  row.appendChild(save);
  if (!first) {
    const cancel = el("button", "btn", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", () => { state.tab = "summary"; render(); });
    row.appendChild(cancel);
  }
  footer.appendChild(row);
  p.box.appendChild(footer);

  save.addEventListener("click", () => {
    const n = name.value.trim();
    const r = raw.value;
    if (!n) { msg.hidden = false; msg.textContent = "과목명을 입력하세요."; name.focus(); return; }
    if (r.trim().length < 20) { msg.hidden = false; msg.textContent = "학습 자료가 너무 짧습니다. 20자 이상 붙여넣으세요."; raw.focus(); return; }
    const s = { id: uid(), name: n, raw: r, createdAt: new Date().toISOString(), lastAt: null, lastScore: null, wrongs: [] };
    state.store.subjects.push(s);
    state.activeId = s.id;
    state.tab = "summary";
    const ok = saveStore();
    render();
    if (!ok) $("main").prepend(notice("bad", "저장에 실패했습니다. ", storeWhy));
  });

  setTimeout(() => name.focus(), 0);
  return p.box;
}

/* ---------- 화면 2. 학습 자료 ---------- */

function viewSummary() {
  const s = active();
  const m = S.parseMaterial(s.raw);
  const groups = S.summarize(m);
  const av = S.availability(m);

  const p = panel(s.name, `용어 ${av.termCount}개`);
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
  const go = el("button", "btn btn-primary", "문제 풀이로 이동");
  go.type = "button";
  go.addEventListener("click", () => { state.tab = "quiz"; render(); });
  const del = el("button", "btn btn-text", "과목 삭제");
  del.type = "button";
  del.addEventListener("click", () => deleteSubject(s));
  row.append(go, del);
  p.body.appendChild(row);

  return p.box;
}

/* ---------- 화면 3. 문제 풀이 ---------- */

function viewQuizStart() {
  const s = active();
  const frag = document.createDocumentFragment();
  const p = panel("출제 방식 선택", `${QUIZ_SIZE}문항`);
  p.body.appendChild(notice(null, null, "객관식 · OX · 주관식 · 빈칸이 섞여 나옵니다. 유형마다 최소 1문항을 먼저 채웁니다."));

  const grid = el("div", "mode-grid");
  grid.style.marginTop = "14px";

  const b1 = el("button", "mode");
  b1.type = "button";
  b1.append(el("b", null, "새로 출제"), el("span", null, `내 자료에서 ${QUIZ_SIZE}문항을 새로 뽑습니다. 풀 때마다 조금씩 달라집니다.`));
  b1.addEventListener("click", () => startQuiz("new"));
  grid.appendChild(b1);

  const wrongs = s.wrongs || [];
  const b2 = el("button", "mode");
  b2.type = "button";
  b2.append(el("b", null, "오답만 다시 풀기"), el("span", null, `틀린 ${wrongs.length}문항만 다시 냅니다. 맞히면 오답 노트에서 빠집니다.`));
  b2.disabled = wrongs.length === 0;
  b2.addEventListener("click", () => startQuiz("wrong"));
  grid.appendChild(b2);

  p.body.appendChild(grid);
  frag.appendChild(p.box);
  return frag;
}

function startQuiz(mode) {
  const s = active();
  let questions = [];
  let missing = [];

  if (mode === "wrong") {
    questions = (s.wrongs || []).map((w) => ({
      type: w.type, prompt: w.prompt, choices: w.choices || null,
      answer: w.answer, also: w.also || [], why: w.why || "", source: w.source || "",
    }));
    // 순서를 섞는다
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  } else {
    const made = S.makeQuestions(S.parseMaterial(s.raw), QUIZ_SIZE, s.name);
    questions = made.questions;
    missing = made.missing;
  }

  state.tab = "quiz";
  state.quiz = { mode, questions, total: questions.length, ix: 0, given: null, checked: false, right: 0, missing, done: questions.length === 0 };
  render();
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
  inner.appendChild(el("span", "badge b-" + item.type, S.TYPE_LABEL[item.type] || item.type));
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
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = item.type === "blank" ? "빈칸에 들어갈 말" : "답을 입력하세요";
    input.style.maxWidth = "340px";
    if (q.checked) { input.value = q.given || ""; input.disabled = true; }
    inner.appendChild(input);
    if (!q.checked) {
      const row = el("div", "btn-row");
      const sb = el("button", "btn btn-primary", "제출");
      sb.type = "button";
      sb.addEventListener("click", () => submit(input.value));
      const sk = el("button", "btn", "모르겠습니다");
      sk.type = "button";
      sk.addEventListener("click", () => submit(""));
      row.append(sb, sk);
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

    const row = el("div", "btn-row");
    row.style.marginTop = "6px";
    const next = el("button", "btn btn-primary", q.ix + 1 >= q.total ? "결과 보기" : "다음 문제");
    next.type = "button";
    next.addEventListener("click", () => {
      if (q.ix + 1 >= q.total) q.done = true;
      else { q.ix++; q.given = null; q.checked = false; }
      render();
    });
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

function submit(given) {
  const q = state.quiz;
  const item = q.questions[q.ix];
  const s = active();
  q.given = given;
  q.checked = true;

  const ok = S.isCorrect(given, item);
  if (ok) q.right++;

  s.wrongs = s.wrongs || [];
  const sig = item.type + "|" + item.prompt;
  const at = s.wrongs.findIndex((w) => w.type + "|" + w.prompt === sig);

  if (ok) {
    if (at > -1) s.wrongs.splice(at, 1);
  } else if (at < 0) {
    s.wrongs.push({
      type: item.type, prompt: item.prompt, choices: item.choices || null,
      answer: item.answer, also: item.also || [], why: item.why || "", source: item.source || "",
      mine: String(given || ""), at: new Date().toISOString(),
    });
  } else {
    s.wrongs[at].mine = String(given || "");
    s.wrongs[at].at = new Date().toISOString();
  }

  s.lastAt = new Date().toISOString();
  if (q.ix + 1 >= q.total) s.lastScore = { right: q.right, total: q.total, at: s.lastAt };
  saveStore();
  render();
}

function viewQuizResult() {
  const q = state.quiz;
  const s = active();
  const p = panel("풀이 결과", q.mode === "wrong" ? "오답 다시 풀기" : "새로 출제");

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
    const m = notice(null, null, `현재 오답 ${(s.wrongs || []).length}건입니다.`);
    m.style.marginTop = "14px";
    p.body.appendChild(m);
  }

  const row = el("div", "btn-row");
  const again = el("button", "btn btn-primary", "새로 출제");
  again.type = "button";
  again.addEventListener("click", () => { state.quiz = null; render(); });
  row.appendChild(again);
  if ((s.wrongs || []).length) {
    const wb = el("button", "btn", `오답 노트 (${s.wrongs.length}건)`);
    wb.type = "button";
    wb.addEventListener("click", () => { state.quiz = null; state.tab = "wrong"; render(); });
    row.appendChild(wb);
  }
  p.body.appendChild(row);
  return p.box;
}

/* ---------- 화면 4. 오답 노트 ---------- */

function viewWrong() {
  const s = active();
  const list = s.wrongs || [];
  const p = panel("오답 노트", `${list.length}건`);

  if (!list.length) {
    p.body.appendChild(notice(null, null, "아직 오답이 없습니다. 문제를 풀면 틀린 문항만 여기에 모입니다."));
    return p.box;
  }

  p.body.className = "panel-body tight";
  const head = el("div", "panel-body");
  head.style.paddingBottom = "0";
  head.appendChild(notice(null, null, "다시 풀어 맞히면 그 문항은 목록에서 빠집니다."));
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
    t.appendChild(el("span", "badge b-" + w.type, S.TYPE_LABEL[w.type] || w.type));
    tr.appendChild(t);
    const qc = el("td", "q");
    qc.appendChild(el("div", null, String(w.prompt).replace(/\n/g, " ")));
    if (w.source) qc.appendChild(el("div", "when", "출처 · " + w.source));
    tr.appendChild(qc);
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
  rb.addEventListener("click", () => startQuiz("wrong"));
  const cb = el("button", "btn btn-text", "오답 전체 삭제");
  cb.type = "button";
  cb.addEventListener("click", () => {
    if (!window.confirm(`오답 ${list.length}건을 삭제할까요?\n\n되돌릴 수 없습니다.`)) return;
    s.wrongs = [];
    saveStore();
    render();
  });
  row.append(rb, cb);
  foot.appendChild(row);
  p.box.appendChild(foot);

  return p.box;
}

/* ---------- 과목 삭제 · 백업 ---------- */

function deleteSubject(s) {
  if (!window.confirm(`「${s.name}」을 삭제할까요?\n\n등록한 자료와 오답 노트가 함께 사라집니다. 되돌릴 수 없습니다.`)) return;
  state.store.subjects = state.store.subjects.filter((x) => x.id !== s.id);
  state.activeId = state.store.subjects.length ? state.store.subjects[0].id : null;
  state.tab = state.store.subjects.length ? "summary" : "new";
  state.quiz = null;
  saveStore();
  render();
}

function exportBackup() {
  if (!state.store.subjects.length) { window.alert("내보낼 과목이 없습니다."); return; }
  const text = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), subjects: state.store.subjects }, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "시험노트_백업_" + new Date().toISOString().slice(0, 10) + ".json";
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

  const incoming = data.subjects.filter((s) => s && typeof s.name === "string" && typeof s.raw === "string");
  if (!incoming.length) { window.alert("불러올 과목이 없습니다."); return; }

  const merge = window.confirm(
    `과목 ${incoming.length}개를 찾았습니다.\n\n${incoming.map((s) => s.name).join(" · ")}\n\n` +
    `[확인] 지금 것에 합치기\n[취소] 지금 것을 지우고 덮어쓰기`
  );

  const mapped = incoming.map((s) => ({
    id: uid(), name: s.name, raw: s.raw,
    createdAt: s.createdAt || new Date().toISOString(),
    lastAt: s.lastAt || null, lastScore: s.lastScore || null,
    wrongs: Array.isArray(s.wrongs) ? s.wrongs : [],
  }));

  if (merge) {
    mapped.forEach((s) => {
      let name = s.name, n = 2;
      while (state.store.subjects.some((x) => x.name === name)) name = `${s.name} (${n++})`;
      state.store.subjects.push({ ...s, name });
    });
  } else {
    state.store.subjects = mapped;
  }

  state.activeId = state.store.subjects[0].id;
  state.tab = "summary";
  state.quiz = null;
  const ok = saveStore();
  render();
  if (!ok) $("main").prepend(notice("bad", "불러왔지만 저장에 실패했습니다. ", storeWhy));
}

/* ---------- 전체 그리기 ---------- */

function render() {
  renderChrome();
  renderCrumb();
  renderStats();

  const main = $("main");
  main.innerHTML = "";

  if (!storeOk) {
    main.appendChild(notice("bad", "저장되지 않습니다. ", storeWhy + " 창을 닫으면 등록한 자료가 사라집니다."));
  }

  if (state.tab === "new" || !state.store.subjects.length) { main.appendChild(viewNew()); return; }
  if (!active()) state.activeId = state.store.subjects[0].id;

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
render();
