---
name: url-screenshot-orchestrator
description: "URL screenshot project orchestrator. Gets URL and width/height to generate the screenshot. Uses deno, Express with html, Tailwind, Playwright stack. 트리거: 'need URL Screenshot page'. 후속 작업: '스크린샷 다시 생성', '뷰어 디자인 변경', '이전 스크린샷 개선', '스크린샷 업데이트' 등 URL 스크린샷 관련 모든 후속 요청도 반드시 이 스킬을 사용."
---

# URL Screenshot Orchestrator — URL Screenshot project workflow

5명의 에이전트 팀이 협업하여 Jot Integration Tests → Jot Express App → Run End to End Tests for
quilty check

## 실행 모드: 하이브리드

| Phase                                           | 모드          | 이유                                                                                     |
| ----------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| Phase 1 (planner+integration-tester)            | 에이전트 팀   | planner ↔ integration-tester need to agree on which integration to test                  |
| Phase 2 (server-side-writer+client-side-writer) | 에이전트 팀   | server-side-writer ↔ client-side-writer need to agree that integration tests are passing |
| Phase 3 (qa-tester)                             | 서브 에이전트 | run end to end testing                                                                   |

## 에이전트 구성

| 팀원               | agent_type         | 역할                                      | 출력                                                                                  |
| ------------------ | ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| planner            | planner            | Plan the whole project and file structure | `_workspace/01_planner.md`                                                            |
| integration-tester | integration-tester | Jot integration tests                     | integration playwright test files / testfiles + `_workspace/02_integration_tester.md` |
| server-side-writer | server-side-writer | Jot server-side express app               | server express app + `_workspace/03_server_side_writer.md`                            |
| client-side-writer | client-side-writer | Jot client-side files                     | html, tailwind, client side ts files + `_workspace/04_client_side_writer.md`          |
| qa-tester          | qa-tester          | End-to-end testing                        | end-to-end playwright test files + `_workspace/05_qa_tester.md`                       |

## 워크플로우

**전제조건:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (자동으로 ~/.claude/settings.json에 설정됨)

> **주요 변경 (v2.1.178+):** TeamCreate/TeamDelete는 더 이상 존재하지 않음. 에이전트들이 자동으로
> 팀을 형성하고 공유 task list로 coordination함.

### Phase 0: 컨텍스트 확인

1. `_workspace/` 존재 여부 확인
2. deno, Express with html, Tailwind, Playwright stack project 존재 여부 확인
3. 실행 모드 결정:
   - 둘 다 없음 → **초기 실행**, Phase 1 진행
   - 둘 다 존재 + 사용자가 부분 수정 요청 → **부분 재실행** (해당 에이전트만 호출)
   - 둘 다 존재 + 새 주제 입력 → **새 실행**, 기존 `_workspace/`를 `_workspace_{timestamp}/`로 보관
     후 새로 생성

### Phase 1: planner + integration-tester

**실행 모드:** 자동 agent team formation (v2.1.178+)

**실행:**

```
1. Agent(subagent_type: planner, model: opus)
2. Agent(subagent_type: integration-tester, model: opus)
```

**에이전트 팀의 자동 coordination:**

- **planner 역할:**
  - \_workspace/01_planner.md 작성 (architecture, components, API contract)
  - integration-tester가 기반할 architecture plan 제공
  - `SendMessage`로 integration-tester와 소통 (필요시)

- **integration-tester 역할:**
  - planner의 01_planner.md 읽기
  - planner가 제시한 API contract와 component list 기반 playwright tests 작성
  - /tests/integration/ 디렉토리에 test files 작성
  - \_workspace/02_integration_tester.md에 test strategy 문서화
  - `SendMessage`로 planner에 질문 (architecture 명확화 필요시)

- **Team coordination mechanism (자동):**
  - 공유 task list: 에이전트들이 task 자동 claim/complete
  - 의존성 관리: integration-tester의 task는 planner 완료 후 자동 unblock
  - 메시징: SendMessage로 팀원 간 직접 통신
  - 각 에이전트는 독립적 context window 사용 (token 사용량 증가)

**완료 조건:** 두 에이전트 모두 \_workspace/ 파일 작성 완료 → Phase 2 진행

### Phase 2: server-side-writer + client-side-writer

**실행 모드:** 자동 agent team formation

**실행:**

```
1. Agent(subagent_type: server-side-writer, model: opus)
2. Agent(subagent_type: client-side-writer, model: opus)
```

**에이전트 팀의 자동 coordination:**

- **server-side-writer 역할:**
  - Phase 1의 01_planner.md 및 02_integration_tester.md 읽기
  - src/app.ts, src/routes/, src/services/, src/lib/ 등 서버 코드 작성
  - \_workspace/03_server_side_writer.md에 구현 내용 문서화
  - integration tests 실행해서 API 검증
  - 문제 발견 시 client-side-writer와 `SendMessage` 협상

- **client-side-writer 역할:**
  - Phase 1의 01_planner.md 읽기
  - server-side-writer의 API endpoints 이해
  - public/index.html, public/styles/, public/ts/components/ 등 클라이언트 코드 작성
  - \_workspace/04_client_side_writer.md에 구현 내용 문서화
  - server API와의 integration 검증
  - 문제 발견 시 server-side-writer에 수정 요청

- **Team coordination mechanism:**
  - 의존성: client-side-writer는 server API endpoints 이해 필요 → server-side-writer가 먼저 진행
  - 메시징: API compatibility issues를 SendMessage로 해결
  - 공유 task list: 두 에이전트가 병렬로 작업 가능한 부분 자동 coordination

**완료 조건:**

- 모든 integration tests PASS
- 두 에이전트 모두 \_workspace/ 파일 작성 완료
- → Phase 3 진행

### Phase 3: qa-tester

**실행 모드:** 단일 에이전트 (팀이 아님)

**실행:**

```
Agent(subagent_type: qa-tester, model: opus)
```

**qa-tester 역할:**

- 모든 \_workspace/ 파일 읽기 (01~04)
- 프로젝트 전체 검토:
  - Architecture 이해 (01_planner.md)
  - Integration test coverage 검증 (02_integration_tester.md)
  - Server implementation 검증 (03_server_side_writer.md)
  - Client implementation 검증 (04_client_side_writer.md)
- End-to-end playwright tests 작성 (tests/e2e/)
- \_workspace/05_qa_tester.md에 테스트 결과 문서화

**실패 처리:**

문제 발견 시:

1. 명확한 failure report 작성
2. 관련 에이전트(server-side/client-side/planner)에 수정 요청
3. Phase 2로 돌아가 수정 후 재테스트

## 데이터 흐름

```
Phase 0: 컨텍스트 확인
    ↓
Phase 1 (Agent Team - 자동 coordination)
    ├─ [planner] ──────→ 01_planner.md
    └─ [integration-tester] ──→ 02_integration_tester.md + tests/integration/
           ↓ (SendMessage로 필요시 협상)
         둘 다 완료
    ↓
Phase 2 (Agent Team - 자동 coordination)
    ├─ [server-side-writer] ──→ 03_server_side_writer.md + src/
    └─ [client-side-writer] ──→ 04_client_side_writer.md + public/
           ↓ (SendMessage로 API 호환성 협상)
       Integration tests PASS
    ↓
Phase 3 (단일 에이전트)
    └─ [qa-tester] ──→ 05_qa_tester.md + tests/e2e/
           ↓
      E2E 테스트 PASS → 완료
      E2E 테스트 FAIL → Phase 2로 돌아가 수정 후 재테스트
```

**Agent Team Coordination (v2.1.178+):**

- 각 phase의 에이전트들이 자동으로 팀을 형성
- 공유 task list에서 작업 claim/complete
- SendMessage로 팀원 간 직접 소통
- 의존성 자동 관리 (planner 완료 → integration-tester task unblock)
- 각 에이전트는 독립적 context window (높은 token 사용량)

<!-- ## 에러 핸들링

| 상황              | 전략                                                             |
| ----------------- | ---------------------------------------------------------------- |
| codex 미인증      | Phase 1에서 즉시 중단, 사용자에게 `codex login` 요청             |
| storyteller 실패  | 기본 동화 템플릿 (별빛 우정 8장면) 으로 폴백                     |
| 이미지 일부 누락  | 누락 장면 1회 재시도, 그래도 실패 시 placeholder + 보고서에 명시 |
| 이미지 전체 실패  | 사용자에게 보고, 텍스트만 있는 뷰어 빌드 여부 확인               |
| book-builder 실패 | 최소 단일 페이지 fallback HTML 생성                              |
| qa-reviewer FAIL  | 문제 모듈에게 1회 수정 요청, 재실패 시 PARTIAL 로 마무리         |

## 테스트 시나리오

### 정상 흐름

1. 사용자: "동화책 만들어줘 — 별을 좋아하는 토끼 이야기"
2. Phase 2: storyteller 가 8장면 시나리오, art-director 가 일관된 watercolor 스타일 + 9개 영문 프롬프트 생성
3. Phase 3: illustrator 가 codex-image 배치로 약 5분 만에 9장 생성
4. Phase 4: book-builder 가 HTML 뷰어, qa-reviewer 가 PASS
5. 사용자가 `book/index.html` 을 열면 표지부터 8장면 + 엔딩까지 페이지 넘김 가능

### 에러 흐름 (이미지 1장 실패)

1. Phase 3 후 `book/images/scene_05.png` 누락 발견
2. illustrator 가 scene_05 만 단일 codex exec 재시도
3. 재시도 성공 → 정상 진행, 또는 실패 → placeholder + 보고서 명시
4. book-builder 가 placeholder 처리하여 뷰어 빌드
5. qa-reviewer 가 PARTIAL 로 보고

## description 의 후속 작업 키워드

이 description 은 다음 후속 요청에서도 반드시 트리거되어야 한다:

- "동화 다시 써", "장면 3 수정", "이미지 다시 그려", "스타일 바꿔", "뷰어 색감 변경"
- "이전 책 개선", "표지만 바꿔", "엔딩 메시지 수정" -->
