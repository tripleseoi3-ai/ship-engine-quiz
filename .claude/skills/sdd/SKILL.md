---
name: sdd
description: 3단계 - SDD 명세 작성. 골을 REQ-001 형식 요구사항, Given/When/Then 시나리오, 에러 처리 표, 경계 조건으로 바꿔 03-spec.md를 쓴다. 전담 에이전트 spec-writer 가 수행하며 이 단계 승인 전에는 구현 코드를 쓰지 않는다. Use when writing a spec or design document before coding, or when the user says 명세 작성, 스펙 먼저, SDD, 요구사항 문서, 설계 문서.
---

# 3단계: SDD (Spec-Driven Development)

담당 에이전트: **`spec-writer`**
입력: `02-goal.md` (승인된 것)
산출물: `docs/specs/<건>/03-spec.md`
다음 단계: `tdd`

## 절차

### 1. 입력 확인

승인된 `02-goal.md` 가 있어야 한다. 없으면 `goal` 스킬로 먼저 간다.

### 2. 에이전트 호출

Agent 도구로 `subagent_type: spec-writer` 를 호출한다:

```
골 파일: docs/specs/<건>/02-goal.md
인터뷰 파일: docs/specs/<건>/01-interview.md
03-spec.md 를 작성하고, REQ 목록과 완결성 자가 점검 결과, 미결정 목록을 보고할 것.
```

요구사항이 많으면 영역별로 나눠 여러 번 호출해도 된다. 단 REQ 번호가 겹치지 않도록 **이미 쓴 마지막 번호를 프롬프트에 알려준다.**

### 3. 승인 게이트 (메인 세션이 직접)

에이전트가 돌려준 **REQ 목록만 따로 뽑아** 사용자에게 보여주고 확인받는다:

- 빠진 요구사항이 있습니까?
- 필요 없는데 들어간 것이 있습니까?
- 미결정 항목에 지금 답할 수 있는 것이 있습니까?

**여기서 승인되기 전에는 구현 코드를 한 줄도 쓰지 않는다.** 이 워크플로에서 가장 중요한 게이트다.
수정은 같은 에이전트를 다시 호출해서 한다.

## 규칙

- 한 REQ = 관찰 가능한 동작 하나. "그리고"가 두 번 나오면 쪼갠다.
- "빠르게 / 직관적으로 / 안정적으로" 금지. 숫자나 관찰 가능한 사실로.
- 예외 시나리오가 정상 시나리오보다 적으면 덜 쓴 것이다.
- 에러 처리 표에는 사용자가 다음에 할 일을 적는다. "로그만 남긴다"는 처리가 아니다.
- ID는 재사용하지 않는다. 철회해도 번호는 비워두고 `(철회)`.

세부 지침은 `reference.md`, 문서 틀은 `template.md`.

## 에이전트를 못 찾으면

`.claude/agents/` 의 에이전트는 **세션이 시작될 때 등록된다.** 방금 추가했다면 `subagent_type: spec-writer` 호출이 "Agent type not found" 로 실패한다.
그때는 둘 중 하나로 처리한다:

- 세션을 새로 시작한다 (권장). 그러면 `spec-writer` 이 목록에 뜬다.
- 급하면 `subagent_type: general-purpose` 로 호출하되, 프롬프트 맨 앞에 `.claude/agents/spec-writer.md` 를 먼저 읽고 그 지침을 그대로 따르라고 지시한다.
