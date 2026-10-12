"""2026-10-12 CMS 최종 발행: 발행 = 수동 저장 + 기사당 하나인 발행본(다시 발행하면 덮어쓰고 발행 시각 갱신).
보관소 '수정'은 마지막 수동 저장본 / 발행본을 편집기로 연다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import read_models, storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402


def draft(article_id=None, **fields):
    d = dict({'bodyHtml': '<p>x</p>', 'title': '제목', 'content': '본문'}, **fields)
    if article_id:
        d['articleId'] = article_id
    return d


def save(kind, article_id=None, **fields):
    return storage.save_article({'draft': draft(article_id, **fields), 'kind': kind})


def publish(article_id=None, **fields):
    return storage.publish_article({'draft': draft(article_id, **fields)})


def listed(aid):
    return next(a for a in read_models.list_articles()['articles'] if a['article_id'] == aid)


class PublishTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def test_publish_saves_manually_and_creates_one_published_copy(self):
        aid = save('auto', title='쓰는 중')['articleId']
        self.assertEqual(listed(aid)['state'], 'draft')
        result = publish(aid, title='발행 제목')
        self.assertFalse(result['republished'])
        self.assertEqual(result['published']['title'], '발행 제목')
        self.assertEqual(result['published']['publishCount'], 1)
        # 발행 = 수동 저장: 저장 이력에도 남는다
        self.assertEqual([r['title'] for r in storage.list_revisions(aid)['revisions']], ['발행 제목'])
        item = listed(aid)
        self.assertEqual(item['state'], 'published')  # 작성 중 → 발행본으로 이동
        self.assertEqual(item['published']['title'], '발행 제목')

    def test_republish_overwrites_and_updates_time(self):
        with mock.patch.object(storage, '_now', lambda: '2026-10-12T10:00:00+09:00'):
            aid = publish(title='1판')['articleId']
        with mock.patch.object(storage, '_now', lambda: '2026-10-12T11:30:00+09:00'):
            second = publish(aid, title='2판')
        self.assertTrue(second['republished'])
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM article_published WHERE article_id = ?', (aid,)).fetchone()[0], 1)
        info = second['published']
        self.assertEqual((info['title'], info['publishCount']), ('2판', 2))
        self.assertEqual(info['firstPublishedAt'], '2026-10-12T10:00:00+09:00')  # 처음 발행 시각은 남김
        self.assertEqual(info['publishedAt'], '2026-10-12T11:30:00+09:00')       # 수정(재발행) 시각 갱신

    def test_edit_after_publish_keeps_published_copy(self):
        aid = publish(title='발행판', content='발행 본문')['articleId']
        save('manual', aid, title='고친 판', content='고친 본문', status='송고됨')
        item = listed(aid)
        self.assertEqual(item['state'], 'editing')               # 작성 중(발행 후 수정)에도 보이고
        self.assertEqual(item['title'], '고친 판')
        self.assertEqual(item['published']['title'], '발행판')    # 발행본은 다시 발행하기 전까지 그대로
        self.assertEqual(storage.get_article(aid, 'published')['draft']['title'], '발행판')
        publish(aid, title='고친 판', content='고친 본문')
        self.assertEqual(listed(aid)['state'], 'published')

    def test_open_saved_and_published_versions(self):
        aid = publish(title='발행판')['articleId']
        save('manual', aid, title='저장판')
        save('auto', aid, title='작업본')  # 저장하지 않은 임시 저장
        saved = storage.get_article(aid, 'saved')
        self.assertEqual(saved['draft']['title'], '저장판')  # 작성 중 '수정' = 마지막 수동 저장본(임시 저장본 아님)
        self.assertEqual(saved['revisionKind'], 'manual')
        self.assertTrue(saved['editedAfterPublish'])
        pub = storage.get_article(aid, 'published')
        self.assertEqual(pub['draft']['title'], '발행판')
        self.assertEqual(pub['revisionKind'], 'auto')        # 마지막 저장본과 다른 판을 연 것 → 화면이 알린다
        self.assertFalse(pub['editedAfterPublish'])
        self.assertEqual(pub['lastManual']['title'], '저장판')

    def test_open_errors(self):
        aid = save('manual')['articleId']
        with self.assertRaises(RequestError) as e:
            storage.get_article(aid, 'published')
        self.assertEqual(e.exception.status, 404)
        with self.assertRaises(RequestError):
            storage.get_article(aid, 'other')
        with self.assertRaises(RequestError):
            storage.get_article('../x', 'saved')

    def test_latest_article_reports_publish_state(self):
        aid = publish(title='발행판')['articleId']
        latest = storage.latest_article()
        self.assertEqual(latest['published']['title'], '발행판')
        self.assertFalse(latest['editedAfterPublish'])
        save('auto', aid, title='고치는 중', status='송고됨')
        self.assertTrue(storage.latest_article()['editedAfterPublish'])


class FirstSavedTests(unittest.TestCase):
    """10-12 미리보기 시각: 입력 = 처음 수동 저장(송고 전) / 처음 송고, 업데이트 = 마지막 저장 / 송고본 최종 저장."""
    def setUp(self):
        use_temp_vault(self)

    def test_first_manual_save_time_is_kept(self):
        with mock.patch.object(storage, '_now', lambda: '2026-10-12T01:00:00+00:00'):
            aid = save('auto', title='임시')['articleId']
        self.assertIsNone(storage.latest_article()['firstSavedAt'])  # 자동 저장만으로는 '처음 저장'이 아니다
        with mock.patch.object(storage, '_now', lambda: '2026-10-12T02:00:00+00:00'):
            first = save('manual', aid, title='1차')
        with mock.patch.object(storage, '_now', lambda: '2026-10-12T03:00:00+00:00'):
            second = save('manual', aid, title='2차')
        self.assertEqual(first['firstSavedAt'], '2026-10-12T02:00:00+00:00')
        self.assertEqual((second['firstSavedAt'], second['savedAt']), ('2026-10-12T02:00:00+00:00', '2026-10-12T03:00:00+00:00'))
        self.assertEqual(storage.get_article(aid, 'saved')['firstSavedAt'], '2026-10-12T02:00:00+00:00')
        with mock.patch.object(storage, '_now', lambda: '2026-10-12T04:00:00+00:00'):
            sent = publish(aid, title='송고')
        self.assertEqual(sent['firstSavedAt'], '2026-10-12T02:00:00+00:00')
        self.assertEqual(sent['published']['firstPublishedAt'], '2026-10-12T04:00:00+00:00')

    def test_old_articles_get_first_saved_from_history(self):
        aid = save('manual', title='옛 기사')['articleId']
        with vault.connect() as db:
            db.execute('DELETE FROM article_first_saved')
            db.execute('UPDATE article_revisions SET created_at = ?', ('2026-10-07T10:51:04+00:00',))
        self.assertEqual(storage.latest_article()['firstSavedAt'], '2026-10-07T10:51:04+00:00')


if __name__ == '__main__':
    unittest.main()
