"""2026-10-12 보관소에서 기사 지우기: 보관소·이어서 작업에서 빠지고, 지운 기사에는 더 저장되지 않는다. 고정본은 그대로 남는다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import read_models, storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402


def save(article_id=None, kind='manual', **fields):
    d = dict({'bodyHtml': '<p>x</p>', 'title': '제목', 'content': '본문'}, **fields)
    if article_id:
        d['articleId'] = article_id
    return storage.save_article({'draft': d, 'kind': kind})


class DeleteArticleTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def test_deleted_article_leaves_archive_and_latest(self):
        keep = save(title='남길 기사')['articleId']
        gone = save(title='지울 기사')['articleId']
        self.assertEqual(storage.delete_article(gone), {'deleted': True, 'articleId': gone})
        self.assertEqual([a['article_id'] for a in read_models.list_articles()['articles']], [keep])
        self.assertEqual(storage.latest_article()['draft']['articleId'], keep)  # 앱을 열면 남은 기사로 이어서
        for open_it in (lambda: storage.latest_article(article_id=gone), lambda: storage.get_article(gone, 'saved')):
            with self.assertRaises(RequestError) as caught:
                open_it()
            self.assertEqual(caught.exception.status, 404)

    def test_late_autosave_does_not_bring_it_back(self):
        aid = save(title='지울 기사')['articleId']
        storage.delete_article(aid)
        with self.assertRaises(RequestError) as caught:
            save(aid, kind='auto', title='늦게 온 자동 저장')
        self.assertEqual((caught.exception.status, caught.exception.code), (409, 'ARTICLE_DELETED'))
        self.assertEqual(read_models.list_articles()['articles'], [])

    def test_article_with_snapshot_can_be_deleted_and_snapshot_stays(self):
        aid = save(title='고정본 있는 기사')['articleId']
        snap = storage.create_snapshot(aid)
        storage.delete_article(aid)
        self.assertEqual(read_models.list_articles()['articles'], [])
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM article_snapshots WHERE article_id = ?', (aid,)).fetchone()[0], 1)
        self.assertTrue(snap)

    def test_unknown_or_bad_id(self):
        with self.assertRaises(RequestError) as caught:
            storage.delete_article('a' * 32)
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(RequestError) as caught:
            storage.delete_article('../x')
        self.assertEqual(caught.exception.status, 400)


if __name__ == '__main__':
    unittest.main()
