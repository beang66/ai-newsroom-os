# 2026-10-16: 녹취의 화자 수정(이름 바꾸기·합치기·구간 지정)을 계정별 암호화 저장소에 따로 보관한다. 발언 원본은 바꾸지 않는다.
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import base64
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import storage  # noqa: E402
from core.errors import RequestError  # noqa: E402

DIALOGUES = [
    {'id': 'a1', 'text': '안녕하세요', 'speaker': '1', 'speakerName': '화자 1', 'timestamp': 0},
    {'id': 'a2', 'text': '반갑습니다', 'speaker': '2', 'speakerName': '화자 2', 'timestamp': 3},
]
EDITS = {'names': {'1': '김 기자'}, 'merge': {'2': '1'}, 'assign': {'a2': 'custom-1'}}


def save_one():
    result = storage.save_transcript(
        {'filename': 'x.m4a', 'mimeType': 'audio/mp4', 'data': 'data:audio/mp4;base64,' + base64.b64encode(b'a' * 100).decode()},
        {'dialogues': DIALOGUES, 'duration': 5})
    return result['transcriptId']


class SpeakerEdits(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.identifier = save_one()

    def test_a_new_transcript_has_no_edits(self):
        self.assertEqual(storage.get_transcript(self.identifier)['speakerEdits'], {})

    def test_edits_are_saved_and_returned_and_the_original_dialogues_stay_untouched(self):
        saved = storage.save_speaker_edits(self.identifier, EDITS)
        self.assertEqual(saved['speakerEdits'], EDITS)
        loaded = storage.get_transcript(self.identifier)
        self.assertEqual(loaded['speakerEdits'], EDITS)
        self.assertEqual(loaded['dialogues'], DIALOGUES)                      # CLOVA 가 준 원본은 그대로

    def test_saving_again_replaces_the_previous_edits(self):
        storage.save_speaker_edits(self.identifier, EDITS)
        storage.save_speaker_edits(self.identifier, {'names': {}, 'merge': {}, 'assign': {}})
        self.assertEqual(storage.get_transcript(self.identifier)['speakerEdits'], {'names': {}, 'merge': {}, 'assign': {}})

    def test_missing_fields_are_treated_as_empty(self):
        saved = storage.save_speaker_edits(self.identifier, {'names': {'1': '김 기자'}})
        self.assertEqual(saved['speakerEdits'], {'names': {'1': '김 기자'}, 'merge': {}, 'assign': {}})

    def test_bad_shapes_are_refused(self):
        for bad in (None, [], 'x', {'names': []}, {'names': {'1': 5}}, {'merge': {'': 'a'}}, {'assign': {'a1': ''}},
                    {'names': {'1': 'x' * 101}}, {'names': {str(i): 'a' for i in range(201)}}):
            with self.assertRaises(RequestError, msg=repr(bad)[:40]):
                storage.save_speaker_edits(self.identifier, bad)
        self.assertEqual(storage.get_transcript(self.identifier)['speakerEdits'], {})   # 거절된 요청은 아무것도 바꾸지 않는다

    def test_unknown_or_malformed_transcript_id(self):
        with self.assertRaises(RequestError) as caught:
            storage.save_speaker_edits('0' * 32, EDITS)
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(RequestError):
            storage.save_speaker_edits('../x', EDITS)

    def test_each_transcript_keeps_its_own_edits(self):
        other = save_one()
        storage.save_speaker_edits(self.identifier, EDITS)
        self.assertEqual(storage.get_transcript(other)['speakerEdits'], {})


if __name__ == '__main__':
    unittest.main()
