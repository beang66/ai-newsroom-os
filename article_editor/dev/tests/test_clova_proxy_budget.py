# 2026-10-15: CLOVA 전사는 Render 중계(/ai/audio/clova)를 거친다(키는 서버에만) + 요금(분 단위)을 지키는 한도 + 40MB.
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import base64
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import backend_proxy  # noqa: E402
from core.ai import clova_budget, clova_speech, transcribe as tr  # noqa: E402
from core.errors import RequestError  # noqa: E402

CLOVA_REPLY = {'text': '안녕하세요.', 'duration': 90_000, 'segments': [
    {'start': 0, 'end': 2000, 'text': '안녕하세요.', 'speaker': {'label': '1', 'name': 'A'}, 'confidence': 0.9}]}


def audio_payload(size=2000, **extra):
    return dict({'filename': '인터뷰.m4a', 'data': 'data:audio/mp4;base64,' + base64.b64encode(b'a' * size).decode()}, **extra)


class ViaBackend(unittest.TestCase):
    def test_uses_render_when_backend_is_on_without_any_local_key(self):
        with mock.patch.object(backend_proxy, 'enabled', return_value=True), \
             mock.patch.object(clova_speech, 'get_clova_config', return_value=('', '')), \
             mock.patch.object(backend_proxy, 'post', return_value=CLOVA_REPLY) as post:
            result = clova_speech.recognize_speech(b'AUDIO', filename='인터뷰 1.m4a', mime_type='audio/mp4')
            self.assertTrue(clova_speech.is_clova_configured())          # PC 에 키가 없어도 쓸 수 있다
        path, body = post.call_args.args
        self.assertTrue(path.startswith('/ai/audio/clova?filename='))
        self.assertNotIn(' ', path)                                      # 파일 이름은 주소용으로 인코딩된다
        self.assertEqual(body, b'AUDIO')                                 # 음성 원본이 그대로 간다
        self.assertEqual(post.call_args.kwargs['content_type'], 'audio/mp4')
        self.assertEqual(result['engine'], 'clova')
        self.assertEqual(result['duration'], 90.0)                       # CLOVA 는 ms, 우리는 초

    def test_uses_local_key_only_when_backend_is_off(self):
        with mock.patch.object(backend_proxy, 'enabled', return_value=False), \
             mock.patch.object(backend_proxy, 'post') as post, \
             mock.patch.object(clova_speech, '_recognize_direct', return_value=CLOVA_REPLY) as direct:
            clova_speech.recognize_speech(b'AUDIO')
        direct.assert_called_once()
        post.assert_not_called()

    def test_bad_reply_from_backend_is_an_error(self):
        with mock.patch.object(backend_proxy, 'enabled', return_value=True), \
             mock.patch.object(backend_proxy, 'post', return_value=['x']):
            with self.assertRaises(RequestError):
                clova_speech.recognize_speech(b'AUDIO')


class Budget(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        patcher = mock.patch.dict(os.environ, {'CLOVA_MAX_FILE_MINUTES': '20', 'CLOVA_MONTHLY_MINUTES': '20'})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_one_recording_over_the_file_limit_is_refused(self):
        clova_budget.check(19 * 60)                                       # 19분은 통과
        with self.assertRaises(RequestError) as caught:
            clova_budget.check(21 * 60)
        self.assertEqual(caught.exception.status, 413)
        self.assertIn('20분', caught.exception.message)

    def test_monthly_total_stops_the_next_conversion(self):
        clova_budget.record(15 * 60)
        clova_budget.check(4 * 60)                                        # 15 + 4 = 19분 → 통과
        with self.assertRaises(RequestError) as caught:
            clova_budget.check(6 * 60)                                    # 15 + 6 = 21분 → 초과
        self.assertEqual(caught.exception.status, 429)
        clova_budget.record(6 * 60)                                       # 실제로 21분이 됐다면
        with self.assertRaises(RequestError):
            clova_budget.check(None)                                      # 길이를 몰라도 이미 넘었으면 막는다

    def test_unknown_length_skips_only_the_per_file_check(self):
        clova_budget.check(None)
        clova_budget.check(0)
        clova_budget.check('불명')                                        # 글자·0·없음은 길이를 모르는 것으로 본다

    def test_zero_turns_a_limit_off(self):
        with mock.patch.dict(os.environ, {'CLOVA_MAX_FILE_MINUTES': '0', 'CLOVA_MONTHLY_MINUTES': '0'}):
            clova_budget.record(10_000)
            clova_budget.check(10_000)

    def test_a_new_month_starts_from_zero(self):
        clova_budget.record(20 * 60)
        with self.assertRaises(RequestError):
            clova_budget.check(1)
        with mock.patch.object(clova_budget, '_key', return_value='clova_seconds:2099-01'):
            clova_budget.check(1)


class TranscribeFlow(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        patcher = mock.patch.dict(os.environ, {'CLOVA_MAX_FILE_MINUTES': '20', 'CLOVA_MONTHLY_MINUTES': '20'})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.reply = {'dialogues': [], 'transcript': {}, 'text': '', 'duration': 90.0, 'engine': 'clova'}

    def test_over_the_limit_never_reaches_clova_or_whisper(self):
        with mock.patch.object(clova_speech, 'recognize_speech') as clova, mock.patch.object(tr.providers, 'call') as whisper:
            for engine in ('clova', ''):                                   # engine 을 안 정해도 요금이 걸린 길을 먼저 막는다
                with self.assertRaises(RequestError):
                    tr.transcribe(audio_payload(engine=engine, durationSec=25 * 60))
        clova.assert_not_called()
        whisper.assert_not_called()

    def test_success_adds_the_real_length_to_this_months_total(self):
        with mock.patch.object(clova_speech, 'recognize_speech', return_value=self.reply):
            tr.transcribe(audio_payload(engine='clova', durationSec=90))
            tr.transcribe(audio_payload(engine='clova'))                   # 길이를 안 보내도 실제 길이로 더한다
        self.assertEqual(clova_budget.used_seconds(), 180.0)

    def test_failed_conversion_is_not_counted(self):
        with mock.patch.object(clova_speech, 'recognize_speech', side_effect=RequestError('점검 중', 502)):
            with self.assertRaises(RequestError):
                tr.transcribe(audio_payload(engine='clova', durationSec=90))
        self.assertEqual(clova_budget.used_seconds(), 0.0)

    def test_clova_takes_up_to_40mb_but_whisper_keeps_its_own_25mb_limit(self):
        with mock.patch.object(clova_speech, 'recognize_speech', return_value=self.reply) as clova:
            tr.transcribe(audio_payload(size=30_000_000, engine='clova'))   # 25MB 를 넘어도 CLOVA 는 받는다
        clova.assert_called_once()
        with mock.patch.object(tr.providers, 'call') as whisper:
            with self.assertRaises(RequestError) as caught:
                tr.transcribe(audio_payload(size=26_000_000, engine='whisper'))
        self.assertEqual(caught.exception.status, 413)
        whisper.assert_not_called()
        with self.assertRaises(RequestError):                              # 40MB 를 넘으면 어느 엔진이든 거절
            tr.transcribe(audio_payload(size=40_000_001, engine='clova'))


if __name__ == '__main__':
    unittest.main()
