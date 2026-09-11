---
name: tdd
description: 4단계 - 테스트 주도 구현. 승인된 명세의 REQ를 하나씩 RED(실패 테스트) → GREEN(최소 구현) → REFACTOR → COMMIT 으로 만들고 REQ↔테스트↔커밋 추적표를 채운다. 전담 에이전트 tdd-implementer 가 수행한다. Use when implementing test-first, or when the user says TDD, 테스트부터 짜줘, 실패 테스트 먼저, 구현 시작.
---

# 4단계: TDD

담당 에이전트: **`tdd-implementer`**
입력: `03-spec.md` (승인된 것)
산출물: 테스트 + 구현 코드, `docs/specs/<건>/04-traceability.md`

## 절차

### 1. 사전 조건 확인

`03-spec.md` 가 **사용자 승인을 받았는지** 확인한다. 안 받았으면 `sdd` 스킬의 승인 게이트로 돌아간다.
테스트 실행 명령(`pytest`, `npm test` 등)이 무엇인지 확인해 프롬프트에 넣는다.

### 2. REQ 하나씩 호출

Agent 도구로 `subagent_type: tdd-implementer` 를 호출한다. **한 호출에 REQ 하나**가 기본이다:

```
03-spec.md 사용자 승인 완료.
대상: REQ-003
명세 파일: docs/specs/<건>/03-spec.md
테스트 명령: pytest -q
커밋: 하지 말 것 / 해도 됨   ← 사용자 지시대로
```

서로 건드리는 파일이 겹치지 않는 REQ라면 여러 에이전트를 동시에 띄워도 된다.
같은 파일을 고칠 REQ들은 **반드시 순차로** 호출한다.

### 3. 결과 검증 (메인 세션이 직접)

에이전트 보고를 그대로 믿지 않는다. 다음을 확인한다:

- RED 출력과 GREEN 출력이 **실제 실행 결과**로 붙어 있는가
- 전체 테스트 결과가 보고에 있는가
- `04-traceability.md` 에 줄이 추가됐는가

의심스러우면 테스트 명령을 직접 한 번 돌려 확인한다.

### 4. 마무리

전 REQ가 초록불이 되면:
1. 전체 테스트를 한 번 더 돌려 **출력 그대로** 보고한다. 실패가 있으면 숨기지 않는다.
2. `04-traceability.md` 의 빈칸을 확인한다. 테스트 없는 REQ가 있으면 미완성이라고 말한다.
3. `02-goal.md` 의 DoD 중 **실제로 확인한 것만** 체크한다. 확인 안 한 항목은 이유를 적는다.
4. 남은 미결정 사항을 다시 목록으로 보여준다.

## 규칙

- 실패를 눈으로 확인하기 전에 구현 코드를 쓰지 않는다.
- 통과시키려고 테스트를 약화시키지 않는다. 명세가 틀렸으면 3단계로 돌아간다.
- REQ에 없는 기능을 겸사겸사 넣지 않는다.
- 커밋 메시지 첫 줄에 REQ ID: `REQ-003: 결석 4회 이상이면 경고 목록에 포함`

세부 지침은 `reference.md`, 추적표 틀은 `template.md`.

## 에이전트를 못 찾으면

`.claude/agents/` 의 에이전트는 **세션이 시작될 때 등록된다.** 방금 추가했다면 `subagent_type: tdd-implementer` 호출이 "Agent type not found" 로 실패한다.
그때는 둘 중 하나로 처리한다:

- 세션을 새로 시작한다 (권장). 그러면 `tdd-implementer` 이 목록에 뜬다.
- 급하면 `subagent_type: general-purpose` 로 호출하되, 프롬프트 맨 앞에 `.claude/agents/tdd-implementer.md` 를 먼저 읽고 그 지침을 그대로 따르라고 지시한다.
