"""Core bootstrap: server wiring and startup."""
import os, socket, sys, threading
from http.server import ThreadingHTTPServer

from .config import PORT
from app_paths import migrate_legacy
from .api import Handler
from .ai.local_models import load_headline_model


def warm_headline_model():
    try:
        load_headline_model()
    except Exception:
        pass


class LoopbackServer(ThreadingHTTPServer):
    """127.0.0.1 전용 서버. **배타적으로** 바인딩한다.

    HTTPServer 기본값(allow_reuse_address=True)은 Windows 에서 다른 프로그램이 쓰는
    포트에도 바인딩을 성공시킨다. 그러면 요청은 먼저 잡고 있던 쪽으로 가서 우리 앱은
    조용히 응답 없는 서버가 되고(실측 확인), 서로 가로채는 상태도 가능해진다.
    그래서 끈다. Windows 에서는 SO_EXCLUSIVEADDRUSE 까지 걸어 나중에 뜬 프로그램이
    우리 포트를 가로채지도 못하게 한다. 포트가 이미 쓰이면 bind 가 OSError(10048)로
    실패한다 → 런처는 다음 포트로 가고, server.py 는 안내를 내고 종료한다.
    """

    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def create_server(port=None):
    """127.0.0.1 전용 서버를 만든다(아직 serve_forever 는 호출하지 않는다).

    ``python server.py`` 는 메인 스레드에서 그대로 돌리고, launcher 와 배포본은
    이 서버를 데몬 스레드에 얹어 창과 같은 프로세스에서 서빙한다.
    포트가 이미 사용 중이면 OSError 를 그대로 올린다(남의 포트를 밀어내지 않는다).
    예전 저장 위치(.article-workspace)가 남아 있으면 먼저 새 위치로 옮긴다(app_paths.migrate_legacy).
    """
    left = migrate_legacy()
    if left:
        print(f'[저장 위치] 옮기지 못한 파일 {len(left)}개는 예전 자리에 남겨 둡니다(사용 중이거나 같은 이름이 이미 있음).', flush=True)
    return LoopbackServer(('127.0.0.1', int(PORT if port is None else port)), Handler)


def main():
    try:
        server = create_server()
    except OSError:
        print(
            f'{PORT} 포트를 다른 프로그램이 쓰고 있어 시작하지 못했습니다.\n'
            f'  다른 프로그램을 종료하거나 PORT 환경변수로 포트를 바꾸세요.\n'
            f'  권장: python launcher.py  (빈 포트를 골라 시작 화면까지 확인합니다)',
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    print(f'\uae30\uc0ac \uc791\uc5c5\uc2e4: http://127.0.0.1:{PORT}\n\uc885\ub8cc: Ctrl+C')
    if os.environ.get('USE_LOCAL_MODELS', 'false').lower() == 'true':
        threading.Thread(target=warm_headline_model, daemon=True).start()
    server.serve_forever()