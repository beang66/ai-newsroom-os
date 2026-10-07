"""MediaAsset 등록·조회(core/media_assets.py): 같은 바이트는 같은 자산, 바이트는 암호화 media 표에 한 번만."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import base64
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import ids, media_assets, storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402

RAW = b'\x89PNG\r\n\x1a\nfake-image-bytes'
URL = 'data:image/png;base64,' + base64.b64encode(RAW).decode()


def register(**fields):
    return media_assets.register_media_asset(dict({'kind': 'image', 'mime_type': 'image/png', 'data': URL}, **fields))


class MediaAssetTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def test_register_returns_contract_shape(self):
        asset = register(filename='a.png', caption='현장 사진', generated=False)
        self.assertEqual((asset['kind'], asset['mime_type'], asset['filename'], asset['caption']), ('image', 'image/png', 'a.png', '현장 사진'))
        self.assertEqual((asset['byte_size'], asset['generated'], asset['workspace_id']), (len(RAW), False, vault.WORKSPACE_ID))
        self.assertTrue(asset['object_ref'].startswith('media:'))
        self.assertEqual(asset['id'], ids.uuid_text(asset['object_ref'][len('media:'):]))  # 사진 자체가 UUID — 별칭 없음
        self.assertEqual(asset['object_ref'][len('media:'):], ids.media_id('data:image/png;base64', RAW))
        self.assertEqual(asset['local_uri'], '/api/media-assets/%s/file' % asset['id'])

    def test_same_bytes_same_asset_and_stored_once(self):
        first, second = register(caption='처음', filename='a.png'), register(caption='다른 기사의 설명', filename='b.png')
        self.assertEqual(first['id'], second['id'])
        self.assertEqual((second['caption'], second['filename']), ('처음', 'a.png'))  # 기본 설명은 덮어쓰지 않는다
        self.assertEqual(first['created_at'], second['created_at'])
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM media').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT count(*) FROM media_assets').fetchone()[0], 1)

    def test_shares_bytes_with_draft_photos(self):
        saved = storage.save_article({'draft': {'bodyHtml': '<p>x</p>', 'photos': [{'id': 'p', 'data': URL, 'original': URL}]}})
        with vault.connect() as db:
            media_id = db.execute('SELECT id FROM media').fetchone()[0]
        asset = media_assets.register_media_asset({'kind': 'image', 'mime_type': 'image/png', 'object_ref': 'media:' + media_id})
        self.assertEqual(asset['byte_size'], len(RAW))
        self.assertEqual(register()['id'], asset['id'])  # 원고 사진 / 직접 등록 / 참조 등록이 모두 같은 자산
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM media').fetchone()[0], 1)
        self.assertTrue(saved['articleId'])

    def test_empty_default_caption_is_filled_once(self):
        register()
        self.assertEqual((register(caption='나중 설명', filename='c.png')['caption']), '나중 설명')
        self.assertEqual(register(caption='또 다른 설명')['caption'], '나중 설명')

    def test_generated_flag_never_turns_off(self):
        self.assertFalse(register(generated=False)['generated'])
        self.assertTrue(register(generated=True)['generated'])
        self.assertTrue(register(generated=False)['generated'])  # 다시 등록해도 AI 생성 표시는 남는다
        self.assertTrue(register()['generated'])

    def test_usages_carry_each_articles_own_caption_from_the_latest_revision(self):
        photo = lambda caption: [{'id': 'p1', 'data': URL, 'original': URL, 'caption': caption}]
        first = storage.save_article({'draft': {'bodyHtml': '<p>x</p>', 'title': '기사 A', 'photos': photo('시청 앞 집회')}})['articleId']
        second = storage.save_article({'draft': {'bodyHtml': '<p>y</p>', 'title': '기사 B', 'photos': photo('자료 사진')}})['articleId']
        storage.save_article({'draft': {'articleId': first, 'bodyHtml': '<p>x2</p>', 'title': '기사 A', 'photos': photo('집회 현장(수정)')}})
        storage.save_article({'draft': {'bodyHtml': '<p>z</p>', 'title': '사진 없는 기사'}})
        asset = register(caption='기본 설명')
        usages = sorted((u['articleId'], u['title'], u['photoId'], u['caption']) for u in asset['usages'])
        self.assertEqual(usages, sorted([(first, '기사 A', 'p1', '집회 현장(수정)'), (second, '기사 B', 'p1', '자료 사진')]))
        self.assertEqual(asset['caption'], '기본 설명')
        self.assertEqual(media_assets.get_media_asset(asset['id'])['usages'], asset['usages'])
        storage.save_article({'draft': {'articleId': second, 'bodyHtml': '<p>y2</p>', 'title': '기사 B'}})  # 최신본에서 사진을 뺌
        self.assertEqual([u['articleId'] for u in media_assets.get_media_asset(asset['id'])['usages']], [first])

    def test_get_and_file(self):
        asset = register()
        self.assertEqual(media_assets.get_media_asset(asset['id'])['id'], asset['id'])
        raw, mime = media_assets.media_asset_file(asset['id'])
        self.assertEqual((raw, mime), (RAW, 'image/png'))

    def test_errors(self):
        for fields, status in (({'kind': 'video'}, 400), ({'mime_type': 'image/svg+xml'}, 400), ({'data': 'data:image/jpeg;base64,QUJD'}, 400),
                               ({'data': 'data:image/png;base64,@@@'}, 400), ({'generated': 'yes'}, 400), ({'caption': 'x' * 3000}, 400),
                               ({'data': None, 'object_ref': 'media:' + 'a' * 32}, 400), ({'data': None, 'object_ref': 'file:///c:/x.png'}, 400)):
            with self.assertRaises(RequestError, msg=fields) as error:
                register(**fields)
            self.assertEqual(error.exception.status, status)
        with self.assertRaises(RequestError) as error:
            media_assets.get_media_asset(ids.legacy_uuid('media_asset', 'nope'))
        self.assertEqual((error.exception.status, error.exception.code), (404, 'NOT_FOUND'))
        with self.assertRaises(RequestError) as error:
            media_assets.get_media_asset('not-a-uuid')
        self.assertEqual(error.exception.status, 400)

    def test_too_large(self):
        big = 'data:image/png;base64,' + base64.b64encode(b'0' * (media_assets.MAX_BYTES + 1)).decode()
        with self.assertRaises(RequestError) as error:
            register(data=big)
        self.assertEqual(error.exception.status, 413)

    def test_bytes_are_encrypted_on_disk(self):
        marker = b'SECRET-PHOTO-BYTES-123456'
        register(data='data:image/png;base64,' + base64.b64encode(marker).decode())
        root = vault.DB_PATH.parent
        self.assertNotIn(marker, b''.join(p.read_bytes() for p in root.glob('vault.db*')))


if __name__ == '__main__':
    unittest.main()
