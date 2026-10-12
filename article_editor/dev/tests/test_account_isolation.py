"""계정마다 자기 기사·자료만 본다: 저장소 파일이 계정별이라 다른 계정·비로그인 상태에서는 닿지 않는다."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저: 개발자의 .env 계정으로 실제 로그인하지 않게)
import vault_fixture  # noqa: F401  (sys.path 준비)
from core import read_models, sources, storage, vault
from core.errors import RequestError

DRAFT = {'title': '내 기사', 'bodyHtml': '<p>본문</p>'}


class AccountIsolationTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for patcher in (mock.patch.object(vault, 'DB_PATH', self.root / 'vault.db'),
                        mock.patch.object(vault, '_device_key', lambda: vault_fixture.TEST_KEY),
                        mock.patch.object(storage, 'OPEN_DIR', self.root / 'open')):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.addCleanup(vault_fixture._join_background_jobs)

    def as_user(self, user):
        return mock.patch.object(vault, '_user_id', lambda: user)

    def test_each_account_sees_only_its_own_data(self):
        with self.as_user('user-a'):
            article_id = storage.save_article({'draft': DRAFT})['articleId']
            storage.save_source('a.txt', b'secret-a', 'secret-a')
            self.assertEqual(len(read_models.list_articles()['articles']), 1)
        with self.as_user('user-b'):
            self.assertEqual(read_models.list_articles()['articles'], [])
            self.assertIsNone(storage.latest_article()['draft'])
            with self.assertRaises(RequestError):
                storage.latest_article(article_id=article_id)
            self.assertEqual(sources.list_sources()['sources'], [])
        with self.as_user('user-a'):
            self.assertEqual(len(read_models.list_articles()['articles']), 1)
        self.assertEqual(sorted(p.name for p in self.root.glob('vault-*.db')), ['vault-user-a.db', 'vault-user-b.db'])

    def test_signed_out_is_refused_with_auth_required(self):
        with self.as_user(''):
            with self.assertRaises(RequestError) as caught:
                read_models.list_articles()
        self.assertEqual((caught.exception.status, caught.exception.code), (401, 'AUTH_REQUIRED'))

    def test_legacy_vault_goes_to_first_login_only(self):
        with mock.patch.object(vault, 'active_path', lambda: self.root / 'vault.db'):  # 계정 도입 전 저장소를 만든다
            storage.save_article({'draft': DRAFT})
        self.assertTrue(vault.adopt_legacy('user-a'))
        self.assertFalse(vault.adopt_legacy('user-b'))
        self.assertFalse((self.root / 'vault.db').exists())
        self.assertTrue((self.root / 'vault.pre-accounts.db').is_file(), '이전 전에 원본을 복사해 둔다')
        with self.as_user('user-a'):
            self.assertEqual(len(read_models.list_articles()['articles']), 1)
        with self.as_user('user-b'):
            self.assertEqual(read_models.list_articles()['articles'], [])


if __name__ == '__main__':
    unittest.main()
