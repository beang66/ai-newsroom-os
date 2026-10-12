"""Core가 소유하는 지속형 SNS 서비스. 로그인 프로필은 보존하고 창·Node는 종료한다."""
import atexit
import json
import os
import queue
import subprocess
import threading
import uuid
from ..errors import RequestError


class SnsService:
    def __init__(self, owner):
        self.owner, self.proc = owner, None
        self.lock = threading.Lock()
        self.responses = queue.Queue()
        atexit.register(self.close)

    def _start(self):
        if self.proc and self.proc.poll() is None:
            return
        node = self.owner._node_executable()
        adapter = self.owner._generator_dir() / 'sns-adapter.js'
        if not node or not adapter.is_file():
            raise RequestError('SNS 실행 엔진이 없습니다. Node·Playwright가 포함된 앱 또는 개발 환경이 필요합니다.', 503)
        from app_paths import APP_DATA
        env = {key: value for key, value in os.environ.items() if not any(word in key.upper() for word in ('TOKEN', 'PASSWORD', 'SECRET', 'API_KEY'))}
        env['NEWSROOM_SNS_PROFILE_ROOT'] = str(APP_DATA / 'sns')
        self.responses = queue.Queue()
        try:
            self.proc = subprocess.Popen([node, str(adapter)], cwd=str(adapter.parent), env=env,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, encoding='utf-8', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except OSError:
            raise RequestError('SNS 서비스 프로세스를 실행하지 못했습니다.', 503) from None
        proc, responses = self.proc, self.responses

        def read():
            try:
                for line in proc.stdout:
                    try: responses.put(json.loads(line))
                    except json.JSONDecodeError: pass
            finally:
                responses.put(None)
        threading.Thread(target=read, name='sns-reader', daemon=True).start()

    def call(self, platform, action, payload):
        if not self.lock.acquire(blocking=False):
            raise RequestError('이전 SNS 작업이 진행 중입니다.', 409)
        try:
            self._start()
            request_id=uuid.uuid4().hex
            self.proc.stdin.write(json.dumps({'id': request_id, 'platform': platform, 'action': action, 'payload': payload}, ensure_ascii=False)+'\n')
            self.proc.stdin.flush()
            try: result = self.responses.get(timeout=180)
            except queue.Empty:
                self.close()
                raise RequestError('SNS 작업 시간이 초과됐습니다. 작성창과 준비 결과를 확인한 후 다시 연결해 주세요.', 504) from None
            if not isinstance(result, dict) or result.get('id') != request_id:
                self.close()
                raise RequestError('SNS 서비스가 종료됐습니다. 다시 연결해 주세요.', 502)
            if not result.get('ok'):
                raise RequestError(result.get('error') or 'SNS 작업에 실패했습니다.', 422)
            return result['result']
        except (BrokenPipeError, OSError):
            self.close()
            raise RequestError('SNS 서비스를 다시 연결해 주세요.', 503) from None
        finally:
            self.lock.release()

    def close(self):
        proc, self.proc = self.proc, None
        if not proc: return
        try:
            proc.stdin.close()  # adapter는 stdin EOF에서 두 브라우저를 닫고 종료한다
            proc.wait(timeout=8)
        except (OSError, subprocess.TimeoutExpired):
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            else:
                proc.kill()
            proc.wait(timeout=5)
        finally:
            proc.stdout.close()
