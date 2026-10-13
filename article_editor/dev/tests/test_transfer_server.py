"""서버 경유 이전: 옛 PC 에서 올리고 새 PC(다른 기기 키)에서 같은 코드로 내려받아 복구한다. Supabase Storage 는 메모리로 대체한다."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture
from core import auth, storage, vault
from core.errors import RequestError
from core.integrations import supabase
from core.managers import transfer_manager
from core.managers.transfer_manager import TransferManager

CODE = 'ABCDE-FGHJK-LMNPQ-RSTUV'


class FakeSession:
    def __init__(self, token='tok'):
        self.value = token

    def token(self):
        return self.value


class FakeStorage:
    """서버: 경로 → 바이트. 올린 것·받은 것·지운 것을 기록한다."""
    def __init__(self):
        self.files, self.calls = {}, []

    def install(self, test):
        for name, fn in (('storage_upload', self.upload), ('storage_download', self.download),
                         ('storage_delete', self.delete), ('storage_info', self.info)):
            patcher = mock.patch.object(supabase, name, fn)
            patcher.start()
            test.addCleanup(patcher.stop)

    def upload(self, bucket, path, data, token):
        self.calls.append(('upload', bucket, path, token))
        self.files[path] = data

    def download(self, bucket, path, token):
        self.calls.append(('download', bucket, path, token))
        return self.files.get(path)

    def delete(self, bucket, path, token):
        self.calls.append(('delete', bucket, path, token))
        self.files.pop(path, None)

    def info(self, bucket, path, token):
        return {'bytes': len(self.files[path]), 'updatedAt': '2026-10-13T00:00:00Z'} if path in self.files else None


class TransferServerTests(unittest.TestCase):
    def setUp(self):
        auth.set_session('tok', 'ref', 3600, email='me@example.test', user_id='user-1')
        self.addCleanup(auth.clear)
        self.server = FakeStorage()
        self.server.install(self)
        self.transfer = TransferManager(FakeSession())

    def new_pc(self):
        """다른 기기 키를 가진 빈 저장소(새 PC)로 바꾼다."""
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for patcher in (mock.patch.object(vault, 'DB_PATH', root / 'vault.db'),
                        mock.patch.object(vault, 'active_path', lambda: root / 'vault.db'),
                        mock.patch.object(vault, '_device_key', lambda: 'cd' * 32),
                        mock.patch.object(storage, 'OPEN_DIR', root / 'open')):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_upload_then_download_on_another_pc_and_server_copy_removed(self):
        vault_fixture.use_temp_vault(self)  # 옛 PC
        article_id = storage.save_article({'draft': {'title': '서버로 이전', 'bodyHtml': '<p>본문</p>'}})['articleId']
        self.assertEqual(self.transfer.status()['exists'], False)
        sent = self.transfer.upload({'code': CODE})
        self.assertTrue(sent['uploaded'])
        self.assertEqual(list(self.server.files), ['user-1/transfer.db'], '계정 폴더의 한 칸에만 올린다')
        self.assertNotIn(CODE.encode(), self.server.files['user-1/transfer.db'], '서버에는 코드가 없다')
        self.assertTrue(self.transfer.status()['exists'])

        self.new_pc()
        with self.assertRaises(RequestError):  # 틀린 코드: 바뀌지 않고 서버 파일도 남는다
            self.transfer.download({'code': 'AAAAA-BBBBB-CCCCC-DDDDD'})
        self.assertIn('user-1/transfer.db', self.server.files)
        result = self.transfer.download({'code': CODE})
        self.assertTrue(result['restored'] and result['serverCopyDeleted'])
        self.assertEqual(storage.latest_article()['draft']['articleId'], article_id)
        self.assertEqual(self.server.files, {}, '가져온 뒤 서버 파일은 지운다')

    def test_too_large_is_refused_before_uploading(self):
        vault_fixture.use_temp_vault(self)
        storage.save_article({'draft': {'title': '큰 자료', 'bodyHtml': '<p>x</p>'}})
        with mock.patch.object(transfer_manager, 'MAX_BYTES', 100):
            with self.assertRaises(RequestError) as caught:
                self.transfer.upload({'code': CODE})
        self.assertEqual((caught.exception.status, caught.exception.code), (413, 'TRANSFER_TOO_LARGE'))
        self.assertEqual(self.server.files, {}, '한도를 넘으면 서버로 보내지 않는다')

    def test_missing_file_login_required_and_code_validation(self):
        vault_fixture.use_temp_vault(self)
        with self.assertRaises(RequestError) as missing:
            self.transfer.download({'code': CODE})
        self.assertEqual(missing.exception.code, 'TRANSFER_MISSING')
        with self.assertRaises(RequestError):
            self.transfer.upload({'code': 'short'})
        for manager in (TransferManager(FakeSession('')),):
            with self.assertRaises(RequestError) as unauth:
                manager.status()
            self.assertEqual(unauth.exception.code, 'AUTH_REQUIRED')

    def test_delete_cancels_the_server_copy(self):
        self.server.files['user-1/transfer.db'] = b'x'
        self.assertTrue(self.transfer.delete()['deleted'])
        self.assertEqual(self.server.files, {})


if __name__ == '__main__':
    unittest.main()
