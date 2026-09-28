"""Load only supported local settings; process env always takes precedence."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL_KEYS = {'OPENAI_API_KEY', 'OPENAI_MODEL', 'PORT'}


def load_local_env():
    path = ROOT / '.env'
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key, value = key.strip(), value.strip()
        if key not in LOCAL_KEYS:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        if value:
            os.environ.setdefault(key, value)
