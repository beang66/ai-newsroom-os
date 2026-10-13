"""작성 중 기사 서버 백업: 암호화, 묶어서 올리기(호출 수), 복구, 끄기. Supabase Storage·백엔드 키·시계는 대체한다."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture
from core import auth, backend_proxy, cloud_backup, storage, vault
from core.errors import RequestError
from core.integrations import supabase
from core.managers import session_manager, settings_manager
from core.managers.backup_manager import BackupManager
from core.managers.storage_manager import StorageManager

DRAFT = {'title': '백업할 기사', 'bodyHtml': '<p>본문</p>'}
KEY = 'backend-derived-key-for-user-1=='


class FakeSession:
    def token(self):
        return 'tok'


class FakeServer:
    """서버(Supabase Storage): 경로 → 바이트, 호출 기록. fail 이 True 면 업로드가 실패한다."""
    def __init__(self):
        self.files, self.calls, self.fail = {}, [], False

    def install(self, test):
        for name in ('storage_upload', 'storage_download', 'storage_delete', 'storage_info', 'storage_list'):
            patcher = mock.patch.object(supabase, name, getattr(self, name))
            patcher.start()
            test.addCleanup(patcher.stop)

    def storage_upload(self, bucket, path, data, token):
        self.calls.append(('upload', path))
        if self.fail:
            raise RequestError('서버 오류', 502)
        self.files[path] = data

    def storage_download(self, bucket, path, token):
        return self.files.get(path)

    def storage_delete(self, bucket, path, token):
        self.calls.append(('delete', path))
        self.files.pop(path, None)

    def storage_info(self, bucket, path, token):
        return {'bytes': len(self.files[path]), 'updatedAt': ''} if path in self.files else None

    def storage_list(self, bucket, folder, token):
        return [p[len(folder) + 1:] for p in self.files if p.startswith(folder + '/')]

    def uploads(self):
        return [c for c in self.calls if c[0] == 'upload']


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class CloudBackupTests(unittest.TestCase):
    def setUp(self):
        auth.set_session('tok', 'ref', 3600, email='me@example.test', user_id='user-1')
        self.addCleanup(auth.clear)
        vault_fixture.use_temp_vault(self)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.settings_file = Path(temp.name) / 'settings.json'
        for module in (session_manager, settings_manager):
            patcher = mock.patch.object(module, 'SETTINGS', self.settings_file)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.key_calls = []
        patcher = mock.patch.object(backend_proxy, 'post', side_effect=self.fake_backend)
        patcher.start()
        self.addCleanup(patcher.stop)
        cloud_backup.forget_key()
        self.addCleanup(cloud_backup.forget_key)
        self.server = FakeServer()
        self.server.install(self)
        self.clock = Clock()
        self.backup = BackupManager(FakeSession(), clock=self.clock)
        self.storage = StorageManager(on_saved=self.backup.notify)

    def fake_backend(self, path, payload, *args, **kwargs):
        self.key_calls.append(path)
        if self.backend_down:
            raise RequestError('백엔드 오류', 502)
        return {'key': KEY}

    backend_down = False

    def test_seal_roundtrip_and_wrong_key(self):
        sealed = cloud_backup.seal(KEY, '한글 내용'.encode())
        self.assertNotIn('한글'.encode(), sealed, '암호문에 평문이 없다')
        self.assertEqual(cloud_backup.open_sealed(KEY, sealed), '한글 내용'.encode())
        with self.assertRaises(RequestError):
            cloud_backup.open_sealed('another-key-not-the-same', sealed)

    def test_key_is_fetched_once_and_kept_in_memory_only(self):
        self.assertEqual(cloud_backup.backup_key('user-1'), KEY)
        self.assertEqual(cloud_backup.backup_key('user-1'), KEY)
        self.assertEqual(self.key_calls, ['/ai/backup-key'], '백엔드에는 한 번만 묻는다')

    def test_manual_save_uploads_immediately_and_auto_waits_for_quiet(self):
        self.storage.save_article({'draft': DRAFT, 'kind': 'manual'})
        self.assertEqual(self.backup.run_due(), 1, '수동 저장은 바로 올린다')
        article_id = storage.latest_article()['draft']['articleId']
        self.assertEqual(self.server.uploads(), [('upload', f'user-1/backups/{article_id}.enc')])
        self.storage.save_article({'draft': dict(DRAFT, articleId=article_id, bodyHtml='<p>고침</p>'), 'kind': 'auto', 'replaceLatest': True})
        self.assertEqual(self.backup.run_due(), 0, '자동 저장은 조용해질 때까지 올리지 않는다')
        self.clock.advance(31)
        self.assertEqual(self.backup.run_due(), 1, '30초 조용하면 올린다')
        self.assertEqual(len(self.server.uploads()), 2)

    def test_continuous_typing_is_capped_and_unchanged_content_is_skipped(self):
        aid = self.storage.save_article({'draft': DRAFT, 'kind': 'auto'})['articleId']
        for n in range(31):  # 10초마다 고쳐 쓴다: 30초 조용한 순간이 없다
            self.clock.advance(10)
            self.storage.save_article({'draft': dict(DRAFT, articleId=aid, bodyHtml=f'<p>{n}</p>'), 'kind': 'auto', 'replaceLatest': True})
            self.backup.run_due()
        self.assertEqual(len(self.server.uploads()), 1, '계속 타이핑해도 처음 변경 후 5분이 지나면 한 번 올린다(31번 저장했지만 1회)')
        self.backup.flush()  # 마지막 변경분
        after_flush = len(self.server.uploads())
        self.backup.notify(aid, 'manual')  # 내용이 그대로인 알림
        self.backup.flush()
        self.assertEqual(len(self.server.uploads()), after_flush, '내용이 같으면 올리지 않는다')

    def test_failure_backs_off_and_shutdown_uploads_the_rest(self):
        self.server.fail = True
        self.storage.save_article({'draft': DRAFT, 'kind': 'manual'})
        self.assertEqual(self.backup.run_due(), 0)
        self.assertEqual(len(self.server.uploads()), 1)
        self.assertIn('서버 오류', self.backup.status()['error'])
        self.assertEqual(self.backup.run_due(), 0)
        self.assertEqual(len(self.server.uploads()), 1, '실패 직후에는 다시 두드리지 않는다(재시도 대기)')
        self.server.fail = False
        self.clock.advance(61)
        self.assertEqual(self.backup.run_due(), 1, '대기가 끝나면 다시 시도한다')
        self.assertEqual(self.backup.status()['error'], '')
        self.storage.save_article({'draft': dict(DRAFT, title='종료 직전'), 'kind': 'auto'})
        self.backup.shutdown()
        self.assertEqual(self.backup.status()['pending'], 0, '앱을 닫을 때 쌓인 것을 올린다')

    def test_backend_key_failure_is_reported_and_does_not_break_saving(self):
        self.backend_down = True
        result = self.storage.save_article({'draft': DRAFT, 'kind': 'manual'})
        self.assertTrue(result['saved'], '백업이 실패해도 저장은 된다')
        self.assertEqual(self.backup.run_due(), 0)
        self.assertIn('백업 키', self.backup.status()['error'])
        self.assertEqual(self.server.uploads(), [])

    def test_inactive_when_disabled_or_after_account_switch(self):
        settings_manager.SettingsManager().update({'cloudBackup': False})
        self.storage.save_article({'draft': DRAFT, 'kind': 'manual'})
        self.assertEqual(self.backup.status()['pending'], 0, '꺼져 있으면 일을 만들지 않는다')
        settings_manager.SettingsManager().update({'cloudBackup': True})
        self.storage.save_article({'draft': dict(DRAFT, title='켜짐'), 'kind': 'manual'})
        auth.set_session('tok2', 'ref2', 3600, email='other@example.test', user_id='user-2')  # 올리기 전에 계정이 바뀜
        self.backup.flush()
        self.assertEqual(self.server.uploads(), [], '다른 계정의 기사를 올리지 않는다')

    def test_list_restore_on_new_pc_and_disable_deletes_server_copy(self):
        self.storage.save_article({'draft': DRAFT, 'kind': 'manual'})
        article_id = storage.latest_article()['draft']['articleId']
        self.backup.flush()
        # 새 PC: 다른 기기 키, 빈 저장소. 같은 계정으로 로그인하면 백엔드가 같은 백업 키를 준다
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for patcher in (mock.patch.object(vault, 'DB_PATH', root / 'vault.db'), mock.patch.object(vault, 'active_path', lambda: root / 'vault.db'),
                        mock.patch.object(vault, '_device_key', lambda: 'cd' * 32), mock.patch.object(storage, 'OPEN_DIR', root / 'open')):
            patcher.start()
            self.addCleanup(patcher.stop)
        cloud_backup.forget_key()
        rows = self.backup.list()['backups']
        self.assertEqual([(r['articleId'], r['title']) for r in rows], [(article_id, '백업할 기사')])
        result = self.backup.restore({'articleIds': [article_id, 'f' * 32]})
        self.assertEqual(result['restored'], [article_id])
        self.assertEqual(result['skipped'][0]['articleId'], 'f' * 32)
        self.assertEqual(storage.latest_article()['draft']['title'], '백업할 기사')
        self.assertTrue(self.backup.disable({'deleteServer': True})['serverDeleted'])
        self.assertEqual([p for p in self.server.files if p.startswith('user-1/backups/')], [], '서버 사본을 지운다')
        self.assertFalse(settings_manager.SettingsManager().get()['cloudBackup'])


if __name__ == '__main__':
    unittest.main()
