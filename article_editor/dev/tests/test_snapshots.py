"""고정본(ArticleSnapshot)·낙관적 동시성(expectedRevisionNo) — core/storage.py.
고정본은 이력 내용을 복사해 두고(이력 정리와 무관), 트리거 때문에 고치거나 지울 수 없다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import hashlib
import json
import sys
import unittest
import uuid
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import ids, storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402

BODY1 = '<p>첫 문단</p><p>둘째 <s>지운 말</s> 문단</p><figure><img src="x"><figcaption>사진 설명</figcaption></figure>'


def draft(article_id=None, **fields):
    base = {'bodyHtml': '<p>x</p>', 'title': '제목', 'content': '본문'}
    if article_id:
        base['articleId'] = article_id
    return {'draft': dict(base, **fields)}


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.aid = storage.save_article(draft(title='제목1', bodyHtml=BODY1))['articleId']
        storage.save_article(draft(self.aid, title='제목2', bodyHtml='<p>둘째 저장</p>'))

    def test_latest_revision_is_copied_into_the_snapshot(self):
        snap = storage.create_snapshot(self.aid)
        self.assertEqual((snap['article_id'], snap['revision_no'], snap['title'], snap['body_html']),
                         (self.aid, 2, '제목2', '<p>둘째 저장</p>'))
        self.assertEqual(snap['revision_id'], ids.revision_uuid(self.aid, 2))
        self.assertEqual(snap['workspace_id'], vault.WORKSPACE_ID)
        self.assertEqual(uuid.UUID(snap['id']).version, 4)
        self.assertEqual(storage.get_snapshot(snap['id']), snap)

    def test_explicit_revision_and_body_text_excludes_strike_and_captions(self):
        snap = storage.create_snapshot(self.aid, ids.revision_uuid(self.aid, 1))
        self.assertEqual((snap['revision_no'], snap['title'], snap['body_html']), (1, '제목1', BODY1))
        self.assertEqual(snap['body_text'], '첫 문단\n둘째  문단')

    def test_creation_is_idempotent(self):
        first = storage.create_snapshot(self.aid)
        again = storage.create_snapshot(self.aid, ids.revision_uuid(self.aid, 2).upper())  # 같은 이력(대문자 표기도 같은 ID)
        self.assertEqual(again, first)
        other = storage.create_snapshot(self.aid, ids.revision_uuid(self.aid, 1))
        self.assertNotEqual(other['id'], first['id'])
        self.assertEqual(len(storage.list_snapshots(self.aid)['snapshots']), 2)

    def test_content_hash_recipe_is_reproducible(self):
        snap = storage.create_snapshot(self.aid)
        canonical = json.dumps({'body_html': '<p>둘째 저장</p>', 'title': '제목2'}, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        self.assertEqual(canonical, '{"body_html":"<p>둘째 저장</p>","title":"제목2"}')
        self.assertEqual(snap['content_hash'], hashlib.sha256(canonical.encode('utf-8')).hexdigest())
        self.assertEqual(storage.content_hash('제목2', '<p>둘째 저장</p>'), snap['content_hash'])
        # 고정 벡터: 레시피가 바뀌면 여기서 깨진다
        self.assertEqual(storage.content_hash('제목', '<p>본문</p>'),
                         hashlib.sha256('{"body_html":"<p>본문</p>","title":"제목"}'.encode('utf-8')).hexdigest())

    def test_snapshots_cannot_be_updated_or_deleted(self):
        snap = storage.create_snapshot(self.aid)
        for sql, args in (('UPDATE article_snapshots SET title = ? WHERE id = ?', ('바뀜', snap['id'])),
                          ('DELETE FROM article_snapshots WHERE id = ?', (snap['id'],)),
                          ('DELETE FROM article_snapshots', ())):
            with self.subTest(sql=sql), self.assertRaisesRegex(Exception, 'immutable'):
                with vault.connect() as db:
                    db.execute(sql, args)
        self.assertEqual(storage.get_snapshot(snap['id']), snap)

    def test_schema_is_idempotent_and_keeps_existing_snapshots(self):
        snap = storage.create_snapshot(self.aid)
        for _ in range(2):  # connect() 마다 SCHEMA 가 다시 돈다 — 옛 저장소에는 표·트리거만 새로 생긴다
            with vault.connect() as db:
                db.executescript(vault.SCHEMA)
                triggers = db.execute("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'article_snapshots'").fetchall()
        self.assertEqual(sorted(t[0] for t in triggers), ['article_snapshots_no_delete', 'article_snapshots_no_update'])
        self.assertEqual(storage.get_snapshot(snap['id']), snap)

    def test_snapshot_survives_pruning_of_its_revision(self):
        snap = storage.create_snapshot(self.aid, ids.revision_uuid(self.aid, 1))
        with mock.patch.object(storage, 'MAX_REVISIONS', 2):
            for i in range(3):
                storage.save_article(draft(self.aid, title=f'새 {i}', bodyHtml=f'<p>{i}</p>'))
        self.assertNotIn(1, [r['revisionNo'] for r in storage.list_revisions(self.aid)['revisions']])  # 원래 이력은 정리됨
        self.assertEqual(storage.get_snapshot(snap['id']), snap)
        self.assertEqual(storage.list_snapshots(self.aid)['snapshots'][0]['id'], snap['id'])

    def test_unknown_or_foreign_revision_is_not_found(self):
        other = storage.save_article(draft(title='다른 원고'))['articleId']
        for article_id, revision_id in ((self.aid, str(uuid.uuid4())), (self.aid, ids.revision_uuid(other, 1)),
                                        (other, ids.revision_uuid(self.aid, 1)), ('0' * 32, None)):
            with self.subTest(article_id=article_id, revision_id=revision_id), self.assertRaises(RequestError) as ctx:
                storage.create_snapshot(article_id, revision_id)
            self.assertEqual((ctx.exception.status, ctx.exception.code), (404, 'NOT_FOUND'))
        with self.assertRaises(RequestError) as ctx:
            storage.get_snapshot(str(uuid.uuid4()))
        self.assertEqual((ctx.exception.status, ctx.exception.code), (404, 'NOT_FOUND'))
        with self.assertRaises(RequestError) as ctx:
            storage.create_snapshot(self.aid, 'not-a-uuid')
        self.assertEqual(ctx.exception.status, 400)

    def test_list_is_newest_first_without_bodies(self):
        older = storage.create_snapshot(self.aid, ids.revision_uuid(self.aid, 1))
        with mock.patch.object(storage, '_now', return_value='2999-01-01T00:00:00'):
            newer = storage.create_snapshot(self.aid)
        items = storage.list_snapshots(self.aid)['snapshots']
        self.assertEqual([i['id'] for i in items], [newer['id'], older['id']])
        self.assertNotIn('body_html', items[0])
        self.assertNotIn('body_text', items[0])
        self.assertEqual(items[1]['excerpt'], older['body_text'][:120])


class ExpectedRevisionTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def conflict(self, data):
        with self.assertRaises(RequestError) as ctx:
            storage.save_article(data)
        return ctx.exception

    def test_zero_creates_a_new_article_only_once(self):
        aid = uuid.uuid4().hex
        saved = storage.save_article(dict(draft(aid), expectedRevisionNo=0))
        self.assertEqual(saved['revisionNo'], 1)
        error = self.conflict(dict(draft(aid, title='또'), expectedRevisionNo=0))
        self.assertEqual((error.status, error.code), (409, 'REVISION_CONFLICT'))
        self.assertEqual(storage.save_article(dict(draft(title='새 ID'), expectedRevisionNo=0))['revisionNo'], 1)

    def test_match_saves_and_mismatch_is_rejected_without_changes(self):
        aid = storage.save_article(draft(title='1'))['articleId']
        self.assertEqual(storage.save_article(dict(draft(aid, title='2'), expectedRevisionNo=1))['revisionNo'], 2)
        error = self.conflict(dict(draft(aid, title='낡은 화면'), expectedRevisionNo=1))
        self.assertEqual((error.status, error.code), (409, 'REVISION_CONFLICT'))
        self.assertIn('2번', error.message)
        self.assertEqual(storage.latest_article()['draft']['title'], '2')
        self.assertEqual(len(storage.list_revisions(aid)['revisions']), 2)

    def test_omitted_keeps_old_behaviour(self):
        aid = storage.save_article(draft(title='1'))['articleId']
        self.assertEqual(storage.save_article(draft(aid, title='2'))['revisionNo'], 2)
        self.assertEqual(storage.save_article(dict(draft(aid, title='3'), expectedRevisionNo=None))['revisionNo'], 3)

    def test_invalid_values_are_bad_requests(self):
        for bad in (-1, '1', 1.0, True):
            with self.subTest(bad=bad):
                error = self.conflict(dict(draft(), expectedRevisionNo=bad))
                self.assertEqual((error.status, error.code), (400, None))


class RequestErrorCompatTests(unittest.TestCase):
    def test_code_is_optional_and_positional_args_unchanged(self):
        self.assertEqual((RequestError('x').status, RequestError('x').code), (400, None))
        self.assertEqual((RequestError('x', 404).status, RequestError('x', 404).code), (404, None))
        self.assertEqual(RequestError('x', 409, code='REVISION_CONFLICT').code, 'REVISION_CONFLICT')


class FactcheckSnapshotInputTests(unittest.TestCase):
    """팩트체크는 snapshotId 를 받으면 고정본이 있는지 확인하고 응답에 싣는다(없으면 404, 안 보내면 예전과 같음)."""

    def setUp(self):
        use_temp_vault(self)

    def test_snapshot_id_is_validated_and_echoed(self):
        from unittest import mock
        from core.managers.ai_manager import AIManager
        aid = storage.save_article({'draft': {'bodyHtml': '<p>본문</p>', 'content': '본문', 'title': '제목'}})['articleId']
        snapshot = storage.create_snapshot(aid)
        manager = AIManager()
        with mock.patch.object(AIManager, '_factcheck_run', return_value={'results': []}):
            self.assertEqual(manager.factcheck_run({'snapshotId': snapshot['id']})['snapshotId'], snapshot['id'])
            self.assertNotIn('snapshotId', manager.factcheck_run({}))
            with self.assertRaises(RequestError) as error:
                manager.factcheck_run({'snapshotId': '00000000-0000-4000-8000-000000000000'})
            self.assertEqual(error.exception.status, 404)
            with self.assertRaises(RequestError) as error:
                manager.factcheck_run({'snapshotId': 'nope'})
            self.assertEqual(error.exception.status, 400)


if __name__ == '__main__':
    unittest.main()
