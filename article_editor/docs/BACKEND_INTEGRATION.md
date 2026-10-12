# 기사 작성 기능 — 팀 연동 계약 (v14)

> 출처: 노션 "백엔드 담당자 공유 — 기사 작성 기능 통합 안내"
> 작성: 고서연 · v14 · 2026-10-02
> 원본: https://transparent-bear-d7b.notion.site/3eddc185f6d3804e9120da9b48a12a98
> 이 문서는 위 안내에서 **연동에 필요한 내용만** 추린 것이다.

---

## 1. 목표

기사 작성 화면(로컬 Python 서버)을 **팀 기사 보관소·카드뉴스와 연결**한다.
화면이 보내는 원고를 팀 서버가 저장하고, 저장한 원고를 다시 열거나 다른 기능에서 사용할 수 있게 한다.

## 2. 핵심 원칙 (가장 중요)

> 각 기능이 서로 다른 기사 복사본을 만들지 않고 **같은 기사ID**를 기준으로 연결한다.

- DB 연결 = "화면의 저장 요청을 받아 공용 보관소에 넣고, 다시 읽어주는" 작업으로 이해하면 됨.

## 3. 전체 연결 흐름

1. 사용자가 보관소에서 기사 선택 → 팀 서버가 원고를 조회
2. 원고를 작성 화면에 전달 → 사용자가 제목·본문·사진을 수정
3. 작성 화면이 원고 전체를 전달 → 팀 서버가 **같은 기사ID로 갱신**
4. 보관소에서 저장 상태와 기사를 다시 확인
5. 카드뉴스가 **기사ID로** 저장된 원고를 읽어 제작

## 4. API 계약 (그대로 유지 → 프론트 변경 최소화)

| 주소 | 요청 | 응답 |
|---|---|---|
| `POST /api/articles/save` | `{draft: 원고전체}` | `{saved:true, articleId, fileName, folder}` |
| `POST /api/assist` | `{kind:"metadata", requested:"headline", body, current_headline}` | `headline_candidates` 배열 |
| `POST /api/assist` | `requested:"subheadline"` | 로컬 모델 경로: `subtitle_items` 또는 `subtitle` · OpenAI 경로: `subtitle_candidates` |
| `POST /api/assist` | `{kind:"flow", body}` | `{paragraphs:[핵심문장 3~5개], advice:""}` |
| `POST /api/assist` | `{kind:"photo_keywords", body}` | `{keywords:[영어 검색어 3개]}` |
| `GET /api/unsplash/search?q={검색어}&page=1` | 검색어·페이지 | `{photos, page, totalPages, total}` (photos = Unsplash 결과 구조) |
| `GET /api/unsplash/photo/{id}` | Unsplash 사진ID | 사진 바이너리 + 이미지 Content-Type (**JSON 응답 아님**) |
| `GET /api/unsplash/photo/{id}/track` | 사진ID | `{tracked:true}` |

- `fileName`/`folder` 는 로컬 구현 정보 → 팀 저장 방식에 맞춰 정리 가능.
- 오류: 적절한 실패 상태 코드 + `{error:"사용자가 이해할 안내"}`.
- 생성 결과는 **JSON으로 주고받고**, 모델 원문 출력·API 오류 페이지를 그대로 화면에 전달하지 않는다.

## 5. 현재 구현 vs 팀 작업

| 영역 | 현재 상태 | 팀에서 할 작업 |
|---|---|---|
| 작성 화면 | 제목·부제·본문·사진 편집 구현 | 팀 화면에서 원고 열기·변경 전달 |
| 제목·부제 AI | KeT5·KoBART + OpenAI 경로 구현 | 모델 설치·활성화·서버 실행 확인 |
| 요약 | OpenAI 또는 KoBART + OpenAI | 사용할 경로 설정 |
| Unsplash | 검색·페이지 탐색·선택·원본·다운로드 추적 | 서버 키와 API 주소 연결 |
| 원고 저장 | 로컬 JSON + 브라우저 임시 저장 | 팀 DB·Storage 저장으로 연결(또는 로컬 정책 유지) |
| 기사 목록·조회 | **미구현** | 목록/조회 API와 권한 구현 |
| 카드뉴스 전달 | 원고 데이터를 전달할 수 있음 | 전달 규격과 작업 요청 연결 |
| 회원·로그인·권한 | **미구현** | 팀 인증에 연결 |
| 오류 로그 | 사용자 오류 안내, 일부 개발 기록 | 서버 자동 로그·요청 추적 보완 |

## 6. 주의 / 합의 사항

- 사진 설명은 현재 **직접 입력**한다.
- **이미지 생성은 현재 UI 기능이 아니며**, 서버에 남은 과거 이미지 생성·설명 API까지 통합 필수 기능으로 취급할 필요는 없다. (제거하려면 담당자와 별도 합의)
- 제목·부제·본문 값은 **서식을 포함한 HTML**이다.

---

## 7. 코어(App Core) 관점 메모

- 위 API 계약은 현재 `app/core` 의 엔드포인트(`app/core/api.py`, `app/core/ai/router.py`, `app/core/integrations/unsplash.py`, `app/core/storage.py`)와 **일치**한다 → 프론트·백엔드 변경 없이 그대로 연결 가능.
- 남은 갭(팀 작업에 해당):
  - **기사 목록/조회 API** (미구현)
  - **인증/권한** (미구현)
  - **팀 DB/Storage 저장** (현재는 로컬 JSON: `app/core/storage.py`)
  - 서버 자동 로그/요청 추적
- 키 소유권: Unsplash Access Key·OpenAI Key는 현재 서버(`app/core/ai/client.py`, `app/core/integrations/unsplash.py`)에 위치 → 추후 백엔드 프록시로 교체 예정.

## 8. 백엔드 프록시 연결 (구현됨 — `AI_BACKEND=remote`)

배포본은 **앱에 운영키가 없고**, 모든 외부 호출이 우리 백엔드를 지난다.

```env
# .env (워크스페이스 최상단, gitignore)
AI_BACKEND=remote
AI_BACKEND_URL=https://<백엔드 주소>
APP_TOKEN=<사용자 JWT>        # 세션 관리가 붙기 전까지 임시 주입(개발·시험용)
```

백엔드가 제공해야 하는 경로(응답 모양은 원 서비스와 동일하게):

| 메서드 | 경로 | 대응 | 비고 |
|---|---|---|---|
| POST | `/ai/responses` | OpenAI Responses API | 본문: 모델·instructions·input·text.format (코어가 만든 payload 그대로) |
| POST | `/ai/images/generations` | OpenAI 이미지 생성 | 본문 그대로, 응답 `data[0].b64_json` |
| GET | `/unsplash/search/photos?query=&per_page=&page=` | Unsplash 검색 | 응답 `results/total/total_pages` |
| GET | `/unsplash/photos/<id>` | Unsplash 사진 조회 | 응답 `links.download_location` 포함 |
| GET | `/unsplash/download/<...>` 또는 `/unsplash/absolute?url=` | 다운로드 추적 | 호출만 하면 됨 |
| GET | `/unsplash/absolute?url=<절대URL>` | 절대 URL 중계 | 백엔드가 host 검증(api.unsplash.com만) |

## 9. Render(백엔드) · Supabase(DB/Auth) 연결 설정 (구현됨)

`.env`(워크스페이스 최상단)에 아래를 채우면 코어가 자동으로 잡는다.

```env
# 우리 백엔드 (Render)
AI_BACKEND=remote
AI_BACKEND_URL=https://<render 서비스 주소>
APP_TOKEN=                # 세션(로그인)이 붙기 전 임시 주입(선택 — 로그인 토큰이 우선)

# Supabase (Auth / Postgres)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon(publishable) 키>   # 공개 전제. service_role 키는 앱에 금지(백엔드 전용)
```

연결 진단:

```
python dev/checks/backend_check.py
```

- 설정 여부(값은 출력하지 않음) · Supabase `/auth/v1/health` · 백엔드 `/ai/health`(없으면 `/api/health` → `/health`)
- `SUPABASE_CHECK_EMAIL` / `SUPABASE_CHECK_PASSWORD` 를 넣으면 **실제 로그인까지** 시험한다
- `--url https://<주소>` 로 .env 를 고치지 않고 임시로 찍어볼 수 있고, `--strict` 는 계약 미구현을 실패로 처리한다(CI용)

**현재 상태(2026-10-02):** Render 서비스는 `beang66/ai-newsroom-os` @ **`main`** = 기존 웹앱(Express, `yarn build` + `node dist/server.cjs`)이라
`/api/health` 만 있습니다. 진단 결과는 `PASS 백엔드 /api/health 도달함(웹앱형 Express, status=ok) - /ai/* 는 아직 없음` 이며,
계약 경로가 하나도 없어 원격 AI·사진은 아직 동작하지 않습니다. 전면수정 범위와 계약 전체는 **`docs/BACKEND_CONTRACT.md`** 참고.

## 9-1. 배포 완료 — 우리 프록시로 전환 (2026-10-02)

기존 Render 서비스를 **우리 프록시(Python)** 로 전환해 배포했다.

- 주소: `https://ai-newsroom-os-x7mb.onrender.com` (Source `37501c3`, Runtime=Python, rootDir=`backend`)
- 확인 결과: `/ai/health` **200** (`service=ainewsroom-proxy authRequired=True`),
  `/ai/responses`·`/unsplash/*` 는 토큰 없이 **401**(경로 존재), 진단 `backend_check.py` **3/3 PASS**
- 앱 기본값(`app/core/defaults.py`)에 주소를 심어 **`.env` 없이 remote 로 동작**한다(`AI_BACKEND` 기본이 remote)
- 남은 것: Render **Environment** 에 `OPENAI_API_KEY`·`UNSPLASH_ACCESS_KEY` 등록
  (지금은 `/ai/health` 가 `openai=false unsplash=false` → 실제 AI·사진 호출은 아직 실패한다)
- 부수 수정: 401/404 로 조기 응답할 때 연결을 닫도록(`Connection: close`) 고쳤다.
  읽지 않은 요청 본문이 남아 다음 요청으로 파싱되면서 **간헐적 501/400** 이 나던 문제
  (`backend/server.py` + `backend/test_server.py` 회귀 테스트 2개).

로그인·세션 계약 — 코어가 토큰을 보관하고, 프론트는 상태만 본다(토큰은 절대 넘기지 않는다):

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/session` | `{signedIn, email, userId, expiresIn, supabase, backend}` — **토큰 없음** |
| POST | `/api/session` | `{email, password}` → Supabase Auth 로그인 → 위와 같은 상태 |
| POST | `/api/session/signout` | 로그아웃(토큰 폐기) |

- 로그인 후 코어는 백엔드 호출에 `Authorization: Bearer <사용자 JWT>` 를 붙인다(`APP_TOKEN` 보다 우선).
- 만료 60초 전부터 refresh token 으로 자동 갱신한다.
- 토큰은 **메모리에만** 둔다(재시작하면 재로그인). 디스크 저장은 보안 P1('앱 잠금')과 함께 결정한다.
## 10. 참조 구현 — `backend/` (Render 배포용 프록시)

우리 백엔드가 아직 없다면 **`backend/`를 그대로 Render에 올리면 이 계약을 충족**한다(의존성 0).

| 파일 | 역할 |
|---|---|
| `backend/server.py` | `/ai/health`, `/ai/responses`, `/ai/images/generations`, `/unsplash/*` 중계 + Supabase JWT 검증 + 사용자별 분당 제한 + 무저장 로그 |
| `backend/test_server.py` | 스텁 업스트림으로 계약 테스트 8개 (`python backend/test_server.py`) |
| `backend/render.yaml` | Render Blueprint(환경변수 **이름만**; 값은 대시보드에서) |
| `backend/README.md` | 배포·환경변수·로컬 시험 절차 |

배포: Render → **New → Web Service → Root Directory `backend` → Start `python server.py`**,
환경변수 `OPENAI_API_KEY` · `UNSPLASH_ACCESS_KEY` · `SUPABASE_URL` · `SUPABASE_ANON_KEY`.

검증 기록: `backend/test_server.py` **8/8 OK**, 그리고 앱까지 포함한 종단(코어 → 프록시 → 스텁 업스트림)으로
`/api/assist` · `/api/unsplash/search` 가 왕복함을 확인(3/3 PASS, 실제 키 없이).
