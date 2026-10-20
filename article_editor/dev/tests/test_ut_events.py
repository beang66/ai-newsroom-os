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
        self.events = UtEventManager()
        self.storage = StorageManager(events=self.events)

    def save(self):
        return self.storage.save_article({'draft': {'title': '비밀 제목', 'content': '비밀 본문', 'bodyHtml': '<p>비밀</p>'}, 'kind': 'manual'})

    def test_off_by_default_records_nothing(self):
        self.save()
        self.assertEqual(payloads(), [])
        self.assertFalse(self.events.preview()['enabled'])

    def test_records_only_allowed_fields_without_content(self):
        self.events.set_enabled({'enabled': True})
        aid = self.save()['articleId']
        self.storage.get_article(aid)
        rows = payloads()
        self.assertEqual([row['event_name'] for row in rows], ['article_persisted', 'article_reopened'])
        self.assertNotIn('비밀', json.dumps(rows, ensure_ascii=False))
        self.assertFalse(self.events.record('article_persisted', title='x'))  # 허용 목록 밖 필드는 거부
        self.assertEqual(len(payloads()), 2)

    def test_reopen_records_revision_but_archive_preview_is_not_a_reopen(self):
        self.events.set_enabled({'enabled': True})
        saved = self.save()
        self.storage.get_article(saved['articleId'], record=False)  # 보관함 미리보기
        self.assertEqual([row['event_name'] for row in payloads()], ['article_persisted'])
        self.storage.get_article(saved['articleId'])  # 사용자가 연 최신 원고
        reopened = payloads()[-1]
        self.assertEqual((reopened['event_name'], reopened['revision_no']), ('article_reopened', saved['revisionNo']))

    def test_preview_route_skips_reopen_record(self):
        from core import api
        with mock.patch.object(api.CORE, 'storage') as storage:
            api._article(['', 'a' * 32], {'purpose': ['preview']})
            api._article(['', 'a' * 32], {})
        self.assertEqual([c.kwargs['record'] for c in storage.get_article.call_args_list], [False, True])

    def test_recording_failure_does_not_break_save(self):
        self.events.set_enabled({'enabled': True})
        with mock.patch.object(vault, 'backup_key', side_effect=RuntimeError('boom')):
            self.assertTrue(self.save()['articleId'])
        self.assertEqual(payloads(), [])

    def test_cap_export_and_delete(self):
        self.events.set_enabled({'enabled': True})
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

    def test_consent_and_sessions_are_per_account(self):
        def as_user(user):
            return mock.patch.multiple(vault, _user_id=lambda: user, backup_key=lambda: user * 8)
        record = lambda: self.events.record('output_export_completed', export_kind='cards', file_count=1, duration_ms=1)
        with as_user('user-a'):
            self.events.set_enabled({'enabled': True})
            self.assertTrue(record())
        with as_user('user-b'):  # 같은 PC 의 다음 참여자: 앞사람 동의를 이어받지 않는다
            self.assertFalse(self.events.enabled())
            self.assertFalse(record())
            self.events.set_enabled({'enabled': True})
            self.assertTrue(record())
            b_rows = payloads()
        with as_user('user-a'):
            self.assertTrue(record())  # 계정이 바뀌었다 돌아왔으니 새 세션
            self.events.restart_session()  # 같은 계정으로 다시 로그인
            self.assertTrue(record())
            a_rows = payloads()
        self.assertEqual(len(b_rows), 1)
        self.assertEqual(len({row['session_id'] for row in a_rows}), 3)
        self.assertEqual(len({row['participant_id'] for row in a_rows + b_rows}), 2)
        self.assertNotIn(b_rows[0]['session_id'], {row['session_id'] for row in a_rows})
        with as_user(''):  # 로그인 전에는 동의도 기록도 없다
            self.assertFalse(self.events.enabled())
            self.assertFalse(record())

    def test_error_codes_use_status_without_message(self):
        self.assertEqual(self.events.error_code(RequestError('비밀 사유', 504)), 'TIMEOUT')
        self.assertEqual(self.events.error_code(RequestError('x', 409, code='REVISION_CONFLICT')), 'REVISION_CONFLICT')
        self.assertEqual(self.events.error_code(RequestError('x', 418)), 'REQUEST_ERROR')
        self.assertEqual(self.events.error_code(RuntimeError('x')), 'INTERNAL_ERROR')

    def test_client_events_accept_only_fixed_values(self):
        self.events.set_enabled({'enabled': True})
        record = self.events.record_client
        self.assertTrue(record({'event': 'screen_viewed', 'screen': 'convert', 'from_screen': None})['recorded'])
        self.assertTrue(record({'event': 'ui_blocked', 'task': 'platform_run', 'reason_code': 'SOURCE_NOT_APPLIED'})['recorded'])
        for bad in ({'event': 'screen_viewed', 'screen': '비밀 화면'}, {'event': 'ui_blocked', 'task': 'platform_run', 'reason_code': 'OTHER', 'message': 'x'},
                    {'event': 'article_persisted', 'article_id': 'a' * 32}, {'event': 'ui_blocked', 'task': 'platform_run'}, None):
            self.assertFalse(record(bad)['recorded'])
        self.assertEqual([row['event_name'] for row in payloads()], ['screen_viewed', 'ui_blocked'])

    def test_api_tracks_task_success_and_failure(self):
        from core import api
        self.events.set_enabled({'enabled': True})
        task, m = api._match(api.TASKS, '/api/articles/' + 'b' * 32 + '/snapshots')
        with mock.patch.object(api.CORE, 'events', self.events):
            api._track(task, m, {}, 0)
            task, m = api._match(api.TASKS, '/api/platform/generate')
            api._track(task, m, {'payload': {'article_id': 'c' * 32}}, 0, 504, 'TIMEOUT')
            api._track(*api._match(api.TASKS, '/api/articles/save'), {}, 0)  # 저장은 따로 남긴다
        done, failed = payloads()
        self.assertEqual((done['event_name'], done['task'], done['article_id']), ('task_completed', 'snapshot_create', 'b' * 32))
        self.assertEqual((failed['event_name'], failed['task'], failed['article_id'], failed['error_code'], failed['http_status']),
                         ('task_failed', 'platform_generate', 'c' * 32, 'TIMEOUT', 504))

    def test_platform_target_result_is_recorded_without_error_text(self):
        from core import platform_runs
        self.events.set_enabled({'enabled': True})
        manager = mock.Mock(events=self.events)
        run = {'id': 'r1', 'article_id': 'd' * 32}
        cards = [{'card_id': '1', 'rendered_image': {}}, {'card_id': '2', 'render_error': {'reason': '비밀'}}]
        platform_runs._record_target(manager, run, 'card_news', {'status': 'jpg_failed', 'draft': {'cards': cards}}, None, 0)
        platform_runs._record_target(manager, run, 'threads', {'status': 'failed', 'error': '비밀'}, RequestError('비밀', 503), 0)
        rows = payloads()
        self.assertEqual([(r['platform'], r['status'], r['error_code'], r['cards_total'], r['cards_failed']) for r in rows],
                         [('card_news', 'jpg_failed', None, 2, 1), ('threads', 'failed', 'ENGINE_UNAVAILABLE', 0, 0)])
        self.assertNotIn('비밀', json.dumps(rows, ensure_ascii=False))

    def test_diagnostics_folder_opens_but_rejects_screen_files(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(exports, 'EXPORT_DIR', Path(temp)), \
                mock.patch.object(exports.subprocess, 'Popen') as opened:
            self.assertEqual(Path(exports.open_folder({'kind': 'diagnostics'})['folder']).name, '진단')
            opened.assert_called_once()
            with self.assertRaises(RequestError):
                exports.save({'kind': 'diagnostics', 'files': [{'data': 'eA==', 'ext': 'jsonl'}]})


if __name__ == '__main__':
    unittest.main()
