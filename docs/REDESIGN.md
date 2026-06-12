# 봇 스타터킷 재설계안 — 공모전(팀) → 일반 학습용(개인)

> 작성: 2026-06-12 · 상태: **A단계 구현 완료 (베이스 = cha-interview-bot-vrm)**
> 목표: 16팀 공모전용 구조를 **일반 학생 누구나** 따라 하는 학습 튜토리얼로 전환.
> 핵심 변경: **팀(team) 개념 제거**, RAG를 **aiforalab.com DB의 개인 데이터**로 이전.

---

## 0. 현재 상태 (2026-06-12)

- **베이스 코드 = `cha-interview-bot-vrm`** 로 교체 (작동 검증된 스트리밍 VRM, HeyGen 없음, `avatar.vrm` 포함).
  - 기존 cha-bot-starterkit(팀 변형)은 폐기. 면담봇 전용 텍스트는 범용화함.
- **A단계 재적용 완료**: `BOT_ID`(닉네임), `api/_lib/context.js`, `api/chat-stream.js`·`chat.js`(컨텍스트 조립 + 목업), `api/school-api.js`(rag 액션 + X-Bot-Id), `src/lib/rag.js`, 봇 내장 `/rag` 페이지, 라우팅·rewrite.
- **범용화 완료**: 인사말(`VITE_BOT_NAME`/`VITE_BOT_INTRO`), 제목·메타, AvatarPanel/ChatPanel/AuthModal 텍스트, 하드코딩 카카오 키 → env placeholder.
- **검증**: `npm run build` 통과, `/rag` 렌더 + 콘솔 에러 없음.
- **백엔드 자료 보존**: 원본 `server/`(aiforalab `api.php` + 미들턴 `interview-chat.js` + 실제 RAG jsonl)는 `../_backend_reference/` 로 이동 → **B단계 구현 시 참고**.

### 남은 작업
- (정리) `SurveyModal`·`trustComponents.js`(연구용 신뢰설계 설문) 제거.
- (B단계) aiforalab `rag_*`/`persona_*` 액션 + 테이블 — `_backend_reference/server/api.php` 참고하여 구현.
- (B단계) 미들턴 무상태 채팅 엔드포인트 — `_backend_reference/server/interview-chat.js` 참고.
- (C단계) README·튜토리얼 재작성 (팀→닉네임, 새 `/rag` 흐름).

---

## 1. 현재 구조 (As-Is)

```
[학생 봇]  →  [Vercel 프록시]  →  [middleton.p-e.kr]   (LLM + RAG + STT/TTS)
              TEAM_ID 전달          team_01~16_chunks.json  ← 팀 슬롯
                                    /finbot/team/XX/rag     ← RAG 관리 페이지
           →  [aiforalab.com]   (회원/로그인/로그/설문, 이미 본인 백엔드)
```

### 불편한 점
- **팀 번호(01~16)** 를 운영자에게 배정받아야 함 → 일반 학생에겐 부자연스러움.
- RAG가 학생 코드 **바깥(미들턴 서버 슬롯)** 에 있어 경로가 복잡함.
- RAG 관리가 미들턴이 호스팅하는 **별도 페이지**(`/finbot/team/XX/rag`)에서 일어남.
- "왜 이렇게 복잡한가"의 근원 = **RAG 저장·격리·관리가 전부 외부 서버에 묶여 있음.**

### 서버별 역할 (현재)
| 서버 | 역할 |
|------|------|
| middleton.p-e.kr | LLM(Gemma4), RAG 저장·검색·관리 UI, STT(Whisper), TTS(OmniVoice) |
| aiforalab.com | 회원가입/로그인(이메일·카카오), 채팅 로그, 설문 (PHP + DB) |

---

## 2. 설계 원칙

1. **개인 단위** — 팀 번호 폐기. 학생은 본인 식별자(닉네임 또는 학번)만 정함.
2. **RAG는 본인 데이터** — aiforalab.com DB의 본인 행(row)에 저장. (논리적 "개인 테이블")
3. **단순함** — 학습자가 이해할 수 있는 최소 경로. 불필요한 중간 단계 제거.
4. **기존 공모전 설정 무손상** — 미들턴의 team_01~16 슬롯·기존 튜토리얼은 그대로 둠. 새 구조는 **별개 경로로 추가**.
5. **LLM·음성은 미들턴 유지** — 학생 비용 0원(무료 공유) 장점 보존.

---

## 3. 새 구조 (To-Be)

```
[학생 봇 프론트]
   │ 질문
   ▼
[Vercel  api/chat-stream.js]
   1. aiforalab DB에서 BOT_ID의 RAG 청크 + 페르소나 조회
   2. 프롬프트 조립 (페르소나 + 청크 + 대화이력 + 질문)
   3. 미들턴 LLM에 "완성만" 요청 (stateless — 팀 슬롯 없음)
   │ SSE 스트림
   ▼
[학생 봇 프론트] ← 답변(+ TTS)

[RAG 관리]  학생 레포의 /rag 페이지  →  aiforalab api.php (rag_* 액션)  →  DB(rag_chunks)
```

### 핵심 아이디어
- **RAG 검색을 미들턴에서 떼어냄.** RAG 저장·검색을 **aiforalab(데이터가 있는 곳)** 에서 수행.
- **검색은 처음부터 top-k** (결정됨). 질문과 관련된 청크만 골라 프롬프트에 주입.
  - **1단계 = 키워드 검색** (결정됨). 질문·답변 텍스트에서 단어가 겹치는 청크를 점수화해 top-k.
    - 구현: DB FULLTEXT(ngram) 가능하면 사용, **없으면 PHP에서 간단 점수 매칭**(청크 적으니 충분) → ngram 미지원도 막힘 없음.
  - 2단계(나중 업그레이드): 임베딩(의미) 검색 — 필요해지면 추가. 지금은 보류.
- **미들턴은 "프롬프트 완성기"로만 사용** → 미들턴에 팀별 RAG 로직 불필요, 무상태 엔드포인트 1개면 끝.

---

## 4. 식별자(정체성) 모델

- `TEAM_ID` env  →  **`BOT_ID`** env 로 교체. 값 = 학생이 고른 **닉네임**(예: `bungae`). *(결정됨: 닉네임)*
  - **중복 방지**: 닉네임 최초 등록 시 DB에서 유일성 검사. 이미 쓰이면 다른 닉네임 요구.
  - 허용 문자 규칙(소문자/숫자/하이픈, 길이 제한)으로 URL·DB 안전성 확보.
- 봇은 **소유자(BOT_ID)의 RAG** 를 방문자 누구에게나 보여줌 → 읽기는 공개.
- **쓰기(RAG 편집)는 보호** 필요: 학생 A가 B의 청크를 못 덮어쓰게.
  - 방안: aiforalab 로그인(이미 존재) → 로그인 사용자 id == owner_id 일 때만 저장 허용.
  - 또는 봇별 발급 비밀토큰(`RAG_EDIT_TOKEN`). (학급 규모 작으니 간단히 가도 됨)

---

## 5. 데이터 모델 (aiforalab.com DB)

> 학생마다 **물리적 테이블**을 만들면 관리가 어려움 → **한 테이블 + owner_id 키**로 각자의 "개인 데이터" 구현 권장.

### 테이블: `rag_chunks`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AI | 행 고유값 |
| owner_id | VARCHAR | = BOT_ID (닉네임) |
| chunk_id | VARCHAR | 청크 식별자 (예: q1) |
| question | TEXT | 질문/트리거 |
| answer | TEXT | 답변/지식 |
| embedding | JSON/BLOB (선택) | 임베딩 벡터 (2단계 검색용) |
| created_at | DATETIME | |
| (UNIQUE: owner_id + chunk_id) | | 중복 방지 |
| FULLTEXT(question, answer) WITH PARSER ngram | | 한국어 키워드 검색용 인덱스 |

### 닉네임 등록: `bot_owner`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| owner_id | VARCHAR PK | 닉네임 (유일) |
| user_ref | VARCHAR | 소유 학생(로그인 계정) 연결 — 쓰기 권한 검사용 |
| created_at | DATETIME | |

### 테이블: `bot_persona` (선택)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| owner_id | VARCHAR PK | = BOT_ID |
| persona | TEXT | 봇 성격/말투 서술 |
| updated_at | DATETIME | |

---

## 6. API 변경

### (A) aiforalab.com — 새 액션 추가 (`/liveavatar-api/api.php`)
기존 액션 목록에 추가:
| action | 입력 | 동작 |
|--------|------|------|
| `rag_list` | owner_id | 해당 소유자 청크 전체 반환 (공개 읽기, 관리 UI용) |
| `rag_search` | owner_id, query, k | **질문과 관련된 top-k 청크만** 반환 (채팅 시 호출) |
| `rag_save` | owner_id, chunks[] (+auth) | 청크 저장/갱신 (임베딩 단계면 저장 시 벡터 계산) |
| `rag_delete` | owner_id, chunk_id (+auth) | 청크 삭제 |
| `rag_generate` | text (+auth) | 텍스트 → AI가 Q&A 청크 자동 생성(미리보기) |
| `persona_get` / `persona_set` | owner_id (+auth) | 페르소나 조회/저장 |

> `rag_generate`의 AI 자동 청크화는 미들턴 LLM을 1회 호출해 구현(현재 미들턴 RAG 페이지가 하던 일을 이쪽으로 이전).

### (B) Vercel 프록시 (학생 레포 `api/`)
- `chat-stream.js`, `chat.js`:
  - `TEAM_ID` → `BOT_ID` 로 교체.
  - 미들턴 `/api/team/{TEAM_ID}/chat-stream` 호출 **제거**.
  - 대신: ① aiforalab `rag_search`(질문 기반 top-k) + `persona_get` 으로 컨텍스트 수집 → ② 프롬프트 조립 → ③ 미들턴 **무상태 completion** 호출.
- `school-api.js`:
  - `X-Team-Id` 헤더 → `X-Bot-Id`(= BOT_ID)로 교체. (로그·설문 소유자 표시용)
- `school-api.js` ALLOWED_ACTIONS 에 위 `rag_*`, `persona_*` 추가하거나, 신규 프록시 `api/rag.js` 추가.

### (C) middleton.p-e.kr — 백엔드 운영자 작업 (1개만)
- **무상태 채팅 엔드포인트** 추가: `POST /finbot/api/chat-stream` (팀 경로 없음)
  - 입력: `{ messages | prompt, history, images }` — 이미 조립된 프롬프트/컨텍스트 포함.
  - 동작: RAG 검색 없이 LLM 완성만 SSE 스트림으로 반환.
  - (STT/TTS 엔드포인트는 현재 그대로 사용 — 변경 없음.)
- 기존 `/api/team/XX/*` 는 **그대로 유지**(공모전 무손상).

---

## 7. RAG 관리 페이지 이전

- 현재: 미들턴 호스팅 `/finbot/team/XX/rag`.
- 변경: **학생 레포 안의 React 라우트** `/rag` 로 이전 (또는 aiforalab에 1페이지).
  - PERSONA 입력 → `persona_set`
  - AUTO_CHUNKER (텍스트/파일 → `rag_generate` → 미리보기 → `rag_save`)
  - RAG_CHUNKS 목록 (`rag_list`, 삭제 `rag_delete`)
- 장점: 학생이 **자기 봇 안에서** 지식을 관리 → "내 봇 = 내 레포 = 내 지식" 일관성.

---

## 8. 새 학생 워크플로우 (튜토리얼 개편 방향)

```
[1] Git/GitHub/Vercel/카카오 준비          (기존과 동일)
[2] 템플릿 클론 → 본인 레포 push           (기존과 동일)
[3] Vercel 배포 — BOT_ID(닉네임/학번) 설정  (TEAM_ID 대신)
[4] 카카오 SDK 연결                         (기존과 동일)
[5] 봇의 /rag 페이지 접속 → 로그인          ← 변경: 미들턴 페이지 아님, 내 봇 안
[6] 페르소나 작성 + 텍스트 붙여넣어 청크 생성 → 저장  ← aiforalab DB에 저장
[7] (선택) VRoid 아바타
✅ 완성 — 카카오톡 공유
```

- README / `docs/tutorial.html` 의 **팀 관련 서술 전부 교체**, RAG 단계 재작성.
- 공모전 문구("2026 비즈모델 경진대회 16팀", "팀 격리") → 일반 학습 문구로.

---

## 9. 영향받는 파일

| 파일 | 변경 |
|------|------|
| `api/chat-stream.js`, `api/chat.js` | TEAM_ID→BOT_ID, 미들턴 팀경로 제거, RAG 컨텍스트 조립 후 무상태 호출 |
| `api/school-api.js` | X-Team-Id→X-Bot-Id, (선택) rag 액션 허용 |
| `api/rag.js` (신규) | aiforalab rag_* 프록시 (또는 school-api에 통합) |
| `src/App.jsx` | 팀 주석/로직 정리, `/rag` 라우트 연결 |
| `src/components/RagPage.jsx` (신규) | 봇 내장 RAG 관리 UI |
| `.env.example` | TEAM_ID→BOT_ID, 신규 토큰 등 |
| `README.md`, `docs/tutorial.html`, `docs/index.html` | 팀→개인, RAG 단계 재작성 |

| 미들턴(외부) | 무상태 `/finbot/api/chat-stream` 추가 |
| aiforalab(외부) | `rag_chunks`/`bot_persona` 테이블 + `rag_*`/`persona_*` 액션 |

---

## 10. 결정 사항 (확정)

1. **식별자 = 닉네임** (유일성 검사 + 허용문자 규칙).
2. **지식 수정 권한 = aiforalab 로그인 기반** — 로그인한 본인 소유 봇만 수정.
3. **검색 = 처음부터 top-k, 1단계는 키워드(단어 겹침)** — 임베딩은 나중에.
4. **RAG 관리 화면 = 봇 레포 내 `/rag` 페이지** (학생 자기 봇 안에서 관리).
5. **미들턴 무상태 엔드포인트**: 운영자에게 추가 요청. 없으면 임시로 기존 team 슬롯 1개를 공용 통로로 사용해 개발 진행.

### 남은 확인 (백엔드 사실확인, 개발 비차단)
- aiforalab DB 테이블명/컬럼을 실제 컨벤션에 맞출 것 (기존 `chat_logs_la` 등 참고).
- 미들턴 무상태 엔드포인트 추가 가능 시점 (없으면 임시 우회로로 진행).

---

## 11. 마이그레이션 / 무손상 보장

- 미들턴 `team_01~16`, aiforalab 기존 테이블은 **그대로 둠**.
- 새 구조는 **새 엔드포인트 + 새 테이블 + 새 env(BOT_ID)** 로만 추가되어 기존과 충돌 없음.
- 기존 공모전 봇은 계속 동작, 신규 학습용 봇만 새 경로 사용.

---

## 12. 작업 로드맵

### A. 레포(완료 ✅ — 백엔드 무의존, 목업으로 동작 검증됨)
1. ✅ `.env.example`: `TEAM_ID` → `BOT_ID`(+`VITE_BOT_ID`) 교체 + 설명.
2. ✅ `api/chat-stream.js`·`chat.js`: 팀 경로 제거, 컨텍스트 조립(`api/_lib/context.js`) + 무상태 호출, 백엔드 미설정 시 **목업 스트림**.
3. ✅ `api/school-api.js`: `rag_*`/`persona_*` 액션 허용, `X-Team-Id` → `X-Bot-Id`.
4. ✅ `src/lib/rag.js`(신규): 지식 클라이언트(백엔드 폴백 = localStorage 목업).
5. ✅ `src/pages/RagPage.jsx`(+css, 신규) + `main.jsx` `/rag` 분기 + `vercel.json` rewrite: PERSONA/AUTO_CHUNKER/목록 UI.
6. ✅ 팀 주석·`index.html` 제목·`package.json` 정리.
   - 검증: `npm run build` 통과 + `/rag` 에서 텍스트→청크 생성→저장→목록 반영 목업 동작 확인.

### B. 백엔드(선생님/운영자)
6. aiforalab: `bot_owner`·`rag_chunks`(+선택 persona) 테이블, `rag_*`/`persona_*` 액션, 닉네임 유일성, 로그인 기반 쓰기 보호.
7. 미들턴: 무상태 `/finbot/api/chat-stream` 추가(또는 임시 우회로 합의).

### C. 문서
8. `README.md`·`docs/tutorial.html`·`docs/index.html`: 팀→개인 닉네임, RAG 단계 재작성, 공모전 문구 교체.

> **권장 진행 순서**: A(레포 골격, 목업으로 동작 확인) → B(백엔드 연결) → C(문서). A는 지금 시작 가능.
```

---

## 13. 설문(Survey) 커스터마이즈 설계 — 요구사항 반영 (2026-06-12)

> 요구: ① RAG·설문 데이터를 **하나의 DB**에 ② 학생이 **직접 만들 수 있게** ③ 디폴트는 신뢰 설문이되 **문항·스케일을 바꿀 수 있게** ④ 재방문 시 방문 횟수 표시(이미 작동).

### 핵심 전환: 고정 컬럼 → 유연한 JSON (owner별)
현재 `survey_responses` 는 신뢰설계 18문항이 **컬럼으로 하드코딩**(q06_digital_twin … q24_overall_trust)되어 학생이 못 바꿈. → **owner별 정의 + JSON 응답**으로 일반화. RAG와 같은 패턴.

### 통합 DB 테이블 (한 DB 안에)
| 테이블 | 컬럼 | 용도 |
|--------|------|------|
| `rag_chunks` | owner_id, chunk_id, question, answer, embedding | 지식 |
| `bot_persona` | owner_id, persona | 페르소나 |
| **`survey_def`** | owner_id, schema_json, updated_at | **학생이 만든 설문 정의** (문항+스케일) |
| **`survey_responses`** (일반화) | id, owner_id, session_id, user_id, answers_json, scores_json, submitted_at, meta | **JSON 응답** (문항이 owner마다 달라 고정 컬럼 불가) |

- `schema_json` 예: `{ "scale":"yesno"|"likert5"|"likert7", "items":[{"id":"q1","text":"…","reverse":false}, …] }`
- **디폴트 = 신뢰 설문 템플릿** (기존 18문항 + 4-layer 점수)을 시드로 제공 → 학생이 복제 후 수정.
- 점수 계산(layer 합산 등)은 schema 의 그룹 정의 기반으로 서버가 동적 계산.

### aiforalab 액션 (api.php)
- `survey_def_get(owner_id)` / `survey_def_set(owner_id, schema_json)` (+auth) — 설문 정의 CRUD
- `save_survey(owner_id, session_id, answers_json)` — 일반화(기존 고정컬럼 → JSON)
- `survey_summary(owner_id)` — owner별 집계
- (기본 템플릿) `survey_template_default` 상수로 신뢰 설문 제공

### 프론트엔드
- `SurveyModal` → **데이터 구동형**: `survey_def_get` 으로 문항/스케일을 받아 렌더 (현재 하드코딩 18문항 대신).
- **설문 디자인 UI**: `/rag` 페이지(또는 `/survey`)에 "내 설문 만들기" 섹션 — 문항 추가/삭제, 스케일 선택, 디폴트(신뢰) 불러오기.
- 방문 횟수: 기존 `getVisitGreeting`(users.visit_count) 유지 — 변경 없음.

### 단계
- B단계에 RAG와 **함께** 구현 (같은 DB·같은 owner_id·같은 auth 패턴).
- 프론트 `SurveyModal` 데이터 구동화 + 디자인 UI 는 백엔드 액션 준비 후.
