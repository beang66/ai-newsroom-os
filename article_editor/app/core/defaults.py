"""앱에 심어 두는 **공개 기본값** — 새 PC·배포본에서 `.env` 없이 동작하게 한다.

여기 들어가는 값은 전부 **공개 전제**다(`ARCHITECTURE.md` 접근 경계):

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` → 앱에 포함 가능(RLS 로 보호되는 공개 키)
- `AI_BACKEND_URL` → 공개 주소

**비밀값은 여기 두지 않는다**(OpenAI · Unsplash · service_role · DB 접속 문자열) → 백엔드(Render)에만.

우선순위: `.env` / OS 환경변수 **> 이 파일**(기본값). 키를 회전(rotate)하면 이 파일도 갱신한다.
생성/갱신: `python temp/make_defaults.py`
"""

SUPABASE_URL = 'https://clivtnizzfrbtcceslem.supabase.co'
SUPABASE_ANON_KEY = 'sb_publishable_qa-3xN4O8F00SR3K45z5OQ_aRwo995v'
# 백엔드(Render) 주소 — 배포한 뒤 채우면 새 PC에서 `.env` 없이 remote 로 동작한다.
AI_BACKEND_URL = 'https://ai-newsroom-os-x7mb.onrender.com'
