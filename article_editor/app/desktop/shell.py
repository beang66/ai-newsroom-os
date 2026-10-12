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


def transport():
    """'http' 또는 'ipc'. 환경변수 AI_NEWSROOM_TRANSPORT 가 우선이고, 없으면 EXE 옆 transport.txt(HTTP 빌드가 만든다), 둘 다 없으면 ipc."""
    value = os.environ.get('AI_NEWSROOM_TRANSPORT')
    if not value and getattr(sys, 'frozen', False):
        try:
            value = (Path(sys.executable).with_name('transport.txt')).read_text(encoding='utf-8')
        except OSError:
            value = ''
    return 'http' if (value or '').strip().lower() == 'http' else 'ipc'


def scrub_webview_store(store: Path) -> None:
    """웹뷰(WebView2) 저장소에 원고가 평문으로 남을 수 있는 곳을 치운다. 앱을 열기 전과 닫은 뒤에 부른다.
    - Web Data: Chromium 자동 완성 기록(입력란에 쓴 제목 같은 값이 평문으로 남는다) — 앱이 쓰지 않으니 지워도 된다.
    - IndexedDB: 원고 백업 칸. 암호화 도입 전 빌드가 평문으로 남긴 흔적을 한 번 비운다(.scrubbed-v2 표식). 그 뒤의 백업은 암호화돼 있다.
    열려 있는 동안에는 잠겨 못 지울 수 있으므로 실패는 무시한다(다음 실행 때 다시)."""
    import shutil
    profile = store / 'EBWebView' / 'Default'
    for name in ('Web Data', 'Web Data-journal'):
        try:
            (profile / name).unlink(missing_ok=True)
        except OSError:
            pass
    mark = store / '.scrubbed-v2'
    if profile.is_dir() and not mark.exists():
        shutil.rmtree(profile / 'IndexedDB', ignore_errors=True)
        try:
            mark.write_text('1', encoding='ascii')
        except OSError:
            pass


def run_window(url: str, *, debug: bool = False, on_ready=None, on_closed=None) -> None:
    """url 을 네이티브 창으로 연다. 창을 닫으면 반환한다. on_closed: 창이 닫힐 때 한 번 부른다(종료 정리용)."""
    import webview

    store = storage_dir()
    store.mkdir(parents=True, exist_ok=True)
    # 화면은 브리지가 보이면 IPC, 아니면 HTTP 로 코어를 부른다(src/api/index.js mode "auto").
    # AI_NEWSROOM_TRANSPORT=http 로 브리지를 끄고 HTTP 로 돌아갈 수 있다(문제 생겼을 때의 우회로).
    api = None
    if transport() != 'http':
        from desktop.ipc_bridge import Bridge
        api = Bridge()
    window = webview.create_window(
        WINDOW_TITLE,
        url,
        width=WINDOW_SIZE[0],
        height=WINDOW_SIZE[1],
        min_size=MIN_SIZE,
        text_select=True,
        js_api=api,
    )
    if on_closed:
        window.events.closed += on_closed
    scrub_webview_store(store)
    webview.start(
        func=on_ready,
        args=(window,) if on_ready else None,
        private_mode=False,
        storage_path=str(store),
        debug=debug,
    )
    scrub_webview_store(store)  # 닫은 뒤에도 한 번 더(자동 완성 기록 등)


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
