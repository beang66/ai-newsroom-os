import os, pathlib, sys, threading

_APP_DIR = pathlib.Path(__file__).resolve().parent.parent
if not getattr(sys, 'frozen', False) and str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

# 실행 위치는 app_paths.py 한 곳에서만 판단한다(개발/배포 exe 동일 규칙).
from app_paths import APP_ROOT, FRONTEND, env_lines  # noqa: E402

# ROOT = 앱 폴더(개발: article_editor/, 배포 exe: exe가 놓인 폴더).
ROOT = APP_ROOT

# Shared .env chain. 모든 키의 단일 원본은 워크스페이스 최상단(appCoreTest/.env).
# 가까운 파일이 우선하고, 실제 OS 환경변수는 어떤 .env보다 우선한다(setdefault).
for line in env_lines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
PORT = int(os.environ.get('PORT', '8765'))
PIPELINE_VERSION = '2026-10-01-subtitle-fast-v4'
TEXT_MODEL = os.environ.get('OPENAI_TEXT_MODEL', 'gpt-4.1-mini')
IMAGE_MODEL = os.environ.get('OPENAI_IMAGE_MODEL', 'gpt-image-1')
# 외부 호출 경로. local = 로컬 .env 키로 외부 API 직접(개발 전용), remote = 우리 백엔드 프록시.
# 배포본(exe)은 remote 가 기본이다 — 앱에 운영키를 두지 않는다(ARCHITECTURE.md).
_DEFAULT_AI_BACKEND = 'remote' if getattr(sys, 'frozen', False) else 'local'
AI_BACKEND = os.environ.get('AI_BACKEND', _DEFAULT_AI_BACKEND).strip().lower()
AI_BACKEND_URL = (os.environ.get('AI_BACKEND_URL') or '').rstrip('/')
# 사용자 토큰(JWT) 자리 — 세션 관리가 붙기 전까지 환경변수로 주입한다.
APP_TOKEN = os.environ.get('APP_TOKEN', '')
LIMIT = threading.BoundedSemaphore(3)
HEADLINE_MODEL = os.environ.get('HEADLINE_MODEL', 'onebeans/keT5-news-title-gen')
SUBTITLE_MODEL = os.environ.get('SUBTITLE_MODEL', 'gogamza/kobart-summarization')
HEADLINE_CACHE = os.environ.get('HEADLINE_CACHE_DIR') or None
HEADLINE_LOCK = threading.Lock()
SUBTITLE_LOCK = threading.Lock()
