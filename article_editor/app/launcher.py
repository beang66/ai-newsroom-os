"""기사 작업실 실행기 — 로컬 코어를 띄우고 창(또는 브라우저)을 연다.

개발 실행 (프로젝트 루트에서)
    start_windows.bat                   브라우저 모드(Windows, 더블클릭/명령)
    python app/launcher.py              브라우저 모드(기본, 기존과 동일)
    python app/launcher.py --window     데스크톱 창(pywebview)
    python app/launcher.py --check      창을 띄우지 않고 진단
    python app/launcher.py --smoke write 창 검증 하네스(데스크톱 셸)

배포본(exe)도 **같은 CLI**를 쓴다. 다만 인자가 없으면 창 모드가 기본이고,
진단 로그는 `%LOCALAPPDATA%/AI Newsroom/logs/app.log` 에 남는다(app_paths, packaging/README.md).

서버는 별도 프로세스가 아니라 이 프로세스의 스레드에서 돈다(desktop/runtime.py).
배포본에서 `sys.executable` 이 자기 자신이라 재실행 루프가 되는 문제를 없앤다.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import webbrowser
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent
if not getattr(sys, 'frozen', False) and str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from app_paths import APP_DATA, APP_ROOT, BUNDLE, DOCUMENTS, ENV_DIRS, FRONTEND, FROZEN, WORKSPACE  # noqa: E402
from desktop import runtime  # noqa: E402

LOG_PATH = WORKSPACE / 'logs' / 'app.log'


class _Tee:
    """콘솔과 로그 파일에 동시에 쓴다. 창 모드 exe 는 콘솔이 없어 sys.stdout 이 None 이다."""

    def __init__(self, stream, log):
        self._targets = (stream, log)

    def write(self, text):
        for target in self._targets:
            if target is None:
                continue
            try:
                target.write(text)
            except Exception:
                pass

    def flush(self):
        for target in self._targets:
            if target is None:
                continue
            try:
                target.flush()
            except Exception:
                pass


def prepare_output():
    """배포본은 진단용 로그를 남기고, 콘솔이 없으면 로그로 대체한다."""
    log = None
    if FROZEN:
        try:
            LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            log = open(LOG_PATH, 'a', encoding='utf-8')
        except OSError:
            log = None
    if log is not None:
        sys.stdout = _Tee(sys.stdout, log)
        sys.stderr = _Tee(sys.stderr, log)
    if sys.stdout is None or sys.stderr is None:
        sink = open(os.devnull, 'w', encoding='utf-8')
        sys.stdout = sys.stdout or sink
        sys.stderr = sys.stderr or sink
    return log


def fatal(message):
    """창 모드 exe 는 콘솔이 없으므로 OS 메시지 상자로도 알린다."""
    text = f'{message}\n\n실행 폴더: {APP_ROOT}\n로그: {LOG_PATH}' if LOG_PATH.is_file() else message
    print(message, file=sys.stderr, flush=True)
    if FROZEN and os.name == 'nt':
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, text, '기사 작업실', 0x10)
        except Exception:
            pass


def env_source():
    """실제로 읽히는 .env 위치(없으면 None)."""
    for folder in ENV_DIRS:
        if (folder / '.env').is_file():
            return str(folder / '.env')
    return None


def shell_parts():
    """pywebview 셸 모듈과 사용자 데이터 폴더(창 없이 확인 가능)."""
    from desktop import shell

    store = shell.storage_dir()
    store.mkdir(parents=True, exist_ok=True)
    return shell, store


def backend_info():
    """AI 호출 경로 요약 — local(개발 .env 키) / remote(우리 백엔드 프록시)."""
    from core import config

    return config.AI_BACKEND, bool(config.AI_BACKEND_URL), bool(config.APP_TOKEN)


def models_cli(args):
    """`--models status` / `--models install [--from <폴더|URL>]` — 모델 설치·상태."""
    from core.managers.model_manager import ModelManager

    manager = ModelManager()
    if 'install' in args:
        source = ''
        if '--from' in args:
            index = args.index('--from')
            if index + 1 < len(args):
                source = args[index + 1]

        def progress(percent, path, done, total):
            print(f'  {percent:3d}%  {path}  ({done / 1e6:.0f}/{total / 1e6:.0f} MB)', flush=True)

        print('모델 설치를 시작합니다…', flush=True)
        result = manager.install(source=source, on_progress=progress)
        print('취소했습니다.' if result.get('cancelled') else '설치를 마쳤습니다.', flush=True)

    status = manager.status()
    print(f"모델 폴더(설치 경로 안): {status['dir']}", flush=True)
    for row in status['models']:
        state = '설치됨' if row['installed'] else ('일부' if row['filesDone'] else '없음')
        source = '설정됨' if row['sourceConfigured'] else '없음(매니페스트 base 또는 --from 필요)'
        print(
            f"  {row['id']}: {state} ({row['filesDone']}/{row['files']} 파일, {row['bytesTotal'] / 1e9:.2f} GB)"
            f"  원본 {source}",
            flush=True,
        )
    return 0


def print_diagnostics(url, server):
    try:
        status = json.loads(runtime.fetch(runtime.status_url(server.port)))
    except Exception as error:  # 진단 실패가 실행을 막지는 않는다
        status = {'error': str(error)}
    print('[진단] 실행 모드  : ' + ('배포본(exe)' if FROZEN else '개발(파이썬)'))
    print(f'[진단] 앱 폴더    : {APP_ROOT}')
    print(f'[진단] 리소스      : {BUNDLE}')
    print(f'[진단] 시작 화면  : {"있음" if (FRONTEND / "index.html").is_file() else "없음"}  {FRONTEND}')
    print(f'[진단] 주소        : {url} (포트 {server.port})')
    print(f'[진단] 서버 스레드 : {"실행 중" if server.is_running() else "중단"}')
    print(f'[진단] 코어 상태   : {json.dumps(status, ensure_ascii=False)}')
    print(f'[진단] .env        : {env_source() or "없음(OS 환경변수만 사용)"}')
    ai, has_url, has_token = backend_info()
    print(f'[진단] AI 경로     : {ai} (백엔드 주소 {"설정" if has_url else "없음"}, 토큰 {"설정" if has_token else "없음"})')
    print(f'[진단] 로그        : {LOG_PATH}')
    print(f'[진단] 기사·취재자료: {DOCUMENTS}')
    print(f'[진단] 앱 데이터   : {APP_DATA}')
    try:
        from core.managers.model_manager import ModelManager

        status = ModelManager().status()
        rows = status['models']
        if rows:
            row = rows[0]
            state = '설치됨' if row['installed'] else f"없음({row['filesDone']}/{row['files']} 파일)"
            print(f"[진단] 모델        : {row['id']} {state}  {status['dir']}")
        else:
            print('[진단] 모델        : 매니페스트에 모델 없음')
    except Exception as error:  # 진단 실패가 실행을 막지 않는다
        print(f'[진단] 모델        : 확인 실패({error})')


def main():
    args = sys.argv[1:]
    log = prepare_output()
    try:
        if '--smoke' in args:
            from desktop import smoke

            index = args.index('--smoke')
            mode = args[index + 1] if index + 1 < len(args) and args[index + 1] in ('write', 'read') else 'write'
            return smoke.run(mode=mode, debug='--debug' in args)

        if '--models' in args:
            return models_cli(args)

        server = runtime.start_server()
        url = server.url
        # 개발 기본값은 브라우저(기존 동작), 배포본 기본값은 창이다.
        use_window = '--window' in args or (FROZEN and '--browser' not in args)
        try:
            runtime.wait_ready(url, server)
            print(
                f'새 기사 편집기 v14: {url}\n실행 폴더: {APP_ROOT}\n이 창을 열어 둔 채 사용하세요. 종료하려면 Ctrl+C를 누르세요.',
                flush=True,
            )
            if '--check' in args:
                print_diagnostics(url, server)
                if use_window:
                    shell, store = shell_parts()
                    print(
                        f'데스크톱 셸: pywebview={shell.shell_available()}, webview2={shell.webview2_version()}, storage={store}',
                        flush=True,
                    )
                print('STARTUP CHECK PASSED', flush=True)
                return 0
            if use_window:
                shell, store = shell_parts()
                if not shell.shell_available():
                    print('데스크톱 셸(pywebview)을 찾지 못해 브라우저 모드로 엽니다. 설치: pip install pywebview', flush=True)
                else:
                    print('데스크톱 셸(pywebview) 창 모드 — 창을 닫으면 종료됩니다.', flush=True)
                    # 창을 닫아도 pywebview/.NET(WebView2) 종료 단계에서 프로세스가 남는 경우가 있어(창 없이 파이썬·WebView2 가 메모리에
                    # 남음) 정리를 마친 뒤 직접 끝낸다. 정상 종료든 닫힘 이벤트든 먼저 오는 쪽이 한 번만 실행한다.
                    quit_once = threading.Lock()

                    def quit_now(*_):
                        if not quit_once.acquire(blocking=False):
                            return
                        watchdog = threading.Timer(8, lambda: os._exit(0))  # 정리가 멈춰도 8초 뒤에는 끝낸다
                        watchdog.daemon = True
                        watchdog.start()
                        try:
                            server.stop()
                        finally:
                            if log is not None:
                                log.close()
                            os._exit(0)

                    shell.run_window(url, debug='--debug' in args, on_closed=quit_now)
                    quit_now()
                    return 0
            webbrowser.open(url)
            server.serve_forever()
        finally:
            server.stop()
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        fatal(str(error))
        return 1
    finally:
        if log is not None:
            log.close()


if __name__ == '__main__':
    sys.exit(main())
