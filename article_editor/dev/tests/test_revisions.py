"""저장 이력 목록·미리보기·복원(core/storage.py): 이력은 지우지 않고, 복원은 새 최신 저장본이 된다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402


def draft(article_id=None, **fields):
    base = {'bodyHtml': '<p>x</p>', 'title': '제목', 'content': '첫 본문'}
    if article_id:
        base['articleId'] = article_id
    return {'draft': dict(base, **fields)}


class RevisionHistoryTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.aid = storage.save_article(draft(content='첫 본문', title='제목1'))['articleId']
        storage.save_article(draft(self.aid, content='둘째 본문', title='제목2'))
        storage.save_article(draft(self.aid, content='셋째 본문', title='제목3'))

    def test_list_is_newest_first_with_ids_and_summary(self):
        items = storage.list_revisions(self.aid)['revisions']
        self.assertEqual([i['revisionNo'] for i in items], [3, 2, 1])
        self.assertEqual(items[0]['title'], '제목3')
        self.assertEqual(items[2]['excerpt'], '첫 본문')
        self.assertEqual(items[0]['id'], __import__('core.ids', fromlist=['x']).revision_uuid(self.aid, 3))
        self.assertNotIn('content', items[0])  # 목록에는 본문 전체를 싣지 않는다

    def test_preview_is_read_only(self):
        before = storage.list_revisions(self.aid)['revisions']
        preview = storage.get_revision(self.aid, 1)
        self.assertEqual((preview['title'], preview['content']), ('제목1', '첫 본문'))
        self.assertEqual(storage.list_revisions(self.aid)['revisions'], before)

    def test_restore_adds_a_new_latest_revision_and_keeps_history(self):
        result = storage.restore_revision(self.aid, 1)
        self.assertEqual((result['fromRevision'], result['revisionNo']), (1, 4))
        self.assertEqual(result['draft']['title'], '제목1')
        self.assertEqual(storage.latest_article()['draft']['content'], '첫 본문')
        items = storage.list_revisions(self.aid)['revisions']
        self.assertEqual([i['revisionNo'] for i in items], [4, 3, 2, 1])
        self.assertEqual(storage.get_revision(self.aid, 3)['content'], '셋째 본문')  # 복원 직전 상태도 남아 있다

    def test_restoring_twice_does_not_grow_history(self):
        storage.restore_revision(self.aid, 1)
        again = storage.restore_revision(self.aid, 1)
        self.assertEqual(again['revisionNo'], 4)
        self.assertEqual(len(storage.list_revisions(self.aid)['revisions']), 4)

    def test_preview_of_old_draft_without_content_uses_snapshot_text_rule(self):
        aid = storage.save_article({'draft': {'bodyHtml': '<p>가 &amp; 나</p><p><s>지운 말</s>다</p>', 'title': '옛 원고'}})['articleId']
        self.assertEqual(storage.get_revision(aid, 1)['content'], '가 & 나\n다')
        self.assertEqual(storage.get_revision(aid, 1)['content'], storage.create_snapshot(aid)['body_text'])

    def test_restoring_the_latest_changes_nothing(self):
        self.assertEqual(storage.restore_revision(self.aid, 3)['revisionNo'], 3)
        self.assertEqual(len(storage.list_revisions(self.aid)['revisions']), 3)

    def test_missing_revision_and_bad_ids(self):
        for call in (lambda: storage.get_revision(self.aid, 99), lambda: storage.restore_revision(self.aid, 99)):
            with self.assertRaises(RequestError) as error:
                call()
            self.assertEqual(error.exception.status, 404)
        for bad in ('x', '../' + 'a' * 29, 'A' * 32):
            with self.assertRaises(RequestError):
                storage.list_revisions(bad)

    def test_pruned_revision_is_gone_with_clear_message(self):
        with mock.patch.object(storage, 'MAX_REVISIONS', 2):
            storage.save_article(draft(self.aid, content='넷째 본문'))
        with self.assertRaises(RequestError) as error:
            storage.get_revision(self.aid, 1)
        self.assertIn('정리', str(error.exception))

    def test_restored_draft_keeps_photos_and_source_text(self):
        photo = {'id': 'p1', 'data': 'data:image/png;base64,QUJD', 'original': 'data:image/png;base64,QUJD'}
        sid, _ = storage.save_source('a.txt', b'raw', '자료 본문')
        aid = storage.save_article(draft(content='사진 본문', photos=[photo], sources=[{'id': sid, 'name': 'a.txt'}]))['articleId']
        storage.save_article(draft(aid, content='고친 본문', photos=[], sources=[]))
        restored = storage.restore_revision(aid, 1)['draft']
        self.assertEqual(restored['photos'][0]['data'], 'data:image/png;base64,QUJD')
        self.assertEqual(restored['sources'][0]['text'], '자료 본문')


class RevisionRoutesTests(unittest.TestCase):
    def test_http_routes_are_registered(self):
        source = (Path(__file__).resolve().parents[2] / 'app' / 'core' / 'api.py').read_text(encoding='utf-8')
        for fragment in ('/revisions', 'restore_revision', 'list_revisions', 'get_revision'):
            self.assertIn(fragment, source)


if __name__ == '__main__':
    unittest.main()
