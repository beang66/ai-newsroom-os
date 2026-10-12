# 백엔드 잔여 업무 인벤토리 (2026-10-02)

> 결론 한 줄: **백엔드는 "비밀키 프록시 + 파일 호스팅 + 업데이트 피드 + 서비스 역할 관리"로 축소**되었고,
> 로직·AI 파이프라인·인증·데이터 접근은 대부분 **로컬 앱 코어**와 **Supabase 직접**으로 넘어갔다.
> 근거는 `app/core/**` 코드와 스텁 매니저(`NotImplementedError`)다.

## 1. 이미 앱 코어로 넘어간 것 — 백엔드 불필요

| 영역 | 위치 | 상태 |
|---|---|---|
| 기사 작성·편집·사진 배치 화면 | `app/frontend`, pywebview 셸 | 로컬 |
| AI 파이프라인(제목·부제·요약·흐름·사진설명·키워드) | `app/core/ai/headline.py`(434줄), `ai/router.py`(82줄) | 로컬 로직(프롬프트·스키마·검증) |
| 프롬프트 교차 검증(KeT5+KoBART+LLM) | `ai/headline.py`, `ai/local_models.py` | 로컬 |
| 음성 팩트체크 추론(Qwen3-0.6B) | `backend/models/*` → 앱 모델 매니저로 이관 예정 | 로컬(모델 2.18GB) |
| 모델 파일 관리(다운로드·해시·설치 폴더) | `app/core/managers/model_manager.py` | 로컬 완료 |
| 원고 저장·임시저장·로그 | `app/core/storage.py`, `.article-workspace/` | 로컬 JSON |
| 로그인·세션·토큰 갱신 | `app/core/managers/session_manager.py`, `integrations/supabase.py` | **Supabase 직접**(anon+JWT) |
| 프로젝트/기사 목록·메타 조회 | `integrations/supabase.py` `select`/`upsert` | **Supabase 직접(RLS)** — 앱 API 노출만 남음 |
| 실시간 협업(presence·커서) | `managers/collaboration_manager.py`(스텁) | Supabase Realtime 직접 예정 |
| 공유 데이터 동기화 | `managers/sync_manager.py`(스텁) | Supabase Storage/Postgres 직접 예정 |
| Unsplash 사진 **바이너리** 다운로드 | `app/core/api.py`(직접 `images.unsplash.com`) | 로컬 — 키 불필요 |

## 2. 백엔드가 반드시 해야 하는 것 (로컬로 못 넘김)

| # | 업무 | 왜 백엔드여야 하나 | 필요한 경로 | 규모 |
|---|---|---|---|---|
| 1 | **운영키 프록시**(LLM·이미지·Unsplash API) | 앱에 운영키를 두지 않는 규칙(`ARCHITECTURE.md`) | `/ai/responses`, `/ai/images/generations`, `/unsplash/*` | **코드 완성** (`backend/server.py`, `backend/express/ai-proxy.ts`) |
| 2 | **인증 게이트 + 레이트리밋** | 익명 호출 차단·사용자별 쿼터 | 위 경로 공통(`Authorization: Bearer <Supabase JWT>`) | **코드 완성** |
| 3 | **모델 팩 호스팅**(2.18GB·Range·SHA-256) | 배포본은 모델 미동봉(`docs/LOCAL_MODELS.md`) | 정적 파일(HF/S3/R2/사내서버) | **코드 0줄** — 호스팅만 |
| 4 | **앱 업데이트 피드** | 새 버전 알림·강제 최소버전·무결성 | `GET /app/updates/latest` (+서명/해시) | 소 (1~2) |
| 5 | **service_role 관리 작업** | 앱에 금지된 키가 필요 | 초대·권한위임, 공유 폐기, 감사로그, 탈퇴 정리 | 중 (3~5) |
| 6 | **외부 시스템 연동** | 자격증명·콜백이 필요 | CMS 발행, Slack/메일 알림 | 중 (기능별 1~2) |
| 7 | (선택) 사용량/오류 텔레메트리 | 서버 집계가 필요 | `POST /telemetry` | 소 |

> 3번은 정적 호스팅이면 **백엔드 코드가 필요 없습니다.** 매니페스트 `base` 한 줄로 끝납니다.

## 3. 앱 스텁 매니저 ↔ 백엔드 필요 여부 (근거: 파일:줄)

| 매니저 | 현재 | 백엔드 필요? | 판단 근거 |
|---|---|---|---|
| `update_manager.py:12` | `NotImplementedError` | **필요(4번)** | 업데이트 목록·서명은 서버가 제공 |
| `collaboration_manager.py:9` | 스텁 | **불필요** | Supabase Realtime 직접(JWT+RLS) |
| `sync_manager.py:9` | 스텁 | **불필요(권장)** | 암호화 후 Storage 직접 업로드 |
| `project_manager.py:14` | 로컬 단일 프로젝트 | **불필요** | PostgREST + RLS, 목록/조회 |
| `storage_manager.py:15` | 로컬 JSON | **불필요** | 암호화 SQLite로 확장 |
| `encryption_manager.py:9` | 스텁 | **불필요** | 기기 내 키. 키 백업을 서버에 두면 정책 결정 필요 |
| `model_manager.py` | 구현 완료 | **호스팅만 필요(3번)** | 파일은 정적 서버에서 |

## 4. 미구현 기능(WORK_LOG) 관점 — 백엔드가 필요한가

| 기능 | 판정 | 비고 |
|---|---|---|
| 3 자료 찾기·인터뷰 **STT** | **로컬 가능(권장)** | whisper.cpp/ONNX 로 기기 내 변환 → 외부 키 불필요. 클라우드 STT 를 쓰면 백엔드 프록시 필요 |
| 4 **팩트체크 서랍**(지식 저장소) | **로컬 모델 + 공유만 Supabase** | 추론은 코어 인프로세스(Qwen3), 팀 공유 지식은 Supabase 테이블/Storage 직접 |
| 6 **보관함·발행 이력** | **Supabase 직접** | 기사 목록/조회를 앱에 노출 + RLS. 집계·통계가 필요해지면 그때 백엔드 |
| 7 **카드뉴스·영상** | **팀은 Playwright 렌더 + n8n 로 구축 중(§8)** | 호스팅 주체 결정 필요. 공유 결과물만 Storage |
| 8 **CMS 연동** | **백엔드 필요**(2장 6번) | CMS 자격증명·콜백은 서버에만 |
| 알림(메일/Slack, 예정) | **백엔드 필요**(2장 6번) | 발송·스케줄은 서버 몫 |

## 5. 실제 남은 작업량 (우선순위)

| 단계 | 내용 | 작업량 |
|---|---|---|
| **즉시** | 기존 Render(Express)에 프록시 마운트 + 환경변수 5개 + `PORT`·`0.0.0.0`·**파서 순서**(전역 json 앞) 정리 | **0.5일** (코드 이미 있음 → 배포만) |
| **즉시** | 모델 팩 호스팅(S3/R2/HF/사내) + 매니페스트 `base` 채우기 | **0.5일** (백엔드 코드 **0줄**) |
| 단기 | 앱 업데이트 피드(`/app/updates/latest`) + `UpdateManager` 구현 | 1일 (서버 1 + 앱 1) |
| 중기 | 프로젝트 목록·조회·공유를 Supabase RLS 로 | 앱 중심(백엔드 거의 없음) |
| 중기 | 초대·권한 위임·감사 로그(service_role) | 1~2일 |
| 장기 | CMS 발행 · 알림 · (원하면) 클라우드 STT | 기능별 1~2일 |

**엔드포인트 수 추정**: 최소 **6개**(health 1 + AI 2 + Unsplash 3) + 업데이트 1~2 = **7~8개**.
팀 관리 기능까지 포함해도 **10~15개** → 지금 웹앱(Express, `server.ts` 16 KB)보다 **작아집니다.**

## 6. 확인 방법

```
python dev/checks/backend_check.py --url https://<서비스>.onrender.com
# 계약 준비 시:  PASS 백엔드 /ai/health  +  PASS 앱 클라이언트 경로   →  3/3
```

- 계약 상세: `docs/BACKEND_CONTRACT.md`
- 연동 현황·진단: `docs/BACKEND_INTEGRATION.md`
- 모델 호스팅: `docs/LOCAL_MODELS.md`

## 7. 설계 결정이 필요한 항목

1. **공유/권한**을 Supabase RLS 만으로 갈지, 백엔드 API + 감사 로그를 둘지
   (권장: 읽기·일반 쓰기는 RLS 직접, **파괴적·관리 작업만 백엔드**).
2. **암호화 키 백업** — 사용자가 키를 잃으면 공유 데이터 복구 불가. 서버 보관 여부 결정 필요.
3. **카드뉴스·영상**을 기기 렌더로 갈지 서버 렌더로 갈지(비용/성능).
4. **발행 이력·통계**를 Supabase 뷰로 충분한지, 서버 집계가 필요한지.

## 8. 새로 올라온 코드 — platform-generator (2026-10-02, jeongminimi)

브랜치 `feature/platform-generator`(`8f140fd`, **main 미병합**)에 **카드뉴스·SNS 생성 파이프라인**이 올라왔다.
로컬 사본: `C:\ai-newsroom-os\ai-newsroom-os-platform-generator` (main 사본은 `C:\ai-newsroom-os\ai-newsroom-os-main`)

| 구성 | 내용 |
|---|---|
| `platform-generator/server.js` | Express + **Playwright(chromium)** 렌더 서비스. `GET /health`, `POST /render`(HTML 템플릿 → PNG), `/output` 정적 서빙. **`app.listen(3000)` 하드코딩** |
| `package.json` | `express ^5.2.1`, `playwright ^1.63.0` (start 스크립트 없음 → `node server.js`) |
| `workflows/10_Content_Generate_API.json` | n8n webhook → 정규화·검증 → 플랫폼 분기 → 11·12 호출 → 응답 |
| `workflows/11_Instagram_Generate.json` | OpenAI 초안 → **검수1(원문 왜곡 팩트체크)** → **검수2(요구사항)** → 14 호출 |
| `workflows/12_Threads_Generate.json` | 위와 같은 구조(Threads) |
| `workflows/14_Instagram_Render.json` | 카드 분할 → `POST /render` |
| 실제 호출 대상 | **OpenAI**(n8n 계정 크리덴셜, 30회 언급), `http://localhost`(렌더러), `api.unsplash.com` |

### 이 코드가 백엔드 인벤토리에 주는 영향

1. **7번(카드뉴스·영상) 정정** — 로컬 ffmpeg 가정이 아니라 **팀은 Playwright 렌더 + n8n** 으로 구축 중.
   렌더러(chromium)와 n8n 은 **호스팅 주체 결정이 필요**(Render 무료 플랜 부적합 → 사내 서버/컨테이너 권장).
2. **키 소유권 중복 위험** — LLM 키가 (a) 우리 백엔드 프록시, (b) n8n 크리덴셜 두 곳에 생길 수 있다.
   → "앱·워크플로 모두 백엔드 프록시 경유"로 일원화하거나, n8n 을 내부망 전용으로 못 박기.
3. **파이프라인 중복 주의** — SNS용 **2단 검수(팩트체크+요구사항)** 가 앱의 `ai/router.py` 파이프라인과 겹친다.
   공통 규칙(팩트체크·검수)의 소유 위치를 정해 중복 구현을 막을 것.
4. **`POST /render` 계약은 우리 백엔드 계약과 별개** — 앱이 직접 호출할지, 백엔드가 중계할지 결정 필요.
## 9. main 전면 개편 확인 — 순수 React SPA 프로토타입 (2026-10-02, sohyeon1628-prog)

`origin/main` 이 `e933257` → **`ad63bda`** 로 바뀌었다(작업 전 백업: `backup/legacy-main`, `backup/origin-main`).

| 항목 | 내용 |
|---|---|
| 구조 | 루트에 **서버가 없다** — `server.ts`·express 삭제. Vite + React 19 + Tailwind 4 SPA |
| 스크립트 | `dev`/`build`/`preview`(vite), `lint`(oxlint) — **`start` 없음** |
| 화면 | 기사 작성(`ArticleWriter`) · 팩트체크 서랍(`FactCheckDrawer`) · 플랫폼 변환(`FormatConverter`) · 녹취 스튜디오(`interview/*` 8개 + `interviewStudio.css` 3.5천 줄) · 발행 준비(`PublishPrep`) · 보관함(`ArchiveView`) · 자료 찾기(`SourceSearch`) |
| 데이터 | **목업**(`src/data/mockData.js`) — 실제 API 연동 없음 |
| 외부 호출 | **`src/utils/transcribe.js` 하나뿐**: ① `@xenova/transformers`(브라우저 로컬 Whisper) ② Groq/OpenAI Whisper 를 **브라우저에서 직접 호출**(`Authorization: Bearer <사용자 입력 키>`) |
| 문서 | README 는 Vite 기본 템플릿 그대로 |

### 우리 작업 관점 정리

1. **배포**: 서버가 없으므로 Render **Static Site**(`npm run build` → `dist`)가 맞다.
   우리 프록시가 쓰는 기존 Web Service 는 그대로 두면 된다.
2. **백엔드가 필요한 지점은 STT 하나뿐**: 나머지는 목업이라 서버가 필요 없다.
   STT 도 `@xenova/transformers` 로 **로컬(브라우저) 추론**이 이미 구현되어 있고,
   **클라우드 STT(Groq/OpenAI) 경로만** 키 노출·CORS 문제가 있다 → 원하면 우리 프록시에
   `/ai/audio/transcriptions`(멀티파트 중계·무저장)를 추가해 키를 감출 수 있다.
3. **기능 중복**: 기사 작성·팩트체크·녹취·플랫폼 변환·보관함·발행이 우리 **로컬 앱**과 겹친다.
   웹을 프로토타입으로 둘지 / 화면 참고자료로 삼을지 / 로컬 앱 화면을 웹 UI에 맞춰 개편할지 **방향 결정 필요**.
4. 기존 Express 웹앱은 `backup/*` 브랜치에 보존되어 있다(되살릴 때 사용).


