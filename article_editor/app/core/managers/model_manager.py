"""모델 다운로드/검증 — 배포본은 모델을 동봉하지 않고 첫 사용 때 내려받는다(설계 B, docs/LOCAL_MODELS.md).

- 매니페스트(`models_manifest.json`)가 파일 목록·크기·SHA-256 을 정의한다.
- 원본(base)은 **HTTP(S) URL** 또는 **로컬/UNC 폴더** 둘 다 지원한다(사내망 오프라인 설치).
- `.part` 로 받고 해시 검증 후 확정 → 끊겨도 **이어받기**(Range).
- 진행률·취소를 제공해 UI 가 폴링할 수 있게 한다(긴 호출을 만들지 않는다).

    status()                     현재 상태(설치 여부·진행률)
    install(source=None)         내려받기(백그라운드 스레드에서 호출 권장)
    cancel()                     진행 중 취소
"""
from __future__ import annotations

import hashlib
import json
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .. import config
from ..errors import RequestError

CHUNK = 1 << 20  # 1MB
USER_AGENT = 'AINewsroom/3.0'


class ModelManager:
    """매니페스트 기반 모델 설치 관리자(파일 1개씩, 순차 진행)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._cancel = False
        self._busy = False
        self._state = None  # 진행 중일 때만 dict
        self._last_error = None

    # ---------------------------------------------------------------- 매니페스트
    def manifest(self) -> dict:
        path = config.MODELS_MANIFEST
        if not path.is_file():
            raise RequestError('모델 매니페스트(models_manifest.json)를 찾지 못했습니다.', 503)
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except (ValueError, OSError) as error:
            raise RequestError('모델 매니페스트를 읽지 못했습니다: ' + str(error), 503) from None

    def entries(self) -> list:
        return list(self.manifest().get('models') or [])

    def entry(self, model_id: str = '') -> dict:
        models = self.entries()
        if not model_id:
            if not models:
                raise RequestError('매니페스트에 모델이 없습니다.', 503)
            return models[0]
        for item in models:
            if item.get('id') == model_id:
                return item
        raise RequestError('알 수 없는 모델입니다: ' + str(model_id), 404)

    def target(self, item: dict) -> Path:
        return config.MODELS_DIR / (item.get('dir') or item.get('id') or 'model')

    # ---------------------------------------------------------------- 상태
    def status(self) -> dict:
        with self._lock:
            progress = dict(self._state) if self._state else None
        rows = []
        for item in self.entries():
            files = item.get('files') or []
            root = self.target(item)
            done = sum(1 for record in files if (root / record['path']).is_file())
            rows.append(
                {
                    'id': item.get('id'),
                    'label': item.get('label', ''),
                    'kind': item.get('kind', ''),
                    'installed': bool(files) and done == len(files),
                    'files': len(files),
                    'filesDone': done,
                    'bytesTotal': sum(record.get('size', 0) for record in files),
                    'sourceConfigured': bool(item.get('base')),
                }
            )
        return {
            'dir': str(config.MODELS_DIR),
            'models': rows,
            'progress': progress,
            'busy': self._busy or bool(progress),
            'lastError': self._last_error,
        }

    # ---------------------------------------------------------------- 유틸
    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with open(path, 'rb') as handle:
            for block in iter(lambda: handle.read(CHUNK), b''):
                digest.update(block)
        return digest.hexdigest()

    def _ensure_dir(self, path: Path) -> None:
        """설치 폴더에 모델을 쓸 수 있는지 먼저 확인한다(2 GB 를 받기 전에 실패시키기 위해).

        Program Files 처럼 쓰기 권한이 없는 곳에 설치한 경우를 안내한다.
        """
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / '.write-test'
            probe.write_bytes(b'')
            probe.unlink(missing_ok=True)
        except OSError as error:
            raise RequestError(
                '모델을 저장할 수 없습니다: %s (%s). 설치 폴더에 쓰기 권한이 없으면 관리자 권한으로 실행하거나 '
                '.env 에 MODELS_DIR 를 지정해 주세요.' % (path, error),
                503,
            ) from None

    @staticmethod
    def _local_root(source: str):
        """로컬/UNC 폴더면 Path, URL 이면 None."""
        parts = urllib.parse.urlsplit(source)
        if parts.scheme in ('http', 'https'):
            return None
        if parts.scheme == 'file':
            return Path(urllib.request.url2pathname(parts.path))
        return Path(source)


    def _set_progress(self, done: int, path: str, total: int, on_progress=None) -> None:
        with self._lock:
            if self._state is None:
                self._state = {'model': '', 'bytesTotal': total, 'bytesDone': 0, 'file': '', 'startedAt': time.time()}
            self._state.update(bytesDone=done, file=path, bytesTotal=total)
        if on_progress:
            percent = int(done * 100 / total) if total else 0
            on_progress(percent, path, done, total)

    def _http_get(self, url: str, dest: Path, record: dict, start: int, tick) -> int:
        """Range 이어받기 → 받은 바이트 수를 돌려준다."""
        headers = {'User-Agent': USER_AGENT}
        if start:
            headers['Range'] = 'bytes=%d-' % start
        request = urllib.request.Request(url, headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=60)
        except urllib.error.HTTPError as error:
            raise RequestError('모델 파일을 받지 못했습니다(%s): %s' % (error.code, url), 502) from None
        except (urllib.error.URLError, TimeoutError):
            raise RequestError('모델 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 504) from None
        with response:
            if start and response.status != 206:
                start = 0  # 서버가 Range 를 지원하지 않으면 처음부터
                dest.unlink(missing_ok=True)
            mode = 'ab' if start else 'wb'
            with open(dest, mode) as handle:
                while True:
                    if self._cancel:
                        raise RequestError('cancelled', 499)
                    block = response.read(CHUNK)
                    if not block:
                        break
                    handle.write(block)
                    start += len(block)
                    tick(start)
        return start

    # ---------------------------------------------------------------- 설치
    def cancel(self) -> dict:
        self._cancel = True
        return self.status()

    def start_install(self, options: dict | None = None) -> dict:
        """백그라운드 스레드로 설치를 시작하고 즉시 상태를 돌려준다(긴 호출을 만들지 않는다).

        진행률은 status() 를 폴링해서 본다. 실패는 status()['lastError'] 로 확인한다.
        잘못된 모델 id·원본 주소 없음은 **동기적으로** 먼저 걸러낸다(응답 코드로 바로 알 수 있게).
        """
        options = options or {}
        source = str(options.get('from') or options.get('source') or '')
        model_id = str(options.get('modelId') or options.get('id') or '')

        item = self.entry(model_id)
        if not (item.get('files') or []):
            raise RequestError(
                '매니페스트에 파일 목록이 없습니다. dev/checks/make_model_manifest.py 로 생성해 채워 주세요.', 503
            )
        if not (source or item.get('base') or '').strip():
            raise RequestError(
                '모델 원본 주소가 없습니다. 매니페스트의 base 를 채우거나 --from <폴더|URL> 로 지정하세요.', 503
            )
        self._ensure_dir(self.target(item))  # 저장 가능한지 먼저 확인(쓰기 권한 없으면 즉시 503)

        with self._lock:
            if self._busy:
                raise RequestError('이미 모델을 받는 중입니다.', 429)
            self._busy = True
            self._last_error = None

        thread = threading.Thread(target=self._run, args=(model_id, source), name='model-install', daemon=True)
        thread.start()
        return self.status()

    def _run(self, model_id: str, source: str) -> None:
        try:
            self.install(model_id=model_id, source=source, _claimed=True)  # start_install 이 이미 설치 중 표시를 해 두었다
        except RequestError as error:
            with self._lock:
                self._last_error = {'status': error.status, 'message': error.message}
            self._busy = False

    def install(self, model_id: str = '', source: str = '', on_progress=None, _claimed: bool = False) -> dict:
        """모델을 설치한다. `source` 는 URL 또는 로컬/UNC 폴더(매니페스트 base 보다 우선).
        _claimed: start_install 이 이미 설치 중(_busy)으로 표시하고 넘긴 경우 — 다시 검사하면 자기 자신을 거절한다."""
        with self._lock:
            if self._busy and not _claimed:
                raise RequestError('이미 모델을 받는 중입니다.', 429)
            self._busy = True

        item = self.entry(model_id)
        files = item.get('files') or []
        if not files:
            raise RequestError(
                '매니페스트에 파일 목록이 없습니다. dev/checks/make_model_manifest.py 로 생성해 채워 주세요.', 503
            )
        base = (source or item.get('base') or '').strip()
        if not base:
            raise RequestError(
                '모델 원본 주소가 없습니다. 매니페스트의 base 를 채우거나 --from <폴더|URL> 로 지정하세요.', 503
            )

        root = self.target(item)
        self._ensure_dir(root)
        local = self._local_root(base)
        if local is not None and not local.is_dir():
            raise RequestError('모델 원본 폴더를 찾지 못했습니다: ' + str(local), 404)

        total = sum(record.get('size', 0) for record in files)
        done = 0
        cancelled = False
        self._cancel = False
        self._set_progress(0, '', total, on_progress)
        try:
            for record in files:
                relative = record['path']
                dest = root / relative
                dest.parent.mkdir(parents=True, exist_ok=True)
                expected = record.get('sha256') or ''

                if dest.is_file() and expected and self._sha256(dest) == expected:
                    done += record.get('size', 0) or dest.stat().st_size
                    self._set_progress(done, relative, total, on_progress)
                    continue

                if local is not None:
                    origin = local / relative
                    if not origin.is_file():
                        raise RequestError('원본에 없는 파일입니다: ' + relative, 404)
                    shutil.copyfile(origin, dest)
                    received = dest.stat().st_size
                else:
                    part = dest.with_name(dest.name + '.part')
                    start = part.stat().st_size if part.is_file() else 0
                    if start:
                        self._set_progress(done + start, relative, total, on_progress)
                    received = self._http_get(
                        base.rstrip('/') + '/' + relative,
                        part,
                        record,
                        start,
                        lambda value: self._set_progress(done + value, relative, total, on_progress),
                    )
                    if record.get('size') and received != record['size']:
                        raise RequestError('파일 크기가 매니페스트와 다릅니다: ' + relative, 502)
                    part.replace(dest)

                if expected and self._sha256(dest) != expected:
                    dest.unlink(missing_ok=True)
                    raise RequestError('무결성 검사에 실패했습니다(해시 불일치): ' + relative, 502)
                done += record.get('size', 0) or dest.stat().st_size
                self._set_progress(done, relative, total, on_progress)
        except RequestError as error:
            if error.status == 499:
                cancelled = True  # 취소는 오류가 아니다
            else:
                raise
        finally:
            with self._lock:
                self._state = None
                self._busy = False

        result = self.status()
        result['cancelled'] = cancelled
        return result

    def verify(self, model_id: str = '') -> dict:
        """내려받지 않고 무결성만 확인한다."""
        item = self.entry(model_id)
        root = self.target(item)
        bad = []
        missing = []
        for record in item.get('files') or []:
            path = root / record['path']
            if not path.is_file():
                missing.append(record['path'])
            elif record.get('sha256') and self._sha256(path) != record['sha256']:
                bad.append(record['path'])
        return {'id': item.get('id'), 'ok': not missing and not bad, 'missing': missing, 'corrupt': bad}
