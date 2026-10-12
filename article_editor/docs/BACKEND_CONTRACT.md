# 백엔드 계약 (로컬 앱 전환 후) — 전면수정 지침

- 상태: **2026-10-02 초안 · 백엔드 전면수정 대기**
- 현재 배포: Render `beang66/ai-newsroom-os` @ **`main`** = 기존 **웹앱(Express + vite + Gemini)**
  → 앱이 필요로 하는 계약 경로(`/ai/*`)가 **하나도 없음** (`/api/health` 만 존재)
- 앱 쪽 구현(이미 완료): `app/core/backend_proxy.py`(호출) · `app/core/ai/providers/backend.py` · `docs/BACKEND_INTEGRATION.md`
- 전면수정 전 임시 브리지: `backend/express/ai-proxy.ts` (Express에 3줄 추가로 붙임)

## 1. 역할이 어떻게 바뀌나

| | 예전(웹 서비스) | 지금(로컬 데스크톱 앱) |
|---|---|---|
| 프론트 제공 | Express가 `vite build` 결과 + SPA를 서빙 | **불필요** — 화면은 앱에 내장(pywebview) |
| AI 호출 | 브라우저 → `/api/ai/*`(Gemini 직접) | **앱 코어 → `/ai/*` (운영키 보관 + 중계)** |
| 인증 | 없음(공개 웹) | **Supabase JWT 검증 필수** |
| 사진 | 없음 | `/unsplash/*` 중계(키 보관) |
| 모델 파일 | 없음 | **2.18 GB 모델 팩 호스팅(Range 필요)** |
| 데이터 | 없음 | Supabase 직접(anon + JWT) — 백엔드는 필요할 때만 |

**지울 것**: `vite`·`express.static`·SPA catch-all, Gemini 웹 UI용 `/api/ai/review|transform|ask`
(로컬 앱은 코어 파이프라인이 처리), `const PORT = 3000` 하드코딩.
**남길 것**: `/api/health`(모니터링 호환) + 아래 계약 경로 추가.

## 2. 필수 계약 — 앱이 이미 이 모양으로 호출한다

인증: `Authorization: Bearer <Supabase JWT>` → 백엔드가 Supabase `/auth/v1/user` 로 검증(실패 401).
사용자별 레이트리밋 권장(기본 120/분, 초과 429).

| 메서드 | 경로 | 하는 일 | 비고 |
|---|---|---|---|
| GET | `/ai/health` | 200 `{ok:true,...}` | 인증 불필요(진단용) |
| POST | `/ai/responses` | OpenAI Responses API **그대로 중계** | 본문·응답 모양 유지 |
| POST | `/ai/images/generations` | 이미지 생성 중계 | 응답 그대로 |
| GET | `/unsplash/search/photos` | 사진 검색 | 쿼리 그대로 전달 |
| GET | `/unsplash/photos/<id>` | 사진 단건 | |
| GET | `/unsplash/download/<...>` | 다운로드 추적 | |
| GET | `/unsplash/absolute?url=` | 절대 URL 중계 | host 가 `api.unsplash.com` 일 때만(SSRF 방지) |

- 앱은 응답을 **파싱해 변환하지 않습니다.** 백엔드가 원본 모양을 유지해야 합니다.
- Gemini 밖에 없을 때: 응답을 `{output:[{content:[{type:"output_text",text:"<JSON>"}]}]}` 로 감싸면 코어가 그대로 파싱합니다.
- 상태코드는 그대로 내려주세요(앱이 매핑): 401 로그인 필요 · 404 미구현 · 429 한도 · 504 연결 실패.

## 3. 모델 팩 호스팅 — 로컬 앱 전환의 핵심 추가

- 앱은 `<설치 폴더>/models/` 로 2.18 GB 를 내려받습니다(자세히: `docs/LOCAL_MODELS.md`).
- 백엔드에 필요한 것: **정적 파일 제공 + `Range` 지원 + SHA-256 으로 검증 가능한 URL**.
- Render 는 디스크가 휘발성이라 부적합 → HF repo / S3·R2 / 사내 서버 권장.
  매니페스트(`app/models_manifest.json`)의 `base` 한 줄만 채우면 자동 다운로드가 켜집니다.
- (선택) `GET /models/manifest.json` 로 매니페스트를 서빙하면 나중에 앱이 원격에서 갱신할 수 있습니다(현재는 앱에 동봉).

## 4. 접속·운영 체크리스트

- `process.env.PORT` 로 바인딩(`0.0.0.0`). 현재 `const PORT = 3000` 하드코딩 → 수정 필요.
- **전역 `express.json()` 앞에** 프록시 라우터를 두거나 전역 limit 을 40mb 로.
  (현재 `app.use(express.json())` 는 기본 **100kb** → 사진 요청이 413)
- Render 환경변수: `OPENAI_API_KEY` · `UNSPLASH_ACCESS_KEY` · `SUPABASE_URL` · `SUPABASE_ANON_KEY` ·
  `AUTH_REQUIRED=true` · (선택) `RATE_LIMIT_PER_MIN`
- 로그에 **본문·토큰을 남기지 않습니다**(개인정보·비밀).

## 5. 확인 방법

```
python dev/checks/backend_check.py --url https://<서비스>.onrender.com

# 백엔드 수정 후 기대:
#   PASS  백엔드 /ai/health  계약(/ai/*) 준비됨 - 앱이 바로 사용할 수 있습니다
#   PASS  앱 클라이언트 경로  코어(backend_proxy)가 같은 주소를 정상 호출
#
# 현재(Render main):
#   PASS  백엔드 /api/health  도달함(웹앱형 Express, status=ok) - /ai/* 는 아직 없음
#   백엔드 계약(/ai/*) : 아직 없음 - 백엔드 전면수정 전까지 원격 AI·사진은 동작하지 않습니다.
```

## 6. 백엔드 수정 후 앱 쪽 설정

`.env` 에 `AI_BACKEND=remote` + `AI_BACKEND_URL=https://<서비스>.onrender.com`
→ 그때부터 코어가 **운영키 없이** 동작합니다(앱에 키를 두지 않는 규칙, `docs/SECURITY_MODEL.md`).
