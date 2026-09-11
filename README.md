# 목포해양대학교 AI 바이브코딩 (2차)

인터뷰 → 골 정의 → 구현 순서로 시험 대비 웹앱 **「쌓아가는 시험노트」** 를 만든 기록이다.
2026-09-11 수업 시간 안에 만든 결과물과, 그 결정 과정을 남긴 문서를 함께 둔다.

## 무엇이 들었나

| 경로 | 내용 |
|---|---|
| [`app/exam-notebook.html`](app/exam-notebook.html) | 결과물. 단일 HTML 파일 하나로 도는 웹앱 |
| [`docs/specs/2026-09-11-exam-prep-app/01-interview.md`](docs/specs/2026-09-11-exam-prep-app/01-interview.md) | 요구사항 인터뷰 원문 기록 (라운드 0~5) |
| [`docs/specs/2026-09-11-exam-prep-app/02-goal.md`](docs/specs/2026-09-11-exam-prep-app/02-goal.md) | 골 한 문장, 성공 지표, 비목표, 완료 조건 (승인됨) |
| [`docs/specs/2026-09-11-exam-prep-app/03-spec.md`](docs/specs/2026-09-11-exam-prep-app/03-spec.md) | 명세 — **건너뛴 이유와 그래서 빠진 것** 을 적은 문서 |
| [`.claude/`](.claude/) | 이 과정을 굴린 스킬(interview·goal·sdd·tdd)과 전담 에이전트 정의 |

## 앱 실행

`app/exam-notebook.html` 을 브라우저로 열면 된다. 서버도 설치도 필요 없다.

- 학습 자료를 붙여 넣으면 **핵심만 정리**해 보여 주고, 원문은 펼쳐서 볼 수 있다
- 정리한 내용에서 **객관식 · OX · 주관식 · 빈칸** 4종으로 한 번에 10문항을 출제한다
- 틀린 문제는 **오답 노트**에 쌓인다

## 이 저장소를 읽는 순서

1. `01-interview.md` — 사용자가 실제로 무엇을 말했나 (다듬지 않은 원문)
2. `02-goal.md` — 그 말이 어떤 결정으로 굳었나. 폐기된 결정도 지우지 않고 남겼다
3. `03-spec.md` — 명세를 건너뛰면서 무엇이 문서 없이 코드 안으로 들어갔나
4. `app/exam-notebook.html` — 그 결과

3번이 이 저장소에서 가장 정직한 문서다. 명세 없이 구현으로 건너뛴 대가가
무엇인지(요구사항 ID 없음, 추적표 없음, 테스트 없음) 그대로 적혀 있다.

## 수업 교재

교안 PDF·HTML, 실습파일, 요청문 모음은 코드잇 배포 자료라 이 저장소에 올리지 않았다.
1차 강의 자료는 [mmu-ai-literacy-1](https://github.com/tripleseoi3-ai/mmu-ai-literacy-1) 에 있다.
