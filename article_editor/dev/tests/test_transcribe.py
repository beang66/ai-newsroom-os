"""녹음 전사: 문장 합치기·화자 교대 규칙과, 외부 호출이 multipart 로 providers 경로를 타는지."""
import base64
import sys
import unittest
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.ai import transcribe as tr  # noqa: E402
from core.errors import RequestError  # noqa: E402

SEGMENTS = [
    {'start': 0.0, 'end': 2.0, 'text': '대표님 오늘'},
    {'start': 2.1, 'end': 5.0, 'text': '시간 내주셔서 감사합니다. 개발 배경부터 설명 부탁드립니다.'},
    {'start': 5.4, 'end': 9.0, 'text': '네, 저희는 3년 전부터 저전력 칩을 연구해 왔고 그 결과가 이번 발표로 이어졌습니다.'},
    {'start': 9.1, 'end': 10.0, 'text': ' '},
]


class TranscribeTests(unittest.TestCase):
    def test_merges_fragments_and_alternates_speakers(self):
        dialogues = tr.to_dialogues(SEGMENTS)
        self.assertEqual([d['speaker'] for d in dialogues], ['reporter', 'interviewee'])
        self.assertEqual(dialogues[0]['text'], '대표님 오늘 시간 내주셔서 감사합니다. 개발 배경부터 설명 부탁드립니다.')
        self.assertEqual((dialogues[1]['speakerName'], dialogues[1]['timestamp']), ('취재원', 5))

    def test_sends_multipart_through_providers(self):
        seen = {}

        def fake_call(path, body, content_type):
            seen.update(path=path, body=body, content_type=content_type)
            return {'text': 'x', 'duration': 10.0, 'segments': SEGMENTS}

        with mock.patch.object(tr.providers, 'call', fake_call):
            out = tr.transcribe({'filename': 'a.m4a', 'data': 'data:audio/mp4;base64,' + base64.b64encode(b'AUDIO').decode()})
        self.assertEqual(seen['path'], 'audio/transcriptions')
        self.assertTrue(seen['content_type'].startswith('multipart/form-data; boundary='))
        self.assertIn(b'filename="a.m4a"', seen['body'])
        self.assertIn(b'\r\n\r\nAUDIO\r\n', seen['body'])
        self.assertIn(b'whisper-1', seen['body'])
        self.assertEqual(len(out['dialogues']), 2)

    def test_rejects_bad_input(self):
        for payload in ({}, {'data': '!!not base64!!'}):
            with self.assertRaises(RequestError):
                tr.transcribe(payload)
        with mock.patch.object(tr, 'MAX_AUDIO', 3), self.assertRaises(RequestError) as caught:
            tr.transcribe({'data': base64.b64encode(b'AUDIO').decode()})
        self.assertEqual(caught.exception.status, 413)


if __name__ == '__main__':
    unittest.main()
