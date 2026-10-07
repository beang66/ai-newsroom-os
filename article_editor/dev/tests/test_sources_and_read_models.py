"""취재자료 목록·삭제(경고 후 강제 삭제)와 읽기 모델(기사 목록·knowledge-map): core/sources.py, core/read_models.py."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import ids, read_models, sources, storage  # noqa: E402
from core.errors import RequestError  # noqa: E402


def article(source_ids=(), **fields):
    base = {'bodyHtml': '<p>x</p>', 'content': 'x', 'title': '제목', 'sources': [{'id': i, 'name': i + '.txt'} for i in source_ids]}
    return {'draft': dict(base, **fields)}


class SourceApiTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.a, _ = storage.save_source('보고서.pdf', b'raw-a', '보고서 본문')
        self.b, _ = storage.save_source('메모.txt', b'raw-b', '메모')

    def test_list_and_get_have_size_chars_and_usage(self):
        aid = storage.save_article(article([self.a], title='쓰는 기사'))['articleId']
        items = {i['id']: i for i in sources.list_sources()['sources']}
        self.assertEqual(set(items), {self.a, self.b})
        self.assertEqual((items[self.a]['name'], items[self.a]['format'], items[self.a]['size'], items[self.a]['chars']), ('보고서.pdf', 'pdf', 5, 6))
        self.assertEqual(items[self.a]['usedBy'], [{'articleId': aid, 'title': '쓰는 기사'}])
        self.assertEqual(items[self.b]['usedBy'], [])
        self.assertEqual(sources.get_source(self.a)['id'], self.a)

    def test_usage_follows_latest_revision_only(self):
        aid = storage.save_article(article([self.a]))['articleId']
        storage.save_article(article([], articleId=aid))  # 새 저장본에서 자료를 뺐다
        self.assertEqual(sources.get_source(self.a)['usedBy'], [])

    def test_delete_unused_source(self):
        self.assertEqual(sources.delete_source(self.b)['deleted'], True)
        with self.assertRaises(RequestError) as error:
            sources.get_source(self.b)
        self.assertEqual((error.exception.status, error.exception.code), (404, 'NOT_FOUND'))

    def test_delete_in_use_warns_then_force_deletes(self):
        aid = storage.save_article(article([self.a], title='쓰는 기사'))['articleId']
        with self.assertRaises(RequestError) as error:
            sources.delete_source(self.a)
        self.assertEqual((error.exception.status, error.exception.code), (409, 'SOURCE_IN_USE'))
        self.assertEqual(error.exception.details, {'usedBy': [{'articleId': aid, 'title': '쓰는 기사'}]})
        self.assertEqual(sources.get_source(self.a)['id'], self.a)  # 경고만 했고 지우지 않았다
        result = sources.delete_source(self.a, force=True)
        self.assertEqual(result['wasUsedBy'], [{'articleId': aid, 'title': '쓰는 기사'}])
        with self.assertRaises(RequestError):
            sources.get_source(self.a)
        self.assertEqual(storage.latest_article()['draft']['sources'][0]['id'], self.a)  # 기사 안 참조는 남는다("삭제된 자료"로 표시 가능)

    def test_delete_removes_its_embedding_vectors_but_keeps_shared_ones(self):
        from core import vault
        with vault.connect() as db:
            for key in ('only-a', 'shared', 'only-b', 'unrelated-cache'):
                db.execute('INSERT INTO embedding_vectors VALUES (?, ?, ?)', (key, b'v', 'test'))
            for source_id, ordinal, key in ((self.a, 0, 'only-a'), (self.a, 1, 'shared'), (self.b, 0, 'shared'), (self.b, 1, 'only-b')):
                db.execute('INSERT INTO source_chunks VALUES (?, ?, ?, ?, ?, ?)', (source_id, ordinal, vault.WORKSPACE_ID, key, '{}', key))
        sources.delete_source(self.a)
        with vault.connect() as db:
            left = {row[0] for row in db.execute('SELECT key FROM embedding_vectors')}
            chunks = db.execute('SELECT count(*) FROM source_chunks WHERE source_id = ?', (self.a,)).fetchone()[0]
        self.assertEqual(left, {'shared', 'only-b', 'unrelated-cache'})
        self.assertEqual(chunks, 0)

    def test_bad_ids_and_force_type(self):
        for bad in ('x', 'A' * 32, '../' * 8):
            with self.assertRaises(RequestError):
                sources.get_source(bad)
        with self.assertRaises(RequestError):
            sources.delete_source(self.a, force='yes')
        with self.assertRaises(RequestError) as error:
            sources.delete_source('a' * 32)
        self.assertEqual(error.exception.status, 404)


class ReadModelTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def test_empty(self):
        out = read_models.knowledge_map()
        self.assertEqual((out['articles'], out['sources'], out['snapshots'], out['edges'], out['entities']), ([], [], [], [], []))
        self.assertEqual(read_models.list_articles(), {'articles': []})

    def test_map_has_real_edges_only_and_uuid_ids(self):
        s1, _ = storage.save_source('a.txt', b'a', 'a')
        s2, _ = storage.save_source('b.txt', b'b', 'b')  # 어떤 기사도 쓰지 않는 자료
        aid = storage.save_article(article([s1], title='기사 하나'))['articleId']
        storage.save_article(article([s1], articleId=aid, title='기사 하나(수정)'))
        snapshot = storage.create_snapshot(aid)
        out = read_models.knowledge_map()
        art = ids.uuid_text(aid)
        self.assertEqual([a['id'] for a in out['articles']], [art])
        self.assertEqual((out['articles'][0]['title'], out['articles'][0]['revision_count']), ('기사 하나(수정)', 2))
        self.assertEqual({s['id'] for s in out['sources']}, {ids.uuid_text(s1), ids.uuid_text(s2)})
        by_id = {s['id']: s for s in out['sources']}
        self.assertEqual(by_id[ids.uuid_text(s1)]['used_by'], [art])
        self.assertEqual(by_id[ids.uuid_text(s2)]['used_by'], [])
        self.assertEqual(sorted((e['relation'], e['source'], e['target']) for e in out['edges']),
                         sorted([('uses_source', art, ids.uuid_text(s1)), ('has_snapshot', art, snapshot['id'])]))
        self.assertEqual(out['snapshots'][0]['id'], snapshot['id'])
        self.assertNotIn('embedding', str(out).lower())  # 임베딩은 싣지 않는다

    def test_deleted_source_leaves_no_dangling_edge(self):
        s1, _ = storage.save_source('a.txt', b'a', 'a')
        storage.save_article(article([s1]))
        sources.delete_source(s1, force=True)
        out = read_models.knowledge_map()
        self.assertEqual([e for e in out['edges'] if e['relation'] == 'uses_source'], [])

    def test_list_articles_newest_first(self):
        first = storage.save_article(article(title='먼저'))['articleId']
        second = storage.save_article(article(title='나중'))['articleId']
        titles = [a['title'] for a in read_models.list_articles()['articles']]
        self.assertEqual(titles, ['나중', '먼저'])
        self.assertEqual({a['id'] for a in read_models.list_articles()['articles']}, {ids.uuid_text(first), ids.uuid_text(second)})


if __name__ == '__main__':
    unittest.main()
