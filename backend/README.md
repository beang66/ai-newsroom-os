# 우리 백엔드(Render) 프록시 — AI·사진 중계

앱(데스크톱 코어)은 **운영키를 갖지 않는다**(`ARCHITECTURE.md` 하드 규칙).
이 서비스가 키를 보관하고 대신 호출하며, 앱이 보낸 **사용자 JWT**를 Supabase로 검증한다.

> **이미 Express(Render) 서비스를 쓰고 있다면 새로 만들 필요가 없다** — `express/README.md`의
> 드롭인 라우터(`express/ai-proxy.ts`)를 `server.ts`에 3줄로 붙이면 끝난다. 아래는 별도 서비스로
> 분리하고 싶을 때의 구성이다.

```
앱(코어) ──Bearer <사용자 JWT>──▶ 이 서비스(Render) ──운영키──▶ OpenAI / Unsplash
                                      └─ Supabase /auth/v1/user 로 JWT 검증
```

- **표준 라이브러리만** 사용한다(의존성 0, 빌드 단계 없음).
- **무저장**: 본문을 로그·디스크에 남기지 않는다(경로·상태만).
- 사용자별 분당 호출 제한(기본 120)을 메모리에서 센다.

## Render 배포

1. Render → **New → Web Service** → 이 저장소 연결
   - **Branch: `feature/app-core`** ← `main` 에는 이 `backend/` 폴더가 없어서 배포가 실패한다
   - **Root Directory: `backend`**
2. Runtime: **Python**, Build Command: **`pip install -r requirements.txt`**, Start Command: **`python server.py`**
   - ⚠️ Render 대시보드는 **빈 Build Command 를 저장하지 않는다**("Cannot be blank"). 의존성이 0이어도 위 명령을 넣으면 된다(주석뿐이라 즉시 끝난다).
   - `PORT` 는 Render 가 주입하고 `HOST` 기본값이 `0.0.0.0` 이라 그대로 뜬다(코드 수정 불필요)
3. 환경변수(대시보드에서 입력 — **값을 저장소에 넣지 않는다**)

| 변수 | 필수 | 값 |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI 키 |
| `UNSPLASH_ACCESS_KEY` | 사진 검색 | Unsplash Access Key |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | 임베딩 | Cloudflare 계정 id, Workers AI 토큰 |
| `SUPABASE_URL` | JWT 검증 | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | JWT 검증 | anon(publishable) 키 |
| `AUTH_REQUIRED` | | 기본 `true`. `false`는 개발 전용(토큰 없이 허용) |
| `RATE_LIMIT_PER_MIN` | | 기본 `120` |
| `OPENAI_BASE_URL` / `UNSPLASH_BASE_URL` | | 시험용 대체 주소(기본은 실제 서비스) |

또는 `render.yaml`(Blueprint)로 한 번에 만들 수 있다 — 비밀값은 `sync: false`라 대시보드에서 채운다.

## 앱 쪽 설정

```env
AI_BACKEND=remote
AI_BACKEND_URL=https://<render 서비스 주소>
```
확인: `python dev/checks/backend_check.py` → `백엔드 /ai/health` PASS

## 경로 계약(앱이 부르는 것)

| 메서드 | 경로 | 중계 대상 |
|---|---|---|
| GET | `/ai/health` | (자체 응답) 준비 상태 |
| POST | `/ai/responses` | `{OPENAI_BASE}/responses` |
| POST | `/ai/images/generations` | `{OPENAI_BASE}/images/generations` |
| POST | `/ai/embeddings` | Cloudflare Workers AI `@cf/qwen/qwen3-embedding-0.6b` (모델은 서버 고정; 본문 그대로 중계) |
| POST | `/ai/audio/transcriptions` | `{OPENAI_BASE}/audio/transcriptions` (multipart 그대로) |
| GET | `/unsplash/search/photos` | `{UNSPLASH_BASE}/search/photos` |
| GET | `/unsplash/photos/<id>` | `{UNSPLASH_BASE}/photos/<id>` |
| GET | `/unsplash/download/<...>` | `{UNSPLASH_BASE}/download/<...>` |
| GET | `/unsplash/absolute?url=` | 절대 URL(host가 `api.unsplash.com`일 때만) |

허용 경로만 중계하고 나머지는 404, 인증 실패는 401, 한도 초과는 429로 답한다.
업스트림 응답(본문·상태)은 **그대로** 돌려주므로 코어의 오류 문구 매핑이 그대로 동작한다.

## 로컬 시험

```
# 실제 키 없이 시험하려면 업스트림을 바꿔 끼운다
set AUTH_REQUIRED=false
set OPENAI_BASE_URL=http://127.0.0.1:9000/v1
python backend/server.py

# 계약 테스트(스텁 업스트림 내장)
python -m unittest backend/test_server.py
```

## 보안 메모

- `service_role`·DB 접속 문자열(`postgresql://…`)은 **여기(서버)에만** 둔다. 앱에 넣지 않는다.
- JWT는 요청마다 Supabase에 검증을 요청한다(무상태). 캐시가 필요해지면 짧은 TTL로 추가한다.
- 로그에 본문·토큰을 남기지 않는다(개인정보·원고 보호).
