"""암호화 로컬 저장소(core/vault.py): 평문이 파일에 없고, 틀린 키·없는 키로는 열리지 않는다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402


REAL_DEVICE_KEY = vault._device_key  # setUp 이 덮어쓰기 전의 원본


class VaultTests(unittest.TestCase):
    def setUp(self):
        self.root = use_temp_vault(self)

    def disk_bytes(self):
        return b''.join(p.read_bytes() for p in self.root.glob('vault.db*'))

    def test_manuscript_and_source_are_not_plaintext_on_disk(self):
        storage.save_article({'draft': {'bodyHtml': '<p>극비원고본문</p>', 'title': '극비제목'}})
        storage.save_source('x.txt', '극비자료원본'.encode(), '극비자료텍스트')
        data = self.disk_bytes()
        for secret in ('극비원고본문', '극비제목', '극비자료원본', '극비자료텍스트'):
            self.assertNotIn(secret.encode(), data)
        self.assertNotIn(b'SQLite format 3', data[:16])

    def test_wrong_key_is_refused(self):
        storage.save_article({'draft': {'bodyHtml': '<p>a</p>'}})
        with mock.patch.object(vault, '_device_key', lambda: 'cd' * 32):
            with self.assertRaises(RequestError):
                storage.latest_article()

    def test_existing_db_without_key_does_not_create_new_key(self):
        storage.save_article({'draft': {'bodyHtml': '<p>a</p>'}})
        with mock.patch.object(vault.keyring, 'get_password', return_value=None),                 mock.patch.object(vault.keyring, 'set_password') as set_password:
            with self.assertRaises(RequestError):  # 키가 사라졌는데 새로 만들면 기존 원고가 영영 안 열린다
                REAL_DEVICE_KEY()
            set_password.assert_not_called()

    def test_first_run_creates_key_in_os_store(self):
        with mock.patch.object(vault.keyring, 'get_password', return_value=None),                 mock.patch.object(vault.keyring, 'set_password') as set_password:
            key = REAL_DEVICE_KEY()
        self.assertEqual(len(key), 64)
        set_password.assert_called_once_with(vault.SERVICE, vault.ACCOUNT, key)

    def test_unavailable_key_store_fails_closed(self):
        with mock.patch.object(vault.keyring, 'get_password', side_effect=RuntimeError('no backend')):
            with self.assertRaises(RequestError):
                REAL_DEVICE_KEY()

    def test_revisions_are_kept_and_capped(self):
        with mock.patch.object(storage, 'MAX_REVISIONS', 3):
            first = storage.save_article({'draft': {'bodyHtml': '<p>0</p>'}})['articleId']
            for i in range(1, 6):
                storage.save_article({'draft': {'bodyHtml': f'<p>{i}</p>', 'articleId': first}})
        with vault.connect() as db:
            rows = db.execute('SELECT revision_no FROM article_revisions WHERE article_id = ?', (first,)).fetchall()
        self.assertEqual(sorted(r[0] for r in rows), [4, 5, 6])
        self.assertEqual(storage.latest_article()['draft']['bodyHtml'], '<p>5</p>')

    def test_open_copy_is_removed_on_cleanup(self):
        source_id, _ = storage.save_source('원본.txt', b'secret', 'secret')
        with mock.patch.object(storage.os, 'startfile', create=True), mock.patch.object(storage.sys, 'platform', 'win32'):
            path = Path(storage.open_source({'sourceId': source_id})['path'])
        self.assertEqual(path.read_bytes(), b'secret')
        storage.cleanup_open()
        self.assertFalse(storage.OPEN_DIR.exists())
        storage.cleanup_open()  # 없어도 오류 없음

    def test_import_legacy_files_is_idempotent_and_keeps_originals(self):
        import json
        legacy = self.root / 'legacy'
        (legacy / 'articles').mkdir(parents=True)
        (legacy / 'sources' / ('ab' * 8)).mkdir(parents=True)
        ident = 'c' * 32
        (legacy / 'articles' / (ident + '.json')).write_text(json.dumps(
            {'articleId': ident, 'title': '옛 원고', 'bodyHtml': '<p>옛</p>', 'savedAt': 'x', 'sources': [{'id': 'ab' * 8}]}), encoding='utf-8')
        (legacy / 'articles' / 'broken.json').write_text('{', encoding='utf-8')
        (legacy / 'sources' / ('ab' * 8) / '원본.txt').write_bytes(b'raw')
        (legacy / 'sources' / ('ab' * 8) / 'text.txt').write_text('자료본문', encoding='utf-8')
        with mock.patch.object(storage, 'ARTICLES_DIR', legacy / 'articles'), mock.patch.object(storage, 'SOURCES_DIR', legacy / 'sources'):
            first = storage.import_legacy_files()
            second = storage.import_legacy_files()
        self.assertEqual((first['articles'], first['sources'], first['failed']), (1, 1, ['broken.json']))
        self.assertEqual((second['articles'], second['sources'], second['skipped']), (0, 0, 2))
        draft = storage.latest_article()['draft']
        self.assertEqual((draft['title'], draft['sources'][0]['text']), ('옛 원고', '자료본문'))
        self.assertEqual(storage.source_file('ab' * 8)[0], b'raw')
        self.assertTrue((legacy / 'articles' / (ident + '.json')).exists())  # 원본은 지우지 않는다

    def photo_draft(self, text='<p>본문</p>', raw=b'\xff\xd8photo-bytes' * 1000):
        import base64
        url = 'data:image/jpeg;base64,' + base64.b64encode(raw).decode()
        return {'bodyHtml': text, 'photos': [{'id': 'p1', 'data': url, 'original': url, 'caption': '캡션', 'url': 'blob:x'}]}, url

    def test_photos_are_stored_once_and_roundtrip_exactly(self):
        draft, url = self.photo_draft()
        saved = storage.save_article({'draft': draft})['articleId']
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM media').fetchone()[0], 1)  # data·original 이 같아 한 번만
            stored = db.execute('SELECT draft_json FROM article_revisions').fetchone()[0]
        self.assertNotIn('base64', stored)
        self.assertLess(len(stored), 1000)
        photo = storage.latest_article()['draft']['photos'][0]
        self.assertEqual((photo['data'], photo['original'], photo['caption'], photo['url']), (url, url, '캡션', 'blob:x'))
        draft2, _ = self.photo_draft(text='<p>고친 본문</p>')
        storage.save_article({'draft': dict(draft2, articleId=saved)})
        with vault.connect() as db:  # 본문만 고쳐도 사진은 복사되지 않는다
            self.assertEqual(db.execute('SELECT count(*) FROM media').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT count(*) FROM article_revisions').fetchone()[0], 2)

    def test_unreadable_photo_data_stays_inline(self):
        storage.save_article({'draft': {'bodyHtml': 'x', 'photos': [{'data': 'data:image/png;base64,@@@', 'original': 'https://e.com/a.jpg'}]}})
        photo = storage.latest_article()['draft']['photos'][0]
        self.assertEqual((photo['data'], photo['original']), ('data:image/png;base64,@@@', 'https://e.com/a.jpg'))

    def test_pack_existing_photos_migrates_old_revisions_once(self):
        import json
        draft, url = self.photo_draft()
        ident = 'd' * 32
        with vault.connect() as db:  # 예전 방식: 사진이 이력 안에 그대로
            db.execute('INSERT INTO articles VALUES (?, ?, ?, ?)', (ident, vault.WORKSPACE_ID, 't', 't'))
            db.execute('INSERT INTO article_revisions (article_id, revision_no, draft_json, created_at) VALUES (?, 1, ?, ?)',
                       (ident, json.dumps(dict(draft, articleId=ident, savedAt=None), ensure_ascii=False, sort_keys=True), 't'))
        self.assertEqual(storage.pack_existing_photos(), 1)
        self.assertEqual(storage.pack_existing_photos(), 0)
        self.assertEqual(storage.latest_article()['draft']['photos'][0]['data'], url)

    def test_revision_ids_are_stable_uuid_v5(self):
        from core import ids
        first = storage.save_article({'draft': {'bodyHtml': '<p>1</p>'}})['articleId']
        storage.save_article({'draft': {'articleId': first, 'bodyHtml': '<p>2</p>'}})
        with vault.connect() as db:
            rows = db.execute('SELECT revision_no, id FROM article_revisions WHERE article_id = ? ORDER BY revision_no', (first,)).fetchall()
        self.assertEqual(rows, [(1, ids.revision_uuid(first, 1)), (2, ids.revision_uuid(first, 2))])
        self.assertEqual(len({row[1] for row in rows}), 2)

    def test_old_vault_without_id_column_is_migrated(self):
        from core import ids
        ident = 'e' * 32
        with vault.connect() as db:  # 옛 모양(id 열 없음)으로 되돌린다
            db.execute('DROP INDEX article_revisions_id')
            db.execute('DROP TABLE article_revisions')
            db.execute('CREATE TABLE article_revisions (article_id TEXT NOT NULL REFERENCES articles(id), revision_no INTEGER NOT NULL, '
                       'draft_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (article_id, revision_no))')
            db.execute('INSERT INTO articles VALUES (?, ?, ?, ?)', (ident, vault.WORKSPACE_ID, 't', 't'))
            for number in (1, 2, 3):
                db.execute('INSERT INTO article_revisions VALUES (?, ?, ?, ?)', (ident, number, '{"bodyHtml": "<p>%d</p>"}' % number, 't'))
        for _ in range(2):  # 두 번 열어도 같다
            with vault.connect() as db:
                rows = db.execute('SELECT revision_no, id, draft_json FROM article_revisions WHERE article_id = ? ORDER BY revision_no', (ident,)).fetchall()
        self.assertEqual([row[:2] for row in rows], [(n, ids.revision_uuid(ident, n)) for n in (1, 2, 3)])
        self.assertEqual(rows[2][2], '{"bodyHtml": "<p>3</p>"}')  # 내용은 그대로
        with vault.connect() as db:
            self.assertTrue(db.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='article_revisions_id'").fetchone())

    def test_new_source_and_photo_ids_are_uuids_from_content(self):
        import re as _re
        from core import ids
        sid, _ = storage.save_source('a.txt', b'content', 'text')
        self.assertEqual(sid, ids.source_id(b'content'))
        self.assertRegex(sid, r'^[0-9a-f]{32}$')
        raw = b'PNG-bytes'
        url = 'data:image/png;base64,' + __import__('base64').b64encode(raw).decode()
        storage.save_article({'draft': {'bodyHtml': '<p>x</p>', 'photos': [{'id': 'p', 'data': url, 'original': url}]}})
        with vault.connect() as db:
            media_id = db.execute('SELECT id FROM media').fetchone()[0]
        self.assertEqual(media_id, ids.media_id('data:image/png;base64', raw))

    def test_same_source_saved_once(self):
        a, _ = storage.save_source('a.txt', b'same', 'v1')
        b, _ = storage.save_source('b.txt', b'same', 'v2')
        self.assertEqual(a, b)
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*), max(text) FROM sources').fetchone(), (1, 'v2'))


if __name__ == '__main__':
    unittest.main()
