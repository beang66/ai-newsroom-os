"""데스크톱 셸(pywebview) — 기존 로컬 코어를 네이티브 창에 띄운다.

브라우저를 대체하는 것은 '창'뿐이다. 화면과 로직은 지금 그대로 frontend/ 의
JS가 WebView2(Chromium) 안에서 실행되고, 코어와의 통신도 기존 HTTP 계약
(core/api.py)을 그대로 사용한다.

설계 근거
- APP_CORE_ARCHITECTURE.md §3: "Desktop Shell은 React를 유지할 수 있는 구조"
- ARCHITECTURE.md: web/src/api/client.js 단일 경계 (IPC 교체 지점)

주의: WebView2 사용자 데이터 폴더를 지정하지 않으면(private_mode=True 기본값)
프론트의 IndexedDB 임시 저장이 재시작 때 사라진다. storage_dir() 를 반드시 넘긴다.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent.parent  # app/ (실행 코드 루트)
if not getattr(sys, 'frozen', False) and str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from app_paths import APP_DATA  # noqa: E402

WINDOW_TITLE = 'AI Newsroom — 기사 작성'
WINDOW_SIZE = (1280, 900)
MIN_SIZE = (900, 600)
URL_PATH = '/index.html'


def storage_dir() -> Path:
    """WebView2 사용자 데이터 폴더(IndexedDB 영속용).

    기본값은 %LOCALAPPDATA%/AI Newsroom/webview(app_paths.APP_DATA).
    DESKTOP_STORAGE_DIR 환경변수로 덮어쓸 수 있다.
    """
    override = os.environ.get('DESKTOP_STORAGE_DIR')
    if override:
        return Path(override).expanduser()
    return APP_DATA / 'webview'


def shell_available() -> bool:
    """pywebview 가 설치되어 있는지(창 없이 확인)."""
    try:
        import webview  # noqa: F401
        return True
    except ImportError:
        return False


def webview2_version():
    """Windows에서 설치된 WebView2 런타임 버전(없으면 None). 창 없이 진단용."""
    if os.name != 'nt':
        return None
    base = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft/EdgeWebView/Application'
    if not base.is_dir():
        return None
    versions = sorted((p.name for p in base.iterdir() if p.is_dir()), key=lambda v: [int(x) for x in v.split('.') if x.isdigit()])
    return versions[-1] if versions else None


def run_window(url: str, *, debug: bool = False, on_ready=None, on_closed=None) -> None:
    """url 을 네이티브 창으로 연다. 창을 닫으면 반환한다. on_closed: 창이 닫힐 때 한 번 부른다(종료 정리용)."""
    import webview

    store = storage_dir()
    store.mkdir(parents=True, exist_ok=True)
    window = webview.create_window(
        WINDOW_TITLE,
        url,
        width=WINDOW_SIZE[0],
        height=WINDOW_SIZE[1],
        min_size=MIN_SIZE,
        text_select=True,
    )
    if on_closed:
        window.events.closed += on_closed
    webview.start(
        func=on_ready,
        args=(window,) if on_ready else None,
        private_mode=False,
        storage_path=str(store),
        debug=debug,
    )


def main() -> int:
    from desktop import runtime  # 포트 선택·서버 기동·준비 확인

    try:
        import webview  # noqa: F401
    except ImportError:
        print(
            '데스크톱 셸(pywebview)이 설치되어 있지 않습니다.\n'
            '  설치: pip install pywebview\n'
            '  대안: python launcher.py  (브라우저 모드)',
            file=sys.stderr,
        )
        return 2

    server = runtime.start_server()
    url = f'http://127.0.0.1:{server.port}{URL_PATH}'
    try:
        runtime.wait_ready(url, server)
        print(
            f'데스크톱 셸(pywebview): {url}\n'
            f'사용자 데이터: {storage_dir()}\n'
            '창을 닫으면 종료됩니다.',
            flush=True,
        )
        run_window(url, debug='--debug' in sys.argv)
    except KeyboardInterrupt:
        pass
    finally:
        server.stop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
