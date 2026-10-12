"""pywebview 브리지 — 화면이 window.pywebview.api.core(path, payload) 로 코어를 부른다(포트 없이).

core/api.py 의 Handler 를 그대로 재사용한다: 요청을 메모리 소켓에 담아 Handler 에 넘기고, 응답 바이트를 파싱한다.
그래서 라우팅·검증(Host/Origin/Content-Type/크기)·오류 본문이 HTTP 와 항상 같다(경로 지식을 다시 구현하지 않는다).
ponytail: 요청마다 Handler 를 만든다. 호출이 잦아 느려지면 그때 라우팅을 함수로 분리한다.
"""
import base64
import io
import json

_HOST = '127.0.0.1:0'  # Handler.allowed()/Origin 검사를 통과시키는 가짜 주소. 실제로 열리는 포트는 없다


class _Socket:
    def __init__(self, request):
        self._request = request
        self.response = bytearray()

    def makefile(self, mode, *_):
        return io.BytesIO(self._request)

    def sendall(self, data):
        self.response += data

    def settimeout(self, *_):
        pass

    def close(self):
        pass


class _Server:
    server_address = ('127.0.0.1', 0)


def _call(method, path, payload):
    from core.api import Handler

    body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else b''
    head = f'{method} {path} HTTP/1.1\r\nHost: {_HOST}\r\nOrigin: http://{_HOST}\r\n'
    if payload is not None:
        head += f'Content-Type: application/json\r\nContent-Length: {len(body)}\r\n'
    sock = _Socket(head.encode() + b'\r\n' + body)
    Handler(sock, ('127.0.0.1', 0), _Server())
    raw = bytes(sock.response)
    header, _, content = raw.partition(b'\r\n\r\n')
    lines = header.decode('latin-1').split('\r\n')
    status = int(lines[0].split()[1])
    mime = next((l.split(':', 1)[1].strip() for l in lines[1:] if l.lower().startswith('content-type:')), '')
    return status, mime, content


class Bridge:
    """pywebview js_api. 공개 메서드(core, coreBytes)만 화면에 노출된다."""

    def core(self, path, payload=None):
        """JSON 호출. HTTP 와 같은 {status, body} 를 돌려준다(오류도 예외가 아니라 값 — code/details 를 잃지 않으려고)."""
        status, _, content = _call('POST' if payload is not None else 'GET', path, payload)
        try:
            body = json.loads(content.decode('utf-8')) if content else {}
        except ValueError:
            body = {'error': '응답을 읽지 못했어요.'}
        return {'status': status, 'body': body}

    def coreBytes(self, path):
        """바이트 호출(이미지·원본). data URL 문자열로 돌려준다. 실패하면 예외."""
        status, mime, content = _call('GET', path, None)
        if status != 200:
            try:
                message = json.loads(content.decode('utf-8')).get('error')
            except ValueError:
                message = None
            raise RuntimeError(message or '요청을 완료하지 못했어요.')
        return f'data:{mime.split(";")[0]};base64,' + base64.b64encode(content).decode('ascii')
