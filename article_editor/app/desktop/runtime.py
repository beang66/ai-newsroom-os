"""코어 서버 런타임 — 개발 실행과 배포(exe) 실행이 같은 경로를 쓰게 한다.

예전에는 ``server.py`` 를 별도 프로세스로 띄웠다(``subprocess.Popen([sys.executable, ...])``).
PyInstaller 배포본에서는 ``sys.executable`` 이 **자기 자신**이라 그 방식이 재실행 루프가 된다.
그래서 서버를 같은 프로세스의 데몬 스레드에 얹고, 창을 닫으면 함께 끝낸다.

이 모듈은 pywebview 를 import 하지 않는다. 창 없이도 쓸 수 있어야 하기 때문이다.
"""
from __future__ import annotations

import sys
import threading
import time
import urllib.request
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent.parent
if not getattr(sys, 'frozen', False) and str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

PORT_RANGE = range(8877, 8900)


def index_url(port):
    return f'http://127.0.0.1:{port}/index.html'


def status_url(port):
    return f'http://127.0.0.1:{port}/api/status'


def fetch(url, timeout=5):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read().decode('utf-8')


class LocalServer:
    """127.0.0.1 코어 서버를 데몬 스레드에서 돌리는 얇은 래퍼."""

    def __init__(self, port):
        from core import bootstrap  # 코어는 서버를 만들 때만 불러온다

        self.port = int(port)
        # 소켓은 생성자에서 바로 바인딩된다. 포트 충돌은 여기서 즉시 드러난다.
        self._httpd = bootstrap.create_server(self.port)
        self._thread = None

    @property
    def url(self):
        return index_url(self.port)

    def start(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._httpd.serve_forever, name='core-http', daemon=True)
            self._thread.start()
        return self

    def is_running(self):
        return self._thread is not None and self._thread.is_alive()

    def serve_forever(self):
        """메인 스레드에서 직접 서빙한다(브라우저 모드: Ctrl+C 로 종료)."""
        self._httpd.serve_forever()

    def stop(self, timeout=5.0):
        if self._thread is not None:
            self._httpd.shutdown()  # 서빙 스레드가 아닌 쪽에서 호출해야 한다
            self._thread.join(timeout)
        self._httpd.server_close()


def start_server(ports=PORT_RANGE):
    """빈 포트에 코어 서버를 띄우고 바로 쓸 수 있는 LocalServer 를 돌려준다.

    포트를 '찍어 보고' 나서 다시 바인딩하지 않는다. 그 사이에 다른 프로그램이
    끼어들 수 있고, Windows 는 SO_REUSEADDR 때문에 이미 쓰이는 포트에도 바인딩이
    성공해 버려 조용히 엉뚱한 서버가 되기 때문이다. 그냥 배타적으로 바인딩해 보고,
    이미 쓰이면 다음 포트로 넘어간다 → 남의 포트를 밀어내지도, 빼앗기지도 않는다.
    """
    first, last = ports.start, ports.stop - 1
    failure = None
    for port in ports:
        try:
            return LocalServer(port).start()
        except OSError as error:  # 이미 다른 프로그램이 쓰는 포트
            failure = error
    raise RuntimeError(
        f'{first}~{last} 포트가 모두 사용 중입니다. 실행 중인 편집기를 닫고 다시 시도해 주세요.'
    ) from failure


def wait_ready(url, server=None, retries=100, delay=.1):
    """창/브라우저를 열기 전에 편집기 시작 화면이 응답하는지 확인한다."""
    for _ in range(retries):
        if server is not None and not server.is_running():
            raise RuntimeError('서버 실행에 실패했습니다. 이 창의 오류 메시지를 확인해 주세요.')
        try:
            html = fetch(url, timeout=1)
            # 새 React 앱(#root)과 옛 커스텀 엘리먼트(<article-workspace>) 둘 다 허용한다.
            if 'id="root"' not in html and '<article-workspace' not in html:
                raise RuntimeError('새 편집기 시작 화면을 확인하지 못했습니다.')
            return
        except OSError:
            time.sleep(delay)
    raise RuntimeError('서버를 여는 데 시간이 오래 걸립니다. 다시 실행해 주세요.')
