"""실행 위치 해석 — 개발 실행과 배포(exe) 실행을 같은 코드로 다룬다.

뿌리를 두 개로 나눈다.

- ``BUNDLE``   읽기 전용 리소스(``frontend/``). 개발에서는 ``article_editor/``,
               PyInstaller 배포본에서는 번들 내부(``_internal/``)다.
- ``APP_ROOT`` 쓰기 가능한 앱 폴더. ``.env``와 ``.article-workspace/``가 여기 산다.
               개발에서는 ``article_editor/``, 배포본에서는 **exe가 놓인 폴더**다.

그래서 배포본은 포터블하다. 폴더를 통째로 옮겨도 ``.env``·임시저장·로그가 따라온다.
"""
from __future__ import annotations

import sys
from pathlib import Path

FROZEN = bool(getattr(sys, 'frozen', False))

if FROZEN:
    BUNDLE = Path(getattr(sys, '_MEIPASS', Path(sys.executable).resolve().parent))
    APP_ROOT = Path(sys.executable).resolve().parent
else:
    BUNDLE = Path(__file__).resolve().parent
    APP_ROOT = BUNDLE

FRONTEND = BUNDLE / 'frontend'
WORKSPACE = APP_ROOT / '.article-workspace'

# .env 탐색 순서: 가까운 폴더가 우선. 실제 OS 환경변수는 어떤 .env보다 우선한다(setdefault).
ENV_DIRS = [APP_ROOT, *list(APP_ROOT.parents)[:3]]


def env_lines():
    """``.env`` 파일들을 가까운 순서대로 읽어 줄 단위로 돌려준다."""
    for folder in ENV_DIRS:
        path = folder / '.env'
        if path.is_file():
            yield from path.read_text(encoding='utf-8-sig').splitlines()
