"""로그인 유지: 갱신 토큰만 저장하고, 앱을 열 때 되살리고, 거절되면 지우고, 로그아웃하면 지운다(Supabase·자격 증명 저장소는 대체)."""
import unittest
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture  # noqa: F401
from core import auth, saved_login
from core.errors import RequestError
from core.integrations import supabase
from core.managers import session_manager
from core.managers.session_manager import SessionManager

LOGIN = {'access_token': 'acc1', 'refresh_token': 'ref1', 'expires_in': 3600, 'user': {'id': 'user-1', 'email': 'me@example.test'}}


class KeepLoginTests(unittest.TestCase):
    def setUp(self):
        auth.clear()
        self.addCleanup(auth.clear)
        self.store = {}
        for name, fn in (('save', lambda refresh, email, user_id: self.store.update(saved={'refresh': refresh, 'email': email, 'userId': user_id})),
                         ('load', lambda: self.store.get('saved')),
                         ('clear', lambda: self.store.pop('saved', None))):
            patcher = mock.patch.object(saved_login, name, fn)
            patcher.start()
            self.addCleanup(patcher.stop)
        for patcher in (mock.patch.object(SessionManager, 'auto_login_available', staticmethod(lambda: False)),
                        mock.patch.object(SessionManager, '_after_login', staticmethod(lambda user_id: None))):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.session = SessionManager()

    def sign_in(self, remember):
        with mock.patch.object(supabase, 'sign_in', return_value=dict(LOGIN)):
            return self.session.sign_in({'email': 'me@example.test', 'password': 'longenough1', 'remember': remember})

    def test_remember_saves_only_refresh_token_and_off_clears(self):
        state = self.sign_in(True)
        self.assertEqual(self.store['saved'], {'refresh': 'ref1', 'email': 'me@example.test', 'userId': 'user-1'})
        self.assertTrue(state['keepLogin'])
        self.assertNotIn('acc1', str(self.store))
        state = self.sign_in(False)
        self.assertFalse(state['keepLogin'])
        self.assertNotIn('saved', self.store)

    def test_restore_on_status_rotates_saved_token(self):
        self.store['saved'] = {'refresh': 'ref1', 'email': 'me@example.test', 'userId': 'user-1'}
        rotated = {'access_token': 'acc2', 'refresh_token': 'ref2', 'expires_in': 3600, 'user': {'id': 'user-1', 'email': 'me@example.test'}}
        with mock.patch.object(supabase, 'refresh', return_value=rotated) as refresh:
            state = self.session.status()
        refresh.assert_called_once_with('ref1')
        self.assertTrue(state['signedIn'])
        self.assertEqual(self.store['saved']['refresh'], 'ref2', '회전된 새 토큰을 다시 저장한다')

    def test_rejected_token_is_cleared_but_network_error_keeps_it(self):
        self.store['saved'] = {'refresh': 'ref1', 'email': 'me@example.test', 'userId': 'user-1'}
        with mock.patch.object(supabase, 'refresh', side_effect=RequestError('Supabase에 연결하지 못했어요.', 504)):
            self.assertFalse(self.session.status()['signedIn'])
        self.assertIn('saved', self.store)
        self.session._restore_at = 0.0
        with mock.patch.object(supabase, 'refresh', side_effect=RequestError('거절', 400)):
            self.assertFalse(self.session.status()['signedIn'])
        self.assertNotIn('saved', self.store)

    def test_sign_out_clears_and_toggle_requires_login(self):
        self.sign_in(True)
        self.session.sign_out()
        self.assertNotIn('saved', self.store)
        with self.assertRaises(RequestError):
            self.session.set_keep_login({'enabled': True})
        self.sign_in(False)
        self.assertTrue(self.session.set_keep_login({'enabled': True})['keepLogin'])
        self.assertFalse(self.session.set_keep_login({'enabled': False})['keepLogin'])


class AfterLoginSafetyTests(unittest.TestCase):
    def test_non_uuid_user_never_touches_the_vault(self):
        from core import vault
        with mock.patch.object(vault, 'adopt_legacy', side_effect=AssertionError('가짜 계정이 저장소를 이전하면 안 된다')):
            SessionManager._after_login('u-1')  # 예외 없이 건너뛴다
        with mock.patch.object(vault, 'adopt_legacy', return_value=False) as adopt,                 mock.patch('core.storage.import_legacy_files', return_value={'articles': 0, 'sources': 0, 'failed': 0}),                 mock.patch('core.storage.pack_existing_photos'), mock.patch('core.storage.import_legacy_embedding_cache'),                 mock.patch('core.jobs.recover_interrupted_jobs'):
            SessionManager._after_login('89426d96-db90-406e-860d-2a6984e7e71e')
        adopt.assert_called_once()


if __name__ == '__main__':
    unittest.main()
