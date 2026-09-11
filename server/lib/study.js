"use strict";

/* ============================================================
   자료를 읽고 · 요약하고 · 문제를 내고 · 채점하는 곳.

   이 파일은 백엔드에만 있다. 브라우저로 내려가지 않는다.
   그래서 정답과 채점 규칙이 사용자에게 노출되지 않는다.
   ============================================================ */

/* ---------- 1. 자료 해석 ---------- */

function splitLines(raw) {
  return String(raw == null ? "" : raw).replace(/\r\n?/g, "\n").split("\n");
}

function isTableLine(l) {
  const t = l.trim();
  return t.startsWith("|") && (t.match(/\|/g) || []).length >= 2;
}

function isSepRow(l) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(l);
}

function cells(l) {
  return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function stripMd(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}

const PAIR_BULLET = /^[-*+]\s+(.{1,32}?)\s*[::]\s*(.{2,})$/;
const PAIR_BOLD = /^\*\*(.{1,32}?)\*\*\s*[::]\s*(.{2,})$/;

/** 붙여넣은 글을 문제로 쓸 수 있는 조각들로 나눈다. */
function parseMaterial(raw) {
  const lines = splitLines(raw);
  const pairs = [];      // 용어 — 설명
  const statements = []; // 완성된 문장
  const headings = [];   // 절 제목
  const formulas = [];   // 관계식
  let section = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (isTableLine(line)) {
      const rows = [];
      while (i < lines.length && isTableLine(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !isSepRow(r));
      for (let r = 1; r < body.length; r++) {
        const c = cells(body[r]).map(stripMd);
        if (c.length >= 2 && c[0] && c[1] && c[0].length <= 32 && c[1].length >= 2) {
          pairs.push({ term: c[0], def: c.slice(1).filter(Boolean).join(" · "), section });
        }
      }
      continue;
    }

    if (/^#{1,6}\s+/.test(t)) {
      section = stripMd(t.replace(/^#{1,6}\s+/, ""));
      headings.push(section);
      i++;
      continue;
    }

    const mb = t.match(PAIR_BULLET) || t.match(PAIR_BOLD);
    if (mb) {
      pairs.push({ term: stripMd(mb[1]), def: stripMd(mb[2]), section });
      i++;
      continue;
    }

    if (t && !/^(---|===|>)/.test(t)) {
      const s = stripMd(t.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, ""));
      if (s.length >= 12) {
        const bold = (t.match(/\*\*(.+?)\*\*/g) || []).map(stripMd);
        statements.push({ text: s, section, bold });
        if (s.includes("=") && s.length <= 90) formulas.push({ text: s, section });
      }
    }
    i++;
  }

  const seen = new Set();
  const uniqPairs = [];
  for (const p of pairs) {
    if (!p.term || seen.has(p.term)) continue;
    seen.add(p.term);
    uniqPairs.push(p);
  }

  return { lines, pairs: uniqPairs, statements, headings, formulas };
}

/* ---------- 2. 정리 — 핵심만 ---------- */

const KEY_CAP = 96;
const clip = (s) => (s.length > KEY_CAP ? s.slice(0, KEY_CAP - 1) + "…" : s);

/** 핵심만 절별로 묶는다. 원문은 프론트가 따로 받아 펼친다. */
function summarize(m) {
  const index = new Map();
  const bucket = (name) => {
    const key = name || "핵심 정리";
    if (!index.has(key)) index.set(key, { name: key, items: [] });
    return index.get(key);
  };

  m.pairs.forEach((p) => bucket(p.section).items.push({ k: p.term, v: clip(p.def) }));
  m.formulas.forEach((f) => bucket(f.section).items.push({ formula: f.text }));
  m.statements.forEach((s) => {
    if (s.bold.length) bucket(s.section).items.push({ solo: clip(s.text) });
  });

  const groups = [];
  for (const g of index.values()) {
    const seen = new Set();
    g.items = g.items.filter((it) => {
      const sig = it.k || it.formula || it.solo;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    }).slice(0, 9);
    if (g.items.length) groups.push(g);
  }
  return groups;
}

/* ---------- 3. 채점 ---------- */
/* 디자인.md · 결정 7 — 띄어쓰기와 조사 차이는 정답으로 본다.
   끝에 붙은 조사 하나만, 남는 길이가 2자 이상일 때만 떼어낸다. */

const JOSA = ["으로서", "으로써", "이라는", "에서는", "에게서", "으로", "로서", "로써", "에서", "에게",
              "까지", "부터", "이란", "라는", "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "만", "로"];

function normalize(s) {
  if (s == null) return "";
  let t = String(s).trim().toLowerCase().replace(/\s+/g, "");
  t = t.replace(/[.,!?;·、。"'“”‘’()\[\]<>{}]/g, "");
  for (const j of JOSA) {
    if (t.length - j.length >= 2 && t.endsWith(j)) { t = t.slice(0, -j.length); break; }
  }
  return t;
}

function isCorrect(given, question) {
  const g = normalize(given);
  if (!g) return false;
  if (g === normalize(question.answer)) return true;
  return (question.also || []).some((a) => g === normalize(a));
}

/* ---------- 4. 출제 ---------- */

const TYPES = ["choice", "ox", "short", "blank"];
const TYPE_LABEL = { choice: "객관식", ox: "OX", short: "주관식", blank: "빈칸" };

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blankCandidates(m) {
  const out = [];
  const terms = m.pairs.map((p) => p.term).filter((t) => t.length >= 2);

  // 관계식이 가장 좋은 빈칸 재료다 — 피연산자 하나를 지운다.
  m.formulas.forEach((f) => {
    const ops = f.text.split(/[=+]/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 20);
    if (ops.length >= 2) out.push({ text: f.text, word: ops[Math.floor(Math.random() * ops.length)], section: f.section });
  });

  m.statements.forEach((s) => {
    const hit = terms.find((t) => s.text.includes(t) && s.text.length >= 16);
    if (hit) { out.push({ text: s.text, word: hit, section: s.section }); return; }
    const b = s.bold.find((x) => x.length >= 2 && x.length <= 20 && s.text.includes(x));
    if (b) out.push({ text: s.text, word: b, section: s.section });
  });

  const seen = new Set();
  return out.filter((c) => {
    const k = c.text + "|" + c.word;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 자료에서 어떤 유형을 낼 수 있는지 미리 알려준다. */
function availability(m) {
  const blanks = blankCandidates(m);
  return {
    choice: m.pairs.length >= 3,
    ox: m.pairs.length >= 2,
    short: m.pairs.length >= 1,
    blank: blanks.length >= 1,
    blanks,
    termCount: m.pairs.length,
  };
}

/**
 * 문제를 만든다. 반환값에는 정답과 해설이 들어 있다 —
 * 이 객체를 그대로 브라우저에 보내면 안 된다. server.js 가 걸러서 보낸다.
 */
function makeQuestions(m, want, sourceLabel) {
  const pairs = shuffle(m.pairs);
  const av = availability(m);
  const pools = {
    choice: av.choice ? pairs.slice() : [],
    ox: av.ox ? pairs.slice() : [],
    short: av.short ? pairs.slice() : [],
    blank: shuffle(av.blanks),
  };
  const cursor = { choice: 0, ox: 0, short: 0, blank: 0 };
  const missing = [];

  if (!pools.choice.length)
    missing.push({ type: "객관식", why: m.pairs.length ? `보기를 채울 용어가 3개 이상 필요합니다 (현재 ${m.pairs.length}개)` : "‘용어 — 설명’ 형태(표 또는 「용어: 설명」 줄)가 없습니다" });
  if (!pools.ox.length) missing.push({ type: "OX", why: "맞바꿔 볼 설명이 2개 이상 필요합니다" });
  if (!pools.short.length) missing.push({ type: "주관식", why: "‘용어 — 설명’ 형태가 없습니다" });
  if (!pools.blank.length) missing.push({ type: "빈칸", why: "용어가 들어간 완성된 문장이 없습니다" });

  const where = (sec) => (sourceLabel ? `${sourceLabel}${sec ? " · " + sec : ""}` : sec || "");

  function build(type) {
    const pool = pools[type];
    const k = cursor[type];
    if (!pool || k >= pool.length) return null;
    cursor[type] = k + 1;
    const item = pool[k];

    if (type === "choice") {
      const others = pairs.filter((p) => p.term !== item.term);
      const distract = shuffle(others).slice(0, 3).map((p) => p.term);
      if (distract.length < 2) return null;
      return {
        type, prompt: `다음 설명에 해당하는 것은?\n「${item.def}」`,
        choices: shuffle([item.term, ...distract]),
        answer: item.term, also: [],
        why: `${item.term} — ${item.def}`, source: where(item.section),
      };
    }

    if (type === "ox") {
      const alt = pairs.filter((p) => p.term !== item.term && p.def !== item.def);
      const lie = Math.random() < 0.5 && alt.length > 0;
      const shown = lie ? alt[Math.floor(Math.random() * alt.length)].def : item.def;
      return {
        type, prompt: `「${item.term}」 : ${shown}\n이 설명이 맞습니까?`,
        choices: ["O", "X"],
        answer: lie ? "X" : "O", also: [],
        why: lie ? `바꿔치기한 설명입니다. 「${item.term}」의 올바른 설명은 「${item.def}」입니다.`
                 : `「${item.term}」 — ${item.def}`,
        source: where(item.section),
      };
    }

    if (type === "short") {
      return {
        type, prompt: `다음 설명에 해당하는 용어를 쓰세요.\n「${item.def}」`,
        choices: null, answer: item.term, also: [],
        why: `${item.term} — ${item.def}`, source: where(item.section),
      };
    }

    if (type === "blank") {
      const hole = item.text.split(item.word).join("____");
      if (hole === item.text) return null;
      return {
        type, prompt: hole, choices: null,
        answer: item.word, also: [],
        why: `원문은 「${item.text}」입니다.`, source: where(item.section),
      };
    }
    return null;
  }

  const out = [];
  // 유형마다 최소 한 문항을 먼저 확보한다.
  for (const t of TYPES) { const q = build(t); if (q) out.push(q); }
  // 남은 자리를 돌아가며 채운다.
  let guard = 0;
  while (out.length < want && guard++ < want * 8) {
    let added = false;
    for (const t of TYPES) {
      if (out.length >= want) break;
      const q = build(t);
      if (q) { out.push(q); added = true; }
    }
    if (!added) break;
  }

  return { questions: shuffle(out).slice(0, want), missing };
}

module.exports = {
  parseMaterial, summarize, availability, makeQuestions,
  normalize, isCorrect, splitLines, TYPE_LABEL,
};
