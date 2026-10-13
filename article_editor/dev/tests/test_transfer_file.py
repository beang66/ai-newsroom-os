"""파일로 옮기기: 코어가 고정 위치에 암호화 복제본을 쓰고, 위치를 알려 주고, 지운다."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture
from core import storage
from core.errors import RequestError
from core.managers import transfer_manager
from core.managers.transfer_manager import TransferManager

CODE = 'ABCDE-FGHJK-LMNPQ-RSTUV'


class TransferFileTests(unittest.TestCase):
    def test_make_report_restore_and_delete(self):
        vault_fixture.use_temp_vault(self)
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        patcher = mock.patch.object(transfer_manager, 'FILE_DIR', Path(folder.name) / 'out')
        patcher.start()
        self.addCleanup(patcher.stop)
        manager = TransferManager(None)
        storage.save_article({'draft': {'title': '파일 이전', 'bodyHtml': '<p>본문</p>'}})
        self.assertFalse(manager.file_status()['exists'])
        made = manager.make_file({'code': CODE})
        path = Path(made['path'])
        self.assertTrue(made['exists'] and path.is_file() and made['bytes'] > 0)
        self.assertEqual(manager.file_status()['path'], str(path), '안내하는 위치가 실제 파일 위치다')
        self.assertNotIn(CODE.encode(), path.read_bytes(), '코드는 파일에 들어가지 않는다')
        self.assertTrue(manager.delete_file()['deleted'])
        self.assertFalse(path.exists())
        self.assertTrue(manager.delete_file()['deleted'], '없어도 지우기는 실패하지 않는다')
        with self.assertRaises(RequestError):
            manager.make_file({'code': 'short'})


if __name__ == '__main__':
    unittest.main()
