import os, pathlib, sys, threading

_APP_DIR = pathlib.Path(__file__).resolve().parent.parent
if not getattr(sys, 'frozen', False) and str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

# 실행 위치는 app_paths.py 한 곳에서만 판단한다(개발/배포 exe 동일 규칙).
from app_paths import APP_DATA, APP_ROOT, BUNDLE, FRONTEND, env_lines  # noqa: E402

# 공개 기본값(커밋됨) — 새 PC·배포본에서 .env 없이 동작하게 한다. .env/OS 환경변수가 우선.
from . import defaults  # noqa: E402

# ROOT = 앱 폴더(개발: article_editor/, 배포 exe: exe가 놓인 폴더).
ROOT = APP_ROOT

# Shared .env chain. 모든 키의 단일 원본은 워크스페이스 최상단(appCoreTest/.env).
# 가까운 파일이 우선하고, 실제 OS 환경변수는 어떤 .env보다 우선한다(setdefault).
for line in env_lines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
PORT = int(os.environ.get('PORT', '8765'))
PIPELINE_VERSION = '2026-10-06-subtitle-final-polish-v9'  # su4228 v30 (부제 핵심 사실 확인 + 최종 교열)
SUMMARY_PIPELINE_VERSION = '2026-10-06-summary-records-v1'
TEXT_MODEL = os.environ.get('OPENAI_TEXT_MODEL', 'gpt-4.1-mini')
IMAGE_MODEL = os.environ.get('OPENAI_IMAGE_MODEL', 'gpt-image-1')
# 외부 호출 경로. local = 로컬 .env 키로 외부 API 직접(개발 전용), remote = 우리 백엔드 프록시.
# 배포본(exe)이거나 백엔드 주소가 있으면 remote 가 기본이다 — 앱에 운영키를 두지 않는다(ARCHITECTURE.md).
AI_BACKEND_URL = (os.environ.get('AI_BACKEND_URL') or defaults.AI_BACKEND_URL or '').rstrip('/')
_DEFAULT_AI_BACKEND = 'remote' if (getattr(sys, 'frozen', False) or AI_BACKEND_URL) else 'local'
AI_BACKEND = os.environ.get('AI_BACKEND', _DEFAULT_AI_BACKEND).strip().lower()
# 사용자 토큰(JWT) 자리 — 세션 관리가 붙기 전까지 환경변수로 주입한다.
APP_TOKEN = os.environ.get('APP_TOKEN', '')
# 공용 테스트 계정 자동 로그인(개발 실행 전용, 배포본 무시) — 계정은 Supabase 에 만들고 이메일·비밀번호는 각자 .env 에만 둔다
TEST_ACCOUNT_EMAIL = os.environ.get('TEST_ACCOUNT_EMAIL', '').strip()
TEST_ACCOUNT_PASSWORD = os.environ.get('TEST_ACCOUNT_PASSWORD', '')
AUTO_LOGIN_DEFAULT = os.environ.get('AUTO_LOGIN', 'true').strip().lower() not in ('0', 'false', 'no', 'off')
# Supabase(Control Plane: Auth / Postgres / Storage) — 앱은 anon 키 + 사용자 JWT로 직접 접근한다.
# service_role 키는 절대 앱에 두지 않는다(백엔드 전용, ARCHITECTURE.md).
SUPABASE_URL = (os.environ.get('SUPABASE_URL') or defaults.SUPABASE_URL or '').rstrip('/')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY') or defaults.SUPABASE_ANON_KEY
# 로컬 모델 — 배포본은 동봉하지 않고 첫 사용 때 내려받는다(docs/LOCAL_MODELS.md 설계 B).
# 매니페스트는 앱에 동봉(읽기 전용), 실제 파일은 %LOCALAPPDATA%\AI Newsroom\models 에 쌓인다(2026-10-06, app_paths).


def _models_dir():
    """예전 위치(APP_ROOT/models)가 있으면 새 위치로 폴더째 옮긴다(같은 드라이브면 즉시).
    옮기지 못하면(다른 드라이브·사용 중) 예전 위치를 그대로 쓴다 — 수 GB 를 복사하지 않는다."""
    new, old = APP_DATA / 'models', APP_ROOT / 'models'
    if old.is_dir() and not new.exists():
        try:
            new.parent.mkdir(parents=True, exist_ok=True)
            old.rename(new)
        except OSError:
            return old
    return new


MODELS_DIR = pathlib.Path(os.environ.get('MODELS_DIR') or _models_dir())
MODELS_MANIFEST = pathlib.Path(
    os.environ.get('MODELS_MANIFEST') or (BUNDLE / 'models_manifest.json')
)
# 허깅페이스 캐시도 모델 폴더 안에 둔다(제목·부제 모델이 사용자 프로필로 새지 않게).
# .env 로 HF_HOME 을 주면 그쪽이 우선한다(디스크가 좁을 때).
HF_HOME = os.environ.setdefault('HF_HOME', str(MODELS_DIR / 'hf'))
LIMIT = threading.BoundedSemaphore(3)
# 진단 출력이 인코딩 때문에 죽지 않게 한다(cp949 콘솔에서 em dash 등은 표현 불가).
# 창 모드(exe)에서는 stdout 이 None 일 수 있다.
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, 'reconfigure'):
        try:
            _stream.reconfigure(errors='replace')
        except (ValueError, OSError):
            pass
HEADLINE_MODEL = os.environ.get('HEADLINE_MODEL', 'onebeans/keT5-news-title-gen')
SUBTITLE_MODEL = os.environ.get('SUBTITLE_MODEL', 'gogamza/kobart-summarization')
HEADLINE_LOCK = threading.Lock()
SUBTITLE_LOCK = threading.Lock()
