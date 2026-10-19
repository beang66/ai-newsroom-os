"""보관함 기사 공유: 만들기·초대·일반 액세스·만료·업데이트·중지, 받는 사람의 열기·가져오기.
Supabase(표·함수)는 supabase_article_shares.sql 의 권한 규칙을 그대로 따르는 가짜로, 백엔드 키는 공유 id 로 파생하는 가짜로 대체한다."""
import base64
import json
import unittest
import uuid
from datetime import datetime, timezone
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture
from core import auth, backend_proxy, cloud_backup, config, storage
from core.errors import RequestError
from core.integrations import supabase
from core.managers.share_manager import ShareManager
from core.managers.storage_manager import StorageManager

OWNER = ('owner-1', 'owner@example.test')
FRIEND = ('friend-1', 'friend@example.test')
STRANGER = ('stranger-1', 'stranger@example.test')
PHOTO = 'data:image/png;base64,iVBORw0KGgo='
DRAFT = {'title': '공유할 기사', 'subtitle': '부제', 'bodyHtml': '<p>본문</p>', 'content': '본문',
         'sources': [{'id': 'src1', 'name': '취재 메모', 'text': '비공개 취재 내용'}],
         'linkedInterviews': [{'id': 'aud1', 'transcript': '녹취 내용'}], 'cmsReceipt': {'id': 'cms-1'}}


def login(user):
    auth.set_session('tok-' + user[0], 'ref', 3600, email=user[1], user_id=user[0])


class FakeSession:
    def token(self):
        return auth.current_token()


class FakeSupabase:
    """article_shares / article_share_members 와 세 함수. 지금 로그인한 사람(auth)을 auth.uid()·jwt email 로 쓴다."""
    def __init__(self):
        self.shares, self.members = {}, []

    def install(self, test):
        for name in ('select', 'insert', 'update', 'delete', 'rpc'):
            patcher = mock.patch.object(supabase, name, getattr(self, name))
            patcher.start()
            test.addCleanup(patcher.stop)

    @staticmethod
    def me():
        status = auth.status()
        return status['userId'], (status['email'] or '').lower()

    def _owned(self):
        return [s for s in self.shares.values() if s['owner_id'] == self.me()[0]]

    @staticmethod
    def _match(row, filters):
        return all(str(row.get(k)) == v[3:] for k, v in filters.items() if v.startswith('eq.'))

    def select(self, table, params, token):
        filters = {k: v for k, v in params.items() if k not in ('select', 'order')}
        if table == 'article_shares':
            return [dict(s) for s in self._owned() if self._match(s, filters)]
        owned = {s['id'] for s in self._owned()}
        return [dict(m) for m in self.members if m['share_id'] in owned and self._match(m, filters)]

    def insert(self, table, rows, token):
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for row in rows:
            if table == 'article_shares':
                row = {'id': str(uuid.uuid4()), 'owner_id': self.me()[0], 'owner_email': self.me()[1], 'title': '', 'sealed': '',
                       'link_token': uuid.uuid4().hex + uuid.uuid4().hex, 'general_access': 'restricted', 'link_role': 'viewer',
                       'expires_at': None, 'updated_at': datetime.now(timezone.utc).isoformat(), **row}
                self.shares[row['id']] = row
            else:
                assert row['share_id'] in {s['id'] for s in self._owned()}, 'RLS: 남의 공유에 초대할 수 없다'
                self.members.append(dict(row))
            out.append(dict(row))
        return out

    def update(self, table, filters, row, token):
        targets = [s for s in self._owned() if self._match(s, filters)]
        for share in targets:
            share.update(row, updated_at=datetime.now(timezone.utc).isoformat())
        return [dict(s) for s in targets]

    def delete(self, table, filters, token):
        if table == 'article_shares':
            for share in [s for s in self._owned() if self._match(s, filters)]:
                del self.shares[share['id']]
                self.members = [m for m in self.members if m['share_id'] != share['id']]
        else:
            owned = {s['id'] for s in self._owned()}
            self.members = [m for m in self.members if not (m['share_id'] in owned and self._match(m, filters))]
        return []

    def role(self, share, link_token=None):
        uid, email = self.me()
        if share['owner_id'] == uid:
            return 'owner'
        if share['expires_at'] and datetime.fromisoformat(share['expires_at']) <= datetime.now(timezone.utc):
            return None
        member = next((m['role'] for m in self.members if m['share_id'] == share['id'] and m['email'] == email), None)
        by_link = share['link_role'] if share['general_access'] == 'link' and link_token == share['link_token'] else None
        if 'importer' in (member, by_link):
            return 'importer'
        return 'viewer' if (member or by_link) else None

    def rpc(self, name, args, token):
        if name == 'article_shares_received':
            uid, email = self.me()
            ids = {m['share_id']: m['role'] for m in self.members if m['email'] == email}
            return [{'id': s['id'], 'title': s['title'], 'owner_email': s['owner_email'], 'role': ids[s['id']],
                     'updated_at': s['updated_at'], 'expires_at': s['expires_at']}
                    for s in self.shares.values() if s['id'] in ids and s['owner_id'] != uid and self.role(s)]
        assert name == 'article_share_open'
        found = [s for s in self.shares.values()
                 if s['id'] == args['p_share'] or (args['p_share'] is None and s['link_token'] == args['p_token'])]
        return [{'id': s['id'], 'title': s['title'], 'owner_email': s['owner_email'], 'role': self.role(s, args['p_token']),
                 'sealed': s['sealed'], 'updated_at': s['updated_at'], 'expires_at': s['expires_at']}
                for s in found if self.role(s, args['p_token'])]


class ShareTests(unittest.TestCase):
    def setUp(self):
        login(OWNER)
        self.addCleanup(auth.clear)
        vault_fixture.use_temp_vault(self)
        self.server = FakeSupabase()
        self.server.install(self)
        patcher = mock.patch.object(backend_proxy, 'post', side_effect=self.fake_backend)
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = mock.patch.object(config, 'AI_BACKEND_URL', 'https://backend.example.test')
        patcher.start()
        self.addCleanup(patcher.stop)
        self.storage = StorageManager()
        self.shares = ShareManager(FakeSession(), self.storage)
        draft = dict(DRAFT, photos=[{'id': 'p1', 'data': PHOTO, 'caption': '사진 설명'}])
        self.article_id = self.storage.save_article({'draft': draft, 'kind': 'manual'})['articleId']

    def fake_backend(self, path, payload, *args, **kwargs):
        """백엔드 /ai/share-key 처럼: 권한(article_share_role)이 있을 때만 공유 id 로 파생한 키를 준다."""
        assert path == '/ai/share-key'
        share = self.server.shares.get(payload['shareId'])
        if not share or not self.server.role(share, payload.get('token')):
            raise RequestError('이 공유를 열 권한이 없어요.', 403)
        return {'key': 'derived-key-for-' + payload['shareId']}

    def start(self, **settings):
        return self.shares.save(self.article_id, {'generalAccess': 'restricted', 'linkRole': 'viewer', 'members': [], **settings})

    def test_start_uploads_only_the_article_encrypted(self):
        share = self.start()
        self.assertTrue(share['shared'])
        self.assertRegex(share['link'], r'^https://backend\.example\.test/s/[0-9a-f]{64}$')
        row = self.server.shares[share['shareId']]
        sealed = base64.b64decode(row['sealed'])
        self.assertNotIn('본문'.encode(), sealed, '서버에는 암호문만')
        payload = json.loads(cloud_backup.open_sealed('derived-key-for-' + share['shareId'], sealed))
        self.assertEqual(payload['draft']['title'], '공유할 기사')
        self.assertTrue(payload['draft']['photos'][0]['data'].startswith('data:image/'), '사진은 공유본에 들어간다')
        for private in ('sources', 'linkedInterviews', 'cmsReceipt', 'articleId'):
            self.assertNotIn(private, payload['draft'], '취재자료·녹취·송고 기록은 공유하지 않는다')
        self.assertEqual(row['title'], '공유할 기사')

    def test_invited_member_sees_and_opens_but_viewer_cannot_import(self):
        self.start(members=[{'email': 'Friend@Example.test', 'role': 'viewer'}, {'email': OWNER[1], 'role': 'viewer'}])
        self.assertEqual(self.shares.get(self.article_id)['members'], [{'email': FRIEND[1], 'role': 'viewer'}], '소문자로, 나 자신은 빼고')
        login(FRIEND)
        received = self.shares.received()['shares']
        self.assertEqual([(s['title'], s['ownerEmail'], s['role']) for s in received], [('공유할 기사', OWNER[1], 'viewer')])
        opened = self.shares.open({'shareId': received[0]['shareId']})
        self.assertEqual(opened['article']['title'], '공유할 기사')
        self.assertIn('본문', opened['article']['bodyHtml'])
        with self.assertRaises(RequestError) as caught:
            self.shares.import_article({'shareId': received[0]['shareId']})
        self.assertEqual(caught.exception.status, 403)

    def test_restricted_link_does_not_open_for_strangers_until_link_access(self):
        share = self.start()
        login(STRANGER)
        with self.assertRaises(RequestError) as caught:
            self.shares.open({'link': share['link']})
        self.assertEqual(caught.exception.code, 'SHARE_NOT_FOUND')
        login(OWNER)
        self.shares.save(self.article_id, {'generalAccess': 'link', 'linkRole': 'importer', 'members': []})
        login(STRANGER)
        self.assertEqual(self.shares.open({'link': '링크: ' + share['link'] + ' 확인'})['share']['role'], 'importer', '붙여 넣은 글에서 토큰을 찾는다')
        self.assertEqual(self.shares.received()['shares'], [], '링크로 연 공유는 초대 목록에 없다')

    def test_import_copies_article_into_my_library_as_new_article(self):
        share = self.start(members=[{'email': FRIEND[1], 'role': 'importer'}])
        login(FRIEND)
        result = self.shares.import_article({'shareId': share['shareId']})
        self.assertNotEqual(result['articleId'], self.article_id, '새 기사로 복사된다')
        draft = self.storage.get_article(result['articleId'], 'saved')['draft']
        self.assertEqual((draft['title'], draft['subtitle']), ('공유할 기사', '부제'))
        self.assertTrue(draft['photos'][0]['data'].startswith('data:image/'))
        self.assertNotIn('sources', draft)

    def test_refresh_uploads_latest_saved_version(self):
        share = self.start(members=[{'email': FRIEND[1], 'role': 'viewer'}])
        self.storage.save_article({'draft': dict(DRAFT, articleId=self.article_id, title='고친 제목'), 'kind': 'manual'})
        self.shares.save(self.article_id, {'generalAccess': 'restricted', 'linkRole': 'viewer', 'members': share['members']})
        login(FRIEND)
        self.assertEqual(self.shares.open({'shareId': share['shareId']})['article']['title'], '공유할 기사', '설정만 바꾸면 공유본은 그대로')
        login(OWNER)
        self.shares.save(self.article_id, {'generalAccess': 'restricted', 'linkRole': 'viewer', 'members': share['members'], 'refresh': True})
        login(FRIEND)
        self.assertEqual(self.shares.open({'shareId': share['shareId']})['article']['title'], '고친 제목')

    def test_expired_and_stopped_shares_do_not_open(self):
        share = self.start(members=[{'email': FRIEND[1], 'role': 'viewer'}], expiresInDays=7)
        self.assertIsNotNone(share['expiresAt'])
        self.server.shares[share['shareId']]['expires_at'] = '2000-01-01T00:00:00+00:00'
        login(FRIEND)
        self.assertEqual(self.shares.received()['shares'], [])
        with self.assertRaises(RequestError):
            self.shares.open({'shareId': share['shareId']})
        login(OWNER)
        self.assertEqual(self.shares.stop(self.article_id), {'shared': False})
        self.assertEqual(self.shares.get(self.article_id), {'shared': False})
        self.assertEqual(self.server.members, [], '초대도 함께 지운다')

    def test_settings_are_validated(self):
        for bad in ({'generalAccess': 'public'}, {'linkRole': 'editor'}, {'expiresInDays': 3},
                    {'members': [{'email': 'not-an-email', 'role': 'viewer'}]}, {'members': [{'email': 'a@b.co', 'role': 'owner'}]}):
            with self.assertRaises(RequestError):
                self.shares.save(self.article_id, {'generalAccess': 'restricted', 'linkRole': 'viewer', 'members': [], **bad})
        self.assertEqual(self.server.shares, {}, '잘못된 설정으로는 공유를 만들지 않는다')
        with self.assertRaises(RequestError):
            self.shares.open({'link': 'https://example.test/s/짧은값'})

    def test_too_large_snapshot_leaves_no_empty_share(self):
        with mock.patch('core.managers.share_manager.MAX_PAYLOAD', 10):
            with self.assertRaises(RequestError) as caught:
                self.start()
        self.assertEqual(caught.exception.status, 413)
        self.assertEqual(self.server.shares, {}, '공유본을 못 올리면 빈 공유를 남기지 않는다')

    def test_needs_login(self):
        auth.clear()
        with self.assertRaises(RequestError) as caught:
            self.shares.received()
        self.assertEqual(caught.exception.code, 'AUTH_REQUIRED')


if __name__ == '__main__':
    unittest.main()
