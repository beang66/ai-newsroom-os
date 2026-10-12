"""2026-10-10 수동 저장: 저장 버튼(manual)만 저장 이력·보관소에 남고, 자동 저장(auto)은 작업본 한 칸을 덮어쓴다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import read_models, storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402


def save(kind, article_id=None, **fields):
    d = dict({'bodyHtml': '<p>x</p>', 'title': '제목', 'content': '본문'}, **fields)
    if article_id:
        d['articleId'] = article_id
    return storage.save_article({'draft': d, 'kind': kind})


def rows(aid):
    with vault.connect() as db:
        return db.execute('SELECT revision_no, kind FROM article_revisions WHERE article_id = ? ORDER BY revision_no', (aid,)).fetchall()


class ManualSaveTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def test_auto_saves_overwrite_one_working_copy(self):
        aid = save('auto', content='하나')['articleId']
        save('auto', aid, content='둘')
        save('auto', aid, content='셋')
        self.assertEqual(rows(aid), [(1, 'auto')])
        self.assertEqual(storage.list_revisions(aid)['revisions'], [])  # 저장 이력에는 안 보임

    def test_manual_save_becomes_history_and_archive(self):
        aid = save('auto', content='쓰는 중', title='임시 제목')['articleId']
        save('manual', aid, content='1차 저장', title='제목 1')
        save('auto', aid, content='1차 뒤 고침', title='제목 1-수정')
        self.assertEqual(rows(aid), [(1, 'manual'), (2, 'auto')])
        self.assertEqual([r['title'] for r in storage.list_revisions(aid)['revisions']], ['제목 1'])
        listed = read_models.list_articles()['articles'][0]
        self.assertEqual(listed['title'], '제목 1')                 # 보관소 = 마지막 수동 저장본
        self.assertTrue(listed['unsaved_changes'])                 # 그 뒤 임시 저장이 있음
        latest = storage.latest_article()
        self.assertEqual(latest['draft']['title'], '제목 1-수정')  # 앱을 다시 열면 작업본으로 이어서
        self.assertEqual(latest['revisionKind'], 'auto')
        self.assertEqual(latest['lastManual']['title'], '제목 1')
        save('manual', aid, content='2차 저장', title='제목 2')
        self.assertEqual(rows(aid), [(1, 'manual'), (2, 'manual')])
        self.assertFalse(read_models.list_articles()['articles'][0]['unsaved_changes'])

    def test_manual_same_as_last_manual_drops_working_copy(self):
        aid = save('manual', content='같은 본문')['articleId']
        save('auto', aid, content='잠깐 고침')
        save('manual', aid, content='같은 본문')  # 되돌려 놓고 저장 → 새 이력 없이 작업본만 정리
        self.assertEqual(rows(aid), [(1, 'manual')])

    def test_without_kind_keeps_old_behaviour(self):
        aid = storage.save_article({'draft': {'bodyHtml': '<p>a</p>', 'content': 'a'}})['articleId']
        storage.save_article({'draft': {'articleId': aid, 'bodyHtml': '<p>b</p>', 'content': 'b'}})
        self.assertEqual(rows(aid), [(1, 'manual'), (2, 'manual')])

    def test_auto_never_overwrites_a_snapshot_working_copy(self):
        aid = save('auto', content='변환 전')['articleId']
        storage.create_snapshot(aid)  # 카드뉴스·플랫폼 변환이 이 작업본을 고정본으로 가리킨다
        save('auto', aid, content='변환 뒤 고침')
        self.assertEqual(rows(aid), [(1, 'auto'), (2, 'auto')])

    def test_replace_latest_keeps_a_manual_save_manual(self):
        aid = save('manual', content='1차')['articleId']
        storage.save_article({'draft': {'articleId': aid, 'bodyHtml': '<p>x</p>', 'content': '덮어씀'}, 'kind': 'auto', 'replaceLatest': True})
        self.assertEqual(rows(aid), [(1, 'manual')])  # 자동 저장으로 덮어써도 저장 이력에서 사라지지 않는다

    def test_bad_kind_rejected(self):
        with self.assertRaises(RequestError):
            save('draft')


class LegacyHistoryTests(unittest.TestCase):
    """10-12: 수동 저장 도입 전(저장할 때마다 이력이 남던 때)의 옛 이력 정리."""
    def setUp(self):
        use_temp_vault(self)

    def _old(self, aid, n, title):
        with vault.connect() as db:
            db.execute('INSERT OR IGNORE INTO articles VALUES (?, ?, ?, ?)', (aid, vault.WORKSPACE_ID, '2026-10-07T00:00:00+00:00', '2026-10-07T00:00:00+00:00'))
            db.execute("INSERT INTO article_revisions (article_id, revision_no, draft_json, created_at, id, kind) VALUES (?, ?, ?, ?, ?, 'manual')",
                       (aid, n, '{"bodyHtml": "<p>x</p>", "title": "%s"}' % title, '2026-10-0%dT01:00:00+00:00' % (7 + n % 3), 'r-%s-%d' % (aid[:6], n)))

    def test_prune_keeps_saves_after_manual_save_started(self):
        aid = 'a' * 32
        for n in range(1, 6):
            self._old(aid, n, '옛 자동 %d' % n)
        save('manual', aid, title='수동 저장')
        listed = storage.list_revisions(aid)
        self.assertEqual(listed['legacyCount'], 5)
        self.assertEqual(storage.prune_legacy_revisions(aid)['deleted'], 5)
        after = storage.list_revisions(aid)
        self.assertEqual([r['title'] for r in after['revisions']], ['수동 저장'])
        self.assertEqual(after['legacyCount'], 0)

    def test_prune_keeps_last_old_one_when_nothing_newer(self):
        aid = 'b' * 32
        for n in range(1, 4):
            self._old(aid, n, '옛 자동 %d' % n)
        self.assertEqual(storage.prune_legacy_revisions(aid)['deleted'], 2)
        self.assertEqual([r['title'] for r in storage.list_revisions(aid)['revisions']], ['옛 자동 3'])


if __name__ == '__main__':
    unittest.main()
