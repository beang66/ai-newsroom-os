"""녹음 전사: 문장 합치기·화자 교대 규칙과, 외부 호출이 multipart 로 providers 경로를 타는지."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
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


    def test_clova_speech_diarization_and_transcript(self):
        clova_segments = [
            {'start': 0, 'end': 2000, 'text': '안녕하십니까.', 'confidence': 0.95, 'speaker': {'label': '1'}, 'words': [[0, 2000, '안녕하십니까']]},
            {'start': 2100, 'end': 5000, 'text': '네 반갑습니다.', 'confidence': 0.98, 'speaker': {'label': '2'}, 'words': [[2100, 5000, '네 반갑습니다']]},
        ]
        # 1. group_segments_by_speaker 테스트
        grouped = tr.clova_speech.group_segments_by_speaker(clova_segments)
        self.assertEqual(len(grouped), 2)
        self.assertEqual(grouped[0]['speakerName'], '화자 1')
        self.assertEqual(grouped[1]['speakerName'], '화자 2')

        # 2. to_clova_dialogues 테스트
        dialogues = tr.clova_speech.to_clova_dialogues(clova_segments)
        self.assertEqual(len(dialogues), 2)
        self.assertEqual(dialogues[0]['speakerName'], '화자 1')
        self.assertEqual(dialogues[1]['speakerName'], '화자 2')
        self.assertEqual(dialogues[0]['timestamp'], 0)
        self.assertEqual(dialogues[1]['timestamp'], 2)

        # 3. normalize_transcript 테스트 (docs/architecture 규격)
        transcript = tr.clova_speech.normalize_transcript({'text': '안녕하십니까. 네 반갑습니다.', 'segments': clova_segments})
        self.assertEqual(transcript['status'], 'completed')
        self.assertEqual(len(transcript['segments']), 2)
        self.assertEqual(transcript['segments'][0]['start_ms'], 0)
        self.assertEqual(transcript['segments'][0]['end_ms'], 2000)
        self.assertEqual(transcript['segments'][0]['speaker'], '화자 1')

        # 4. transcribe 호출 시 CLOVA mock 동작 테스트
        with mock.patch.object(tr.clova_speech, 'is_clova_configured', return_value=True), \
             mock.patch.object(tr.clova_speech, 'recognize_speech', return_value={
                 'dialogues': dialogues,
                 'transcript': transcript,
                 'text': '전체 텍스트',
                 'duration': 5.0,
                 'engine': 'clova'
             }):
            out = tr.transcribe({'data': base64.b64encode(b'AUDIO').decode()})
            self.assertEqual(out['engine'], 'clova')
            self.assertEqual(len(out['dialogues']), 2)
            self.assertEqual(out['dialogues'][0]['speakerName'], '화자 1')


if __name__ == '__main__':
    unittest.main()

