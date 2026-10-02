import os, pathlib, threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Frontend static assets are separated from the core (served read-only by the API layer).
FRONTEND = ROOT / 'frontend'

# Shared .env chain. 모든 키의 단일 원본은 워크스페이스 최상단(appCoreTest/.env).
# 가까운 파일이 우선하고, 실제 OS 환경변수는 어떤 .env보다 우선한다(setdefault).
def env_lines():
    for folder in [ROOT, *list(ROOT.parents)[:3]]:
        path = folder / '.env'
        if path.is_file():
            yield from path.read_text(encoding='utf-8-sig').splitlines()


for line in env_lines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
PORT = int(os.environ.get('PORT', '8765'))
PIPELINE_VERSION = '2026-10-01-subtitle-fast-v4'
TEXT_MODEL = os.environ.get('OPENAI_TEXT_MODEL', 'gpt-4.1-mini')
IMAGE_MODEL = os.environ.get('OPENAI_IMAGE_MODEL', 'gpt-image-1')
LIMIT = threading.BoundedSemaphore(3)
HEADLINE_MODEL = os.environ.get('HEADLINE_MODEL', 'onebeans/keT5-news-title-gen')
SUBTITLE_MODEL = os.environ.get('SUBTITLE_MODEL', 'gogamza/kobart-summarization')
HEADLINE_CACHE = os.environ.get('HEADLINE_CACHE_DIR') or None
HEADLINE_LOCK = threading.Lock()
SUBTITLE_LOCK = threading.Lock()
