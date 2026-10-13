"""다른 PC로 이전: 이전 코드(하이픈 포함 23자)로 내보낸 파일을 **다른 기기 키**의 저장소에 풀어도 읽힌다."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture
from core import storage, vault
from core.errors import RequestError

CODE = 'ABCDE-FGHJK-LMNPQ-RSTUV'  # 화면(vaultTransfer.js)이 만드는 형식


class TransferTests(unittest.TestCase):
    def test_export_with_code_restores_on_another_device_key(self):
        vault_fixture.use_temp_vault(self)  # 옛 PC: 기기 키 TEST_KEY
        article_id = storage.save_article({'draft': {'title': '이전할 기사', 'bodyHtml': '<p>본문</p>'}})['articleId']
        raw = vault.export_backup(CODE)

        # 새 PC: 다른 기기 키, 빈 저장소
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for patcher in (mock.patch.object(vault, 'DB_PATH', root / 'vault.db'),
                        mock.patch.object(vault, 'active_path', lambda: root / 'vault.db'),
                        mock.patch.object(vault, '_device_key', lambda: 'cd' * 32),
                        mock.patch.object(storage, 'OPEN_DIR', root / 'open')):
            patcher.start()
            self.addCleanup(patcher.stop)
        with self.assertRaises(RequestError):  # 틀린 코드로는 열리지 않고 현재 자료도 안 바뀐다
            vault.restore_backup(raw, 'AAAAA-BBBBB-CCCCC-DDDDD')
        self.assertTrue(vault.restore_backup(raw, CODE)['restored'])
        self.assertEqual(storage.latest_article()['draft']['articleId'], article_id)
        self.assertEqual(storage.latest_article()['draft']['title'], '이전할 기사')


if __name__ == '__main__':
    unittest.main()
