"""보관함에서 기사 지우기 = 휴지통(2026-10-18): 보관함·이어서 작업에서 빠지고 더 저장되지 않는다.
30일 안에는 되살릴 수 있고, 지나면 이력·송고본·고정본까지 영구 삭제하고 쓰지 않는 사진도 지운다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import base64
import datetime
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
        result = storage.delete_article(gone)
        self.assertEqual((result['deleted'], result['articleId']), (True, gone))
        self.assertIn('purgeAt', result)
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

    def test_trash_lists_and_restores_within_30_days(self):
        aid = save(title='되살릴 기사')['articleId']
        storage.delete_article(aid)
        trash = storage.list_trash()['articles']
        self.assertEqual([(t['articleId'], t['title']) for t in trash], [(aid, '되살릴 기사')])
        self.assertEqual(storage.purge_trash(), [], '30일 전에는 영구 삭제하지 않는다')
        storage.restore_deleted(aid)
        self.assertEqual([a['article_id'] for a in read_models.list_articles()['articles']], [aid])
        self.assertEqual(storage.list_trash()['articles'], [])
        with self.assertRaises(RequestError):
            storage.restore_deleted(aid)  # 휴지통에 없음

    def test_purge_after_30_days_removes_everything_and_unused_photos(self):
        photo = 'data:image/png;base64,' + base64.b64encode(b'only-in-deleted').decode()
        shared = 'data:image/png;base64,' + base64.b64encode(b'shared-photo').decode()
        gone = save(title='영구 삭제', photos=[{'id': 'a', 'data': photo}, {'id': 'b', 'data': shared}])['articleId']
        keep = save(title='남는 기사', photos=[{'id': 'b', 'data': shared}])['articleId']
        storage.publish_article({'draft': {'articleId': gone, 'bodyHtml': '<p>x</p>', 'title': '영구 삭제'}})
        storage.create_snapshot(gone)
        storage.delete_article(gone)
        later = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=31)
        self.assertEqual(storage.purge_trash(now=later), [gone])
        with vault.connect() as db:
            for table in ('article_snapshots', 'article_revisions', 'article_published', 'article_deleted', 'article_first_saved'):
                self.assertEqual(db.execute(f'SELECT count(*) FROM {table} WHERE article_id = ?', (gone,)).fetchone()[0], 0, table)
            self.assertEqual(db.execute('SELECT count(*) FROM media').fetchone()[0], 1, '남은 기사가 쓰는 사진만 남는다')
            storage.create_snapshot(keep)
            with self.assertRaises(Exception):  # 영구 삭제 뒤에도 고정본은 다시 지울 수 없다(트리거 복구)
                db.execute('DELETE FROM article_snapshots')
        self.assertEqual(storage.latest_article()['draft']['photos'][0]['data'], shared)

    def test_purged_article_is_not_reimported_from_legacy_plaintext(self):
        import json, tempfile
        from unittest import mock
        aid = save(title='예전 평문')['articleId']
        with tempfile.TemporaryDirectory() as temp:
            legacy = Path(temp)
            (legacy / f'{aid}.json').write_text(json.dumps({'articleId': aid, 'title': '예전 평문'}), encoding='utf-8')
            storage.delete_article(aid)
            storage.purge_trash(now=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=31))
            with mock.patch.object(storage, 'ARTICLES_DIR', legacy), mock.patch.object(storage, 'SOURCES_DIR', legacy / 'none'):
                self.assertEqual(storage.import_legacy_files()['articles'], 0)
        with vault.connect() as db:
            self.assertIsNone(db.execute('SELECT 1 FROM articles WHERE id = ?', (aid,)).fetchone())

    def test_status_is_computed_by_core_not_stored(self):
        aid = save(title='상태', status='송고됨')['articleId']  # 화면이 보낸 status 는 버린다
        self.assertEqual(storage.latest_article()['draft']['status'], '작성 중')
        storage.publish_article({'draft': {'articleId': aid, 'bodyHtml': '<p>x</p>', 'title': '상태', 'content': '본문'}})
        self.assertEqual(storage.latest_article()['draft']['status'], '송고됨')
        save(aid, title='고친 상태')
        self.assertEqual(storage.latest_article()['draft']['status'], '수정 중')
        self.assertEqual(read_models.list_articles()['articles'][0]['state'], 'editing')
        with vault.connect() as db:
            self.assertNotIn('"status"', db.execute('SELECT draft_json FROM article_revisions ORDER BY rowid DESC').fetchone()[0])

    def test_unknown_or_bad_id(self):
        with self.assertRaises(RequestError) as caught:
            storage.delete_article('a' * 32)
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(RequestError) as caught:
            storage.delete_article('../x')
        self.assertEqual(caught.exception.status, 400)


if __name__ == '__main__':
    unittest.main()
