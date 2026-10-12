"""실행 위치 해석 — 개발 실행과 배포(exe) 실행을 같은 코드로 다룬다.

읽기 전용 코드·리소스와 쓰기 데이터를 나눈다(2026-10-06 — 보통의 Windows 앱 방식).

- ``BUNDLE``    읽기 전용 리소스(``frontend/``). 개발에서는 ``app/``, 배포본에서는 번들 내부(``_internal/``).
- ``APP_ROOT``  코드가 놓인 폴더(개발: ``article_editor/``, 배포본: exe 폴더). ``.env`` 를 찾는 시작점일 뿐 데이터는 두지 않는다.
- ``DOCUMENTS`` 사용자가 만든 것 — 기사·취재자료 원본. ``내 문서\\AI Newsroom`` (OneDrive 로 옮긴 내 문서도 따라간다).
- ``APP_DATA``  사용자가 볼 필요 없는 것 — 로그·캐시·모델·웹뷰. ``%LOCALAPPDATA%\\AI Newsroom``.

개발과 배포본이 같은 위치를 쓴다("개발에선 되는데 배포본에선 안 됨" 방지).
테스트·다른 위치가 필요하면 OS 환경변수 ``AI_NEWSROOM_DOCUMENTS`` / ``AI_NEWSROOM_APPDATA`` 로 바꾼다
(``.env`` 보다 먼저 정해지므로 ``.env`` 로는 바꿀 수 없다).
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

FROZEN = bool(getattr(sys, 'frozen', False))
APP_NAME = 'AI Newsroom'

if FROZEN:
    BUNDLE = Path(getattr(sys, '_MEIPASS', Path(sys.executable).resolve().parent))
    APP_ROOT = Path(sys.executable).resolve().parent
else:
    BUNDLE = Path(__file__).resolve().parent  # app/ (실행 코드)
    APP_ROOT = BUNDLE.parent  # 프로젝트 루트

FRONTEND = BUNDLE / 'frontend'


def _documents_folder() -> Path:
    """Windows 의 실제 '내 문서' 위치(OneDrive 리디렉션 포함). 다른 OS 는 ~/Documents."""
    if os.name == 'nt':
        import ctypes
        import uuid
        from ctypes import wintypes

        class GUID(ctypes.Structure):
            _fields_ = [('Data1', wintypes.DWORD), ('Data2', wintypes.WORD), ('Data3', wintypes.WORD),
                        ('Data4', ctypes.c_ubyte * 8)]

        raw = uuid.UUID('{FDD39AD0-238F-46AF-ADB4-6C85480369C7}').bytes_le  # FOLDERID_Documents
        guid = GUID.from_buffer_copy(raw)
        out = ctypes.c_wchar_p()
        if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(out)) == 0:
            try:
                return Path(out.value)
            finally:
                ctypes.windll.ole32.CoTaskMemFree(out)
    return Path.home() / 'Documents'


DOCUMENTS = Path(os.environ.get('AI_NEWSROOM_DOCUMENTS') or _documents_folder() / APP_NAME)
APP_DATA = Path(os.environ.get('AI_NEWSROOM_APPDATA')
                or Path(os.environ.get('LOCALAPPDATA') or Path.home() / '.local' / 'share') / APP_NAME)
ARTICLES_DIR = DOCUMENTS / 'articles'
SOURCES_DIR = DOCUMENTS / 'sources'
DB_PATH = Path(os.environ.get('AI_NEWSROOM_VAULT') or APP_DATA / 'vault.db')  # 원고·취재자료 암호화 저장소(core/vault.py). 동기화되는 내 문서가 아니라 APP_DATA 에 둔다
WORKSPACE = APP_DATA  # 로그·캐시·웹뷰(옛 이름 유지 — 예전 .article-workspace 자리)

# .env 탐색 순서: 가까운 폴더가 우선. APP_DATA 는 설치본에서 키를 두는 자리. OS 환경변수가 항상 우선(setdefault).
ENV_DIRS = [APP_DATA, APP_ROOT, *list(APP_ROOT.parents)[:3]]


def env_lines():
    """``.env`` 파일들을 가까운 순서대로 읽어 줄 단위로 돌려준다."""
    if os.environ.get('AI_NEWSROOM_SKIP_DOTENV') == '1':  # 테스트: 개발자의 실제 키·테스트 계정을 읽지 않는다
        return
    for folder in ENV_DIRS:
        path = folder / '.env'
        if path.is_file():
            yield from path.read_text(encoding='utf-8-sig').splitlines()


def _move_files(src: Path, dst: Path) -> list[str]:
    """src 안 파일을 dst 로 옮긴다. 이미 있는 파일은 덮어쓰지 않고, 옮기지 못한 파일(사용 중 등)은 남긴다."""
    left = []
    for path in sorted(src.rglob('*')):
        if not path.is_file():
            continue
        target = dst / path.relative_to(src)
        if target.exists():
            left.append(str(path))
            continue
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), str(target))
        except OSError:
            left.append(str(path))
    for folder in sorted((p for p in src.rglob('*') if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        try:
            folder.rmdir()  # 빈 폴더만 지워진다
        except OSError:
            pass
    try:
        src.rmdir()
    except OSError:
        pass
    return left


def migrate_legacy() -> list[str]:
    """예전 ``APP_ROOT/.article-workspace`` → 새 위치. 여러 번 불러도 안전하다. 옮기지 못한 파일 목록을 돌려준다.
    저장 위치를 환경변수로 바꾼 실행(테스트·임시 실행)에서는 옮기지 않는다 — 실제 기사가 임시 폴더로 가면 안 된다."""
    legacy = APP_ROOT / '.article-workspace'
    if not legacy.is_dir() or os.environ.get('AI_NEWSROOM_DOCUMENTS') or os.environ.get('AI_NEWSROOM_APPDATA'):
        return []
    left = []
    if (legacy / 'articles').is_dir():
        left += _move_files(legacy / 'articles', ARTICLES_DIR)
    left += _move_files(legacy, APP_DATA)
    return left
