---
name: goal
description: 2단계 - 골 정의. 인터뷰 기록을 측정 가능한 골 한 문장, 성공 지표, 비목표, 완료 조건(DoD)으로 바꿔 02-goal.md를 쓴다. 전담 에이전트 goal-setter 가 수행한다. Use when defining goals, success metrics, acceptance criteria, scope boundaries, or when the user says 골 정하기, 목표 정의, 뭐가 되면 끝인가, 완료 조건.
---

# 2단계: GOAL

담당 에이전트: **`goal-setter`**
입력: `01-interview.md`
산출물: `docs/specs/<건>/02-goal.md`
다음 단계: `sdd`

## 절차

### 1. 입력 확인

`01-interview.md` 가 있어야 한다. 없으면 `interview` 스킬로 먼저 간다.
사용자가 인터뷰를 건너뛰길 원하면, 최소한 **누가 / 무엇을 / 무엇이 되면 끝인가** 세 가지는 직접 받아서 파일로 남긴 뒤 진행한다.

### 2. 에이전트 호출

Agent 도구로 `subagent_type: goal-setter` 를 호출한다:

```
인터뷰 파일: docs/specs/<건>/01-interview.md
사용자가 추가로 말한 것: <있으면>
02-goal.md 를 작성하고, 승인 질문 3개와 미결정 목록을 보고할 것.
```

### 3. 승인 게이트 (메인 세션이 직접)

에이전트가 돌려준 골 문장·지표·비목표·DoD를 사용자에게 보여주고 묻는다:

1. 골 문장의 숫자가 맞습니까?
2. 비목표 중에 "그건 해야 하는데" 가 있습니까?
3. DoD 중에 확인이 불가능한 항목이 있습니까?

**승인 전에는 3단계로 가지 않는다.** 수정 요청이 오면 같은 에이전트를 다시 호출해 고친다 — 당신이 직접 파일을 고치지 않는다.

## 규칙

- 숫자가 없으면 골이 아니다. 모르면 `미측정 — 사용자 확인 필요` 로 남기고 묻는다.
- 지표는 3개 이하, 측정 방법이 없는 지표는 지운다.
- DoD는 사람이 관찰할 수 있는 것만. "코드가 깔끔하다"는 DoD가 아니다.
- 비목표를 비워두지 않는다. 범위 방어선이다.

세부 지침은 `reference.md`, 문서 틀은 `template.md`.

## 에이전트를 못 찾으면

`.claude/agents/` 의 에이전트는 **세션이 시작될 때 등록된다.** 방금 추가했다면 `subagent_type: goal-setter` 호출이 "Agent type not found" 로 실패한다.
그때는 둘 중 하나로 처리한다:

- 세션을 새로 시작한다 (권장). 그러면 `goal-setter` 이 목록에 뜬다.
- 급하면 `subagent_type: general-purpose` 로 호출하되, 프롬프트 맨 앞에 `.claude/agents/goal-setter.md` 를 먼저 읽고 그 지침을 그대로 따르라고 지시한다.
