"""모델 설치(다운로드·이어받기·해시 검증·로컬 폴더) 테스트 — 작은 스텁으로 검증한다.

실제 2 GB 모델은 받지 않는다. 파일 2개짜리 매니페스트를 만들어 경로만 확인한다.

    python -m unittest discover -s dev/tests -p 'test_*.py'
"""
from __future__ import annotations
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)

import hashlib
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / 'app'
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

from core import config  # noqa: E402
from app_paths import env_lines  # noqa: E402
from core.errors import RequestError  # noqa: E402
from core.managers.model_manager import ModelManager  # noqa: E402

FILES = {
    'base/config.json': b'{"model":"stub"}' * 20,
    'adapter/adapter_model.bin': bytes(range(256)) * 40,
}
RANGES: list[str] = []


class Stub(BaseHTTPRequestHandler):
    """/files/<path> 를 제공. Range 요청은 206 으로 응답한다(이어받기 확인용)."""

    delay = 0.0

    def log_message(self, *args):
        pass

    def do_GET(self):
        name = self.path.split('?')[0].lstrip('/files/')
        if name not in FILES:
            self.send_error(404)
            return
        data = FILES[name]
        start = 0
        header = self.headers.get('Range') or ''
        if header.startswith('bytes='):
            RANGES.append(header)
            start = int(header[6:].split('-')[0])
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {start}-{len(data) - 1}/{len(data)}')
        else:
            self.send_response(200)
        body = data[start:]
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        for offset in range(0, len(body), 32):
            self.wfile.write(body[offset : offset + 32])
            if self.delay:
                import time

                time.sleep(self.delay)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class PathDefaultsTests(unittest.TestCase):
    """기본 모델 위치가 앱 데이터 폴더(%LOCALAPPDATA%/AI Newsroom/models)인지 확인한다(2026-10-06, app_paths)."""

    @staticmethod
    def _configured(key):
        """`.env` 에 직접 적어 둔 항목은 기본값 검사에서 제외한다."""
        return any(line.strip().startswith(key + '=') for line in env_lines())

    def test_models_and_cache_live_in_app_data(self):
        self.assertEqual(config.MODELS_MANIFEST, config.BUNDLE / 'models_manifest.json')
        self.assertTrue(config.MODELS_MANIFEST.is_file(), '매니페스트는 앱에 동봉된다')
        if not (self._configured('MODELS_DIR') or os.environ.get('MODELS_DIR')):
            # 예전 위치를 옮기지 못한 PC(다른 드라이브 등)에서는 예전 위치를 그대로 쓴다(config._models_dir)
            self.assertIn(config.MODELS_DIR, (config.APP_DATA / 'models', config.APP_ROOT / 'models'))
        if not self._configured('HF_HOME'):
            self.assertEqual(config.HF_HOME, str(config.MODELS_DIR / 'hf'))


class ModelInstallTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stub = ThreadingHTTPServer(('127.0.0.1', 0), Stub)
        threading.Thread(target=cls.stub.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:' + str(cls.stub.server_port) + '/files'

    @classmethod
    def tearDownClass(cls):
        cls.stub.shutdown()
        cls.stub.server_close()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest = self.root / 'manifest.json'
        self.models_dir = self.root / 'models'
        self.original = (config.MODELS_DIR, config.MODELS_MANIFEST)
        config.MODELS_DIR = self.models_dir
        config.MODELS_MANIFEST = self.manifest

        def restore():
            config.MODELS_DIR, config.MODELS_MANIFEST = self.original
            self.temp.cleanup()

        self.addCleanup(restore)
        self.write_manifest()

    def write_manifest(self, base=None, sha_override=None):
        files = []
        for name, data in FILES.items():
            files.append({'path': name, 'size': len(data), 'sha256': sha_override or digest(data)})
        manifest = {
            'version': 1,
            'models': [
                {
                    'id': 'stub-model',
                    'label': '스텁 모델',
                    'kind': 'test',
                    'dir': 'stub-model',
                    'base': self.base if base is None else base,
                    'files': files,
                }
            ],
        }
        self.manifest.write_text(json.dumps(manifest), encoding='utf-8')

    def target(self, name):
        return self.models_dir / 'stub-model' / name

    def test_downloads_and_verifies(self):
        manager = ModelManager()
        result = manager.install()
        self.assertTrue(result['models'][0]['installed'])
        for name, data in FILES.items():
            self.assertEqual(self.target(name).read_bytes(), data)
        self.assertEqual(list(self.models_dir.rglob('*.part')), [])
        self.assertTrue(manager.verify()['ok'])

    def test_second_install_skips_download(self):
        manager = ModelManager()
        manager.install()
        RANGES.clear()
        result = manager.install()
        self.assertTrue(result['models'][0]['installed'])
        self.assertEqual(RANGES, [], '이미 받은 파일은 다시 요청하지 않는다')

    def test_resume_uses_range_header(self):
        part = self.target('base/config.json.part')
        part.parent.mkdir(parents=True, exist_ok=True)
        data = FILES['base/config.json']
        part.write_bytes(data[:20])
        RANGES.clear()
        result = ModelManager().install()
        self.assertTrue(result['models'][0]['installed'])
        self.assertTrue(any('bytes=20-' in record for record in RANGES), RANGES)
        self.assertEqual(self.target('base/config.json').read_bytes(), data)

    def test_hash_mismatch_fails_and_removes_file(self):
        self.write_manifest(sha_override='0' * 64)
        with self.assertRaises(RequestError) as caught:
            ModelManager().install()
        self.assertEqual(caught.exception.status, 502)
        self.assertFalse(self.target('base/config.json').exists())

    def test_local_folder_source(self):
        source = self.root / 'src'
        for name, data in FILES.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.write_manifest(base='')  # 매니페스트 base 가 비어도 --from 으로 설치(사내망)
        result = ModelManager().install(source=str(source))
        self.assertTrue(result['models'][0]['installed'])

    def test_start_install_runs_in_background_and_finishes(self):
        # 화면이 쓰는 경로(start_install → 스레드 → install). 예전에는 start_install 이 먼저 _busy 를 세워 install 이 429 로 자기 자신을 거절했다
        import time
        source = self.root / 'src'
        for name, data in FILES.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        manager = ModelManager()
        manager.start_install({'modelId': 'stub-model', 'from': str(source)})
        for _ in range(100):
            if not manager.status()['busy']:
                break
            time.sleep(0.05)
        status = manager.status()
        self.assertFalse(status['busy'])
        self.assertIsNone(status.get('lastError'))
        self.assertTrue(status['models'][0]['installed'])

    def test_second_start_while_installing_is_refused(self):
        manager = ModelManager()
        manager._busy = True
        with self.assertRaises(RequestError) as caught:
            manager.start_install({'modelId': 'stub-model'})
        self.assertEqual(caught.exception.status, 429)

    def test_missing_source_reports(self):
        self.write_manifest(base='')
        with self.assertRaises(RequestError) as caught:
            ModelManager().install()
        self.assertEqual(caught.exception.status, 503)
        self.assertIn('--from', caught.exception.message)

    def test_unwritable_models_dir_reports_clearly(self):
        # 설치 폴더에 쓸 수 없을 때(예: Program Files) 2 GB 를 받기 전에 안내하고 멈춘다
        blocker = self.root / 'blocker'
        blocker.write_text('폴더가 아니라 파일', encoding='utf-8')
        config.MODELS_DIR = blocker / 'models'
        with self.assertRaises(RequestError) as caught:
            ModelManager().install()
        self.assertEqual(caught.exception.status, 503)
        self.assertIn('MODELS_DIR', caught.exception.message)

    def test_cancel(self):
        Stub.delay = 0.02
        self.addCleanup(setattr, Stub, 'delay', 0.0)
        manager = ModelManager()
        threading.Timer(0.3, manager.cancel).start()
        result = manager.install()
        self.assertTrue(result['cancelled'])
        self.assertFalse(result['models'][0]['installed'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
