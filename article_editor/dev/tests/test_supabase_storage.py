"""Supabase Storage REST 호출의 주소·헤더·오류 처리(네트워크는 대체)."""
import io
import json
import unittest
import urllib.error
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture  # noqa: F401
from core import config
from core.errors import RequestError
from core.integrations import supabase


class FakeResponse:
    def __init__(self, body=b''):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def http_error(code, body=None):
    return urllib.error.HTTPError('http://x', code, 'err', {}, io.BytesIO(json.dumps(body or {}).encode()))


class StorageTests(unittest.TestCase):
    def setUp(self):
        for name, value in (('SUPABASE_URL', 'https://proj.supabase.co'), ('SUPABASE_ANON_KEY', 'anon')):
            patcher = mock.patch.object(config, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_upload_url_headers_and_download_missing_is_none(self):
        seen = {}

        def fake(request, timeout=None):
            seen.update(url=request.full_url, method=request.get_method(), headers={k.lower(): v for k, v in request.header_items()}, data=request.data)
            return FakeResponse(b'{}')
        with mock.patch('urllib.request.urlopen', fake):
            supabase.storage_upload('transfers', 'user-1/transfer.db', b'cipher', 'jwt')
        self.assertEqual(seen['url'], 'https://proj.supabase.co/storage/v1/object/transfers/user-1/transfer.db')
        self.assertEqual((seen['method'], seen['data']), ('POST', b'cipher'))
        self.assertEqual(seen['headers']['authorization'], 'Bearer jwt')
        self.assertEqual(seen['headers']['x-upsert'], 'true')
        with mock.patch('urllib.request.urlopen', side_effect=http_error(400, {'message': 'Object not found'})):
            self.assertIsNone(supabase.storage_download('transfers', 'user-1/transfer.db', 'jwt'))

    def test_info_finds_the_object_and_errors_are_korean(self):
        rows = json.dumps([{'name': 'other.db'}, {'name': 'transfer.db', 'updated_at': '2026-10-13T01:00:00Z', 'metadata': {'size': 1234}}]).encode()
        with mock.patch('urllib.request.urlopen', return_value=FakeResponse(rows)):
            self.assertEqual(supabase.storage_info('transfers', 'user-1/transfer.db', 'jwt'), {'bytes': 1234, 'updatedAt': '2026-10-13T01:00:00Z'})
        with mock.patch('urllib.request.urlopen', side_effect=http_error(404, {'message': 'Bucket not found'})):
            with self.assertRaises(RequestError) as no_bucket:
                supabase.storage_info('transfers', 'user-1/transfer.db', 'jwt')
        self.assertIn('저장 공간', no_bucket.exception.message)
        with mock.patch('urllib.request.urlopen', side_effect=http_error(403, {'message': 'new row violates row-level security policy'})):
            with self.assertRaises(RequestError) as denied:
                supabase.storage_upload('transfers', 'x/transfer.db', b'a', 'jwt')
        self.assertIn('권한', denied.exception.message)
        with mock.patch('urllib.request.urlopen', side_effect=http_error(413)):
            with self.assertRaises(RequestError) as big:
                supabase.storage_upload('transfers', 'x/transfer.db', b'a', 'jwt')
        self.assertEqual(big.exception.code, 'TRANSFER_TOO_LARGE')


if __name__ == '__main__':
    unittest.main()
