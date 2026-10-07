"""공용 테스트 계정 자동 로그인: 켜져 있으면 상태 조회·토큰 요청 때 로그인, 끄면 공용 계정 세션은 로그아웃,
배포본·계정 미설정이면 쓰지 않는다. 비밀번호·토큰은 상태에 나오지 않는다. (Supabase 는 가짜)"""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core import auth, config  # noqa: E402
from core.errors import RequestError  # noqa: E402
from core.managers import session_manager as sm  # noqa: E402


class AutoLoginTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.calls = []

        def fake_sign_in(email, password):
            self.calls.append(email)
            return {'access_token': 'jwt-' + str(len(self.calls)), 'refresh_token': 'r', 'expires_in': 3600,
                    'user': {'id': 'u1', 'email': email}}

        self.patches = [mock.patch.object(sm, 'SETTINGS', Path(temp.name) / 'settings.json'),
                        mock.patch.object(sm, 'APP_DATA', Path(temp.name)),
                        mock.patch.object(config, 'TEST_ACCOUNT_EMAIL', 'team@test.local'),
                        mock.patch.object(config, 'TEST_ACCOUNT_PASSWORD', 'secret-pw'),
                        mock.patch.object(config, 'AUTO_LOGIN_DEFAULT', True),
                        mock.patch.object(sm.supabase, 'sign_in', fake_sign_in),
                        mock.patch.object(sm.supabase, 'sign_out', lambda token: None)]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        auth.clear()
        self.addCleanup(auth.clear)

    def test_status_signs_in_once_and_hides_secrets(self):
        state = sm.SessionManager().status()
        self.assertTrue(state['signedIn'])
        self.assertEqual(state['autoLogin'], {'available': True, 'enabled': True, 'email': 'team@test.local', 'error': ''})
        self.assertNotIn('secret-pw', str(state))
        self.assertNotIn('jwt-1', str(state))
        sm.SessionManager().status()
        self.assertEqual(self.calls, ['team@test.local'])  # 이미 로그인돼 있으면 다시 하지 않는다

    def test_toggle_off_signs_out_and_is_remembered(self):
        mgr = sm.SessionManager()
        mgr.status()
        state = mgr.set_auto_login({'enabled': False})
        self.assertFalse(state['signedIn'])
        self.assertFalse(state['autoLogin']['enabled'])
        self.assertEqual(sm.SessionManager().token(), '')  # 꺼져 있으면 토큰을 만들지 않는다
        self.assertTrue(mgr.set_auto_login({'enabled': True})['signedIn'])

    def test_not_available_in_frozen_build_or_without_account(self):
        with mock.patch.object(sm.sys, 'frozen', True, create=True):
            self.assertFalse(sm.SessionManager().status()['autoLogin']['available'])
        with mock.patch.object(config, 'TEST_ACCOUNT_PASSWORD', ''):
            self.assertFalse(sm.SessionManager().status()['signedIn'])
            with self.assertRaises(RequestError):
                sm.SessionManager().set_auto_login({'enabled': True})
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
