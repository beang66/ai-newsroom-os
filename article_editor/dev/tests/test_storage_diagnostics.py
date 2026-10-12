"""저장 실패 진단(core/diagnostics.py, su4228 v30 test_storage_diagnostics 를 우리 저장소에 맞춰 이어받음):
기록에는 원고·경로·예외 문구가 없고, 사용자 안내는 원인별로 다르다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import errno
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import diagnostics, storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402
from core.managers import storage_manager  # noqa: E402
from core.managers.storage_manager import StorageManager  # noqa: E402


class StorageDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.log = Path(temp.name) / 'logs' / 'storage-errors.jsonl'
        patcher = mock.patch.object(diagnostics, 'LOG', self.log)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_safe_error_log(self):
        diagnostics.record_storage_error('version_restore', PermissionError('secret article private path C:/Users/x'))
        text = self.log.read_text(encoding='utf-8')
        record = json.loads(text)
        self.assertEqual((record['operation'], record['errorType']), ('version_restore', 'PermissionError'))
        self.assertNotIn('secret', text)
        self.assertNotIn('C:/Users', text)

    def test_log_is_capped(self):
        with mock.patch.object(diagnostics, 'MAX_BYTES', 400):
            for _ in range(30):
                diagnostics.record_storage_error('article_save', OSError(errno.ENOSPC, 'full'))
        self.assertLess(self.log.stat().st_size, 1500)

    def test_messages_by_cause(self):
        self.assertIn('권한', diagnostics.friendly_message(PermissionError()))
        self.assertIn('디스크 공간', diagnostics.friendly_message(OSError(errno.ENOSPC, 'x')))
        self.assertIn('디스크 공간', diagnostics.friendly_message(vault.sqlite.OperationalError('database or disk is full')))
        self.assertIn('다른 작업', diagnostics.friendly_message(vault.sqlite.OperationalError('database is locked')))
        self.assertIn('저장하지 못했어요', diagnostics.friendly_message(OSError(5, 'io')))

    def test_manager_save_turns_os_errors_into_friendly_request_errors_and_logs(self):
        use_temp_vault(self)
        manager = StorageManager()
        with mock.patch.object(storage, 'vault') as broken:
            broken.connect.side_effect = OSError(errno.ENOSPC, 'No space left on device: C:/secret/vault.db')
            with self.assertRaises(RequestError) as error:
                manager.save_article({'draft': {'bodyHtml': '<p>x</p>'}})
        self.assertIn('디스크 공간', str(error.exception.message))
        self.assertNotIn('secret', error.exception.message)
        self.assertEqual(json.loads(self.log.read_text(encoding='utf-8'))['operation'], 'article_save')

    def test_request_errors_and_unrelated_errors_pass_through(self):
        use_temp_vault(self)
        manager = StorageManager()
        with self.assertRaises(RequestError) as error:
            manager.save_article({'draft': 'not a dict'})
        self.assertEqual(error.exception.status, 400)  # 입력 오류는 그대로
        with mock.patch.object(storage, 'save_article', side_effect=KeyError('boom')), \
                mock.patch.object(__import__('core.managers.storage_manager', fromlist=['x']), '_save_article', side_effect=KeyError('boom')):
            with self.assertRaises(KeyError):
                manager.save_article({'draft': {}})
        self.assertFalse(self.log.exists())


if __name__ == '__main__':
    unittest.main()
