# 2026-10-19: 녹취마다 전체 메모·AI 요약·발언별 메모를 계정별 암호화 저장소(app_meta)에 따로 보관한다. 파일을 옮겨도 섞이지 않고, 녹취를 지우면 함께 지워진다.
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import base64
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402

DIALOGUES = [{'id': 'a1', 'text': '안녕하세요', 'speaker': '1', 'speakerName': '화자 1', 'timestamp': 0}]
NOTES = {'memo': '취재 메모', 'summary': {'summary': '핵심 요약', 'keyPoints': ['첫째', '둘째'], 'keywords': ['AI', '기사']},
         'speakerNotes': {'a1': '이 발언은 확인 필요'}}


def save_one(name='x.m4a'):
    return storage.save_transcript(
        {'filename': name, 'mimeType': 'audio/mp4', 'data': 'data:audio/mp4;base64,' + base64.b64encode(b'a' * 100).decode()},
        {'dialogues': DIALOGUES, 'duration': 5})['transcriptId']


def notes_rows():
    with vault.connect() as db:
        return [row[0] for row in db.execute("SELECT key FROM app_meta WHERE key LIKE 'transcript_notes:%'").fetchall()]


class TranscriptNotes(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.identifier = save_one()

    def test_a_new_transcript_has_empty_notes(self):
        self.assertEqual(storage.get_transcript(self.identifier)['notes'], {'memo': '', 'summary': None, 'speakerNotes': {}})

    def test_notes_are_saved_and_returned_with_the_transcript(self):
        saved = storage.save_transcript_notes(self.identifier, NOTES)
        self.assertEqual(saved['notes'], NOTES)
        self.assertEqual(storage.get_transcript(self.identifier)['notes'], NOTES)

    def test_saving_replaces_the_previous_notes(self):
        storage.save_transcript_notes(self.identifier, NOTES)
        storage.save_transcript_notes(self.identifier, {'memo': '바꾼 메모'})
        self.assertEqual(storage.get_transcript(self.identifier)['notes'], {'memo': '바꾼 메모', 'summary': None, 'speakerNotes': {}})

    def test_empty_speaker_notes_are_dropped_and_unknown_fields_are_ignored(self):
        saved = storage.save_transcript_notes(self.identifier, {'memo': 'm', 'speakerNotes': {'a1': '  ', 'a2': '남김'}, 'extra': 'x'})
        self.assertEqual(saved['notes'], {'memo': 'm', 'summary': None, 'speakerNotes': {'a2': '남김'}})

    def test_each_transcript_keeps_its_own_notes(self):
        other = save_one('y.m4a')
        storage.save_transcript_notes(self.identifier, {'memo': 'A 메모'})
        storage.save_transcript_notes(other, {'memo': 'B 메모', 'summary': {'summary': 'B 요약', 'keyPoints': [], 'keywords': []}})
        self.assertEqual(storage.get_transcript(self.identifier)['notes']['memo'], 'A 메모')
        self.assertIsNone(storage.get_transcript(self.identifier)['notes']['summary'])
        self.assertEqual(storage.get_transcript(other)['notes']['summary']['summary'], 'B 요약')

    def test_notes_do_not_touch_the_original_dialogues_or_speaker_edits(self):
        storage.save_speaker_edits(self.identifier, {'names': {'1': '김 기자'}, 'merge': {}, 'assign': {}})
        storage.save_transcript_notes(self.identifier, NOTES)
        loaded = storage.get_transcript(self.identifier)
        self.assertEqual(loaded['dialogues'], DIALOGUES)
        self.assertEqual(loaded['speakerEdits']['names'], {'1': '김 기자'})

    def test_bad_shapes_are_rejected(self):
        for bad in ('x', ['a'], {'memo': 5}, {'memo': 'a' * 200_001}, {'summary': 'x'}, {'summary': {'keyPoints': 'x'}},
                    {'speakerNotes': ['a']}, {'speakerNotes': {'k' * 65: 'x'}}, {'speakerNotes': {'a1': 5}}):
            with self.assertRaises(RequestError, msg=repr(bad)[:40]):
                storage.save_transcript_notes(self.identifier, bad)
        self.assertEqual(storage.get_transcript(self.identifier)['notes'], {'memo': '', 'summary': None, 'speakerNotes': {}})

    def test_unknown_or_malformed_ids_are_rejected(self):
        with self.assertRaises(RequestError) as unknown:
            storage.save_transcript_notes('f' * 32, NOTES)
        self.assertEqual(unknown.exception.status, 404)
        with self.assertRaises(RequestError):
            storage.save_transcript_notes('../x', NOTES)

    def test_deleting_the_transcript_deletes_its_notes(self):
        other = save_one('y.m4a')
        storage.save_transcript_notes(self.identifier, NOTES)
        storage.save_transcript_notes(other, {'memo': '남아야 함'})
        storage.delete_transcript(self.identifier)
        self.assertEqual(notes_rows(), ['transcript_notes:' + other])


if __name__ == '__main__':
    unittest.main()
