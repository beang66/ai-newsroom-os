"""회원가입: 이메일 확인이 꺼진 경우(바로 로그인)/켜진 경우(확인 메일)/이미 가입/입력 검증 — Supabase 호출은 대체한다."""
import sys
import unittest
from pathlib import Path
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저: 개발자의 .env 계정으로 실제 로그인하지 않게)
import vault_fixture  # noqa: F401  (sys.path 준비)
from core import auth
from core.errors import RequestError
from core.integrations import supabase
from core.managers.session_manager import SessionManager


class SignUpTests(unittest.TestCase):
    def setUp(self):
        auth.clear()
        self.addCleanup(auth.clear)
        patcher = mock.patch.object(SessionManager, 'auto_login_available', staticmethod(lambda: False))  # 개발 PC 의 .env 계정으로 실제 로그인하지 않게
        patcher.start()
        self.addCleanup(patcher.stop)
        self.session = SessionManager()

    def sign_up(self, result, email='new@example.test', password='longenough1'):
        with mock.patch.object(supabase, 'sign_up', return_value=result):
            return self.session.sign_up({'email': email, 'password': password})

    def test_confirmation_off_signs_in(self):
        state = self.sign_up({'access_token': 'tok', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u1', 'email': 'new@example.test'}})
        self.assertEqual((state['signedIn'], state['needsConfirmation']), (True, False))
        self.assertNotIn('tok', str(state))

    def test_confirmation_on_asks_for_mail(self):
        state = self.sign_up({'id': 'u1', 'email': 'new@example.test', 'identities': [{'id': 'x'}]})
        self.assertEqual((state['signedIn'], state['needsConfirmation']), (False, True))

    def test_already_registered_hidden_user(self):
        with self.assertRaises(RequestError):
            self.sign_up({'id': 'u1', 'identities': []})

    def test_input_validation(self):
        for email, password in (('nope', 'longenough1'), ('a@b.test', 'short')):
            with self.assertRaises(RequestError):
                self.sign_up({}, email, password)

    def test_korean_messages(self):
        self.assertIn('이미 가입', supabase._korean('User already registered'))
        self.assertIn('이메일 또는 비밀번호', supabase._korean('Invalid login credentials'))
        self.assertIn('인증 메일', supabase._korean('email rate limit exceeded'))


if __name__ == '__main__':
    unittest.main()
