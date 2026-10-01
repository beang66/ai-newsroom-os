"""Core bootstrap: server wiring and startup."""
import os, threading
from http.server import ThreadingHTTPServer

from .config import PORT
from .api import Handler
from .ai.local_models import load_headline_model


def warm_headline_model():
    try:
        load_headline_model()
    except Exception:
        pass


def main():
    print(f'\uae30\uc0ac \uc791\uc5c5\uc2e4: http://127.0.0.1:{PORT}\n\uc885\ub8cc: Ctrl+C')
    if os.environ.get('USE_LOCAL_MODELS', 'false').lower() == 'true':
        threading.Thread(target=warm_headline_model, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()