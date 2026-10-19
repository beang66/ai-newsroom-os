"""사용자 테스트 기록: 동의 전에는 남기지 않고, 허용 필드만 남기며, 계측 실패가 저장을 막지 않는다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from vault_fixture import use_temp_vault  # noqa: F401  (sys.path 준비)
from core import exports, vault
from core.errors import RequestError
from core.managers import session_manager, settings_manager, ut_event_manager
from core.managers.storage_manager import StorageManager
from core.managers.ut_event_manager import UtEventManager


def payloads():
    with vault.connect() as db:
        return [json.loads(row[0]) for row in db.execute('SELECT payload_json FROM ut_events ORDER BY occurred_at')]


class UtEventTests(unittest.TestCase):
    def setUp(self):
        root = use_temp_vault(self)
        for module in (session_manager, settings_manager):
            patcher = mock.patch.object(module, 'SETTINGS', root / 'settings.json')
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch.object(vault, 'backup_key', lambda: 'k' * 64)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.settings = settings_manager.SettingsManager()
        self.events = UtEventManager(self.settings)
        self.storage = StorageManager(events=self.events)

    def save(self):
        return self.storage.save_article({'draft': {'title': '비밀 제목', 'content': '비밀 본문', 'bodyHtml': '<p>비밀</p>'}, 'kind': 'manual'})

    def test_off_by_default_records_nothing(self):
        self.save()
        self.assertEqual(payloads(), [])
        self.assertFalse(self.events.preview()['enabled'])

    def test_records_only_allowed_fields_without_content(self):
        self.settings.update({'utMeasurement': True})
        aid = self.save()['articleId']
        self.storage.get_article(aid)
        rows = payloads()
        self.assertEqual([row['event_name'] for row in rows], ['article_persisted', 'article_reopened'])
        self.assertNotIn('비밀', json.dumps(rows, ensure_ascii=False))
        self.assertFalse(self.events.record('article_persisted', title='x'))  # 허용 목록 밖 필드는 거부
        self.assertEqual(len(payloads()), 2)

    def test_recording_failure_does_not_break_save(self):
        self.settings.update({'utMeasurement': True})
        with mock.patch.object(vault, 'backup_key', side_effect=RuntimeError('boom')):
            self.assertTrue(self.save()['articleId'])
        self.assertEqual(payloads(), [])

    def test_cap_export_and_delete(self):
        self.settings.update({'utMeasurement': True})
        with mock.patch.object(ut_event_manager, 'MAX_EVENTS', 2):
            for _ in range(3):
                self.events.record('output_export_completed', export_kind='cards', file_count=1, duration_ms=5)
        preview = self.events.preview()
        self.assertEqual((preview['count'], preview['dropped']), (2, 1))
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(exports, 'EXPORT_DIR', Path(temp)):
            result = self.events.export()
            lines = Path(result['files'][0]).read_text(encoding='utf-8').splitlines()
        self.assertEqual(len(lines), 2)
        self.assertEqual(Path(result['folder']).name, '진단')
        self.assertEqual(self.events.delete(), {'deleted': 2})
        self.assertEqual(self.events.preview()['count'], 0)

    def test_diagnostics_folder_opens_but_rejects_screen_files(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(exports, 'EXPORT_DIR', Path(temp)), \
                mock.patch.object(exports.subprocess, 'Popen') as opened:
            self.assertEqual(Path(exports.open_folder({'kind': 'diagnostics'})['folder']).name, '진단')
            opened.assert_called_once()
            with self.assertRaises(RequestError):
                exports.save({'kind': 'diagnostics', 'files': [{'data': 'eA==', 'ext': 'jsonl'}]})


if __name__ == '__main__':
    unittest.main()
