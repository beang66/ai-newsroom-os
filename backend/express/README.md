# 기존 Express(Render) 서버에 붙이기 — `ai-proxy.ts`

이미 돌리는 Render 서비스가 **Express**(`server.ts`)라면 새 서비스를 만들 필요 없이
이 파일 하나를 추가하고 라우터만 등록하면 된다. 의존성 추가 없음(Node 18+ `fetch`).

## 1. 파일 복사

```
backend/express/ai-proxy.ts  →  <원본 저장소>/backend/express/ai-proxy.ts   (경로는 자유)
```

## 2. `server.ts` 에 3줄

```ts
import { createAiProxyRouter } from "./backend/express/ai-proxy";

app.use(createAiProxyRouter());   // ★ 반드시 app.use(express.json({ limit: "10mb" })) 보다 먼저!
```

> **순서가 중요합니다.** 기존 전역 `express.json({ limit: "10mb" })` 가 먼저 걸리면
> 사진이 포함된 요청(수 MB)이 413으로 막힙니다. 이 라우터는 자체 파서(40mb)를 씁니다.

## 3. Render 환경변수

| 변수 | 값 |
|---|---|
| `OPENAI_API_KEY` | OpenAI 키 |
| `UNSPLASH_ACCESS_KEY` | Unsplash Access Key |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | anon(publishable) 키 |
| `AUTH_REQUIRED` | 기본 `true` (개발 시험 때만 `false`) |
| `HOST` | **`0.0.0.0`** — 지금 `server.ts`가 `127.0.0.1` 기본이라 Render에서 외부 접속이 안 될 수 있음 |
| `RATE_LIMIT_PER_MIN` | 기본 `120` |

## 4. 추가되는 경로 (앱이 부르는 것)

| 메서드 | 경로 | 중계 |
|---|---|---|
| GET | `/ai/health` | 자체 응답(진단용) |
| POST | `/ai/responses` | `{OPENAI_BASE}/responses` |
| POST | `/ai/images/generations` | `{OPENAI_BASE}/images/generations` |
| POST | `/ai/audio/transcriptions` | `{OPENAI_BASE}/audio/transcriptions` (multipart 그대로) |
| GET | `/unsplash/search/photos` · `/unsplash/photos/<id>` · `/unsplash/download/<...>` | `{UNSPLASH_BASE}/...` |
| GET | `/unsplash/absolute?url=` | 절대 URL(host가 `api.unsplash.com`일 때만) |

- 인증: `Authorization: Bearer <Supabase JWT>` → Supabase `/auth/v1/user` 로 검증(401)
- 허용 경로만 중계(그 외 404), 사용자별 분당 제한(429), **본문을 로그에 남기지 않음**

## 5. 기존 Gemini 라우트와의 관계

기존 `/api/ai/*`(Gemini)는 그대로 둔다. 새 `/ai/*` 는 앱(코어)이 요구하는 **OpenAI 응답 모양**을
그대로 중계하는 경로다. Gemini로 대체하려면 응답을 `{output:[{content:[{type:"output_text",text:"<JSON>"}]}]}`
모양으로 변환해 돌려주면 코어가 그대로 파싱한다(코어 수정 불필요).

## 6. 확인

```
# 배포 전 로컬
set AUTH_REQUIRED=false
set OPENAI_BASE_URL=http://127.0.0.1:9000/v1     # 실제 키 없이 시험할 때만
npm run dev                                       # 또는 npm start

# 배포 후 앱에서
python dev\checks\backend_check.py                # AI_BACKEND_URL=<Render 주소>
```
`/ai/health` 가 200이면 연결 완료다. 앱 `.env` 는 `AI_BACKEND=remote` + `AI_BACKEND_URL=https://<service>.onrender.com`.
