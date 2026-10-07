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
        self.assertEqual(asset['id'], ids.legacy_uuid('media_asset', asset['object_ref'][len('media:'):]))
        self.assertEqual(asset['local_uri'], '/api/media-assets/%s/file' % asset['id'])

    def test_same_bytes_same_asset_and_stored_once(self):
        first, second = register(caption='처음'), register(caption='고친 설명', filename='b.png')
        self.assertEqual(first['id'], second['id'])
        self.assertEqual((second['caption'], second['filename']), ('고친 설명', 'b.png'))  # 설명만 갱신
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
