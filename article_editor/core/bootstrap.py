"""Core bootstrap: server wiring and startup."""
import os, socket, threading
from http.server import ThreadingHTTPServer

from .config import PORT
from .api import Handler
from .ai.local_models import load_headline_model


def warm_headline_model():
    try:
        load_headline_model()
    except Exception:
        pass


def port_in_use(port):
    """그 포트에 이미 응답하는 프로그램이 있는지 확인한다.

    HTTPServer 는 allow_reuse_address=True 라서 Windows 에서는 **다른 프로그램이
    쓰는 포트에도 바인딩이 성공**한다. 그러면 요청은 먼저 잡고 있던 쪽으로 가서
    엉뚱한 화면이 열리므로, 시작할 때 미리 알려 준다.
    """
    with socket.socket() as probe:
        probe.settimeout(.5)
        return probe.connect_ex(('127.0.0.1', int(port))) == 0


def check_port_available(port=None):
    port = int(PORT if port is None else port)
    if port_in_use(port):
        print(
            f'경고: {port} 포트를 다른 프로그램이 이미 쓰고 있습니다. 그 프로그램이 응답할 수 있으니\n'
            f'      창 모드(launcher.py --window, 배포 exe)를 쓰거나 PORT 환경변수로 포트를 바꾸세요.',
            flush=True,
        )


def create_server(port=None):
    """127.0.0.1 전용 서버를 만든다(아직 serve_forever 는 호출하지 않는다).

    ``python server.py`` 는 메인 스레드에서 그대로 돌리고, launcher 와 배포본은
    이 서버를 데몬 스레드에 얹어 창과 같은 프로세스에서 서빙한다.
    """
    return ThreadingHTTPServer(('127.0.0.1', int(PORT if port is None else port)), Handler)


def main():
    check_port_available()
    print(f'\uae30\uc0ac \uc791\uc5c5\uc2e4: http://127.0.0.1:{PORT}\n\uc885\ub8cc: Ctrl+C')
    if os.environ.get('USE_LOCAL_MODELS', 'false').lower() == 'true':
        threading.Thread(target=warm_headline_model, daemon=True).start()
    create_server().serve_forever()