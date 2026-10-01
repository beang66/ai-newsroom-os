import os, pathlib, threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Frontend static assets are separated from the core (served read-only by the API layer).
FRONTEND = ROOT / 'frontend'
for line in (ROOT / '.env').read_text(encoding='utf-8-sig').splitlines() if (ROOT / '.env').exists() else []:
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
