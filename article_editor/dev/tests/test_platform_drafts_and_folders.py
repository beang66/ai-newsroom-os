import env_isolation  # noqa: F401 — 가장 먼저(.env 격리)
import base64
import contextlib
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))

from core import storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402


VALID_DRAFT = {
    'article': {'title': '플랫폼 기사'},
    'platformDrafts': {'instagram': {'headline': '인스타 제목', 'body': '본문'}},
    'cards': [],
}


def save_transcript(name='interview.m4a'):
    return storage.save_transcript(
        {'filename': name, 'mimeType': 'audio/mp4',
         'data': 'data:audio/mp4;base64,' + base64.b64encode(b'a' * 100).decode()},
        {'dialogues': [{'id': 'a1', 'text': '내용'}], 'duration': 1})['transcriptId']


def use_memory_vault(case):
    """저장 로직 단위 테스트용 계정별 메모리 DB. 암호화 연결 자체는 test_vault.py가 검증한다."""
    databases = {}

    def database_for_current_user():
        user_id = vault._user_id() or 'test-user'
        if user_id not in databases:
            db = sqlite3.connect(':memory:')
            db.execute('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('CREATE TABLE transcripts (id TEXT PRIMARY KEY, workspace_id TEXT, filename TEXT, mime_type TEXT, '
                       'audio BLOB, dialogues_json TEXT, duration REAL, created_at TEXT)')
            databases[user_id] = db
        return databases[user_id]

    @contextlib.contextmanager
    def connect():
        db = database_for_current_user()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise

    patcher = mock.patch.object(vault, 'connect', connect)
    patcher.start()
    case.addCleanup(patcher.stop)
    case.addCleanup(lambda: [db.close() for db in databases.values()])


class PlatformDraftStorageTests(unittest.TestCase):
    def setUp(self):
        use_memory_vault(self)

    def test_platform_draft_round_trip_and_latest_first(self):
        first = storage.save_platform_draft({'draft': VALID_DRAFT})
        second = storage.save_platform_draft({'draft': {**VALID_DRAFT, 'article': {'title': '두 번째'}}})
        self.assertTrue(first['success'])
        self.assertEqual(storage.get_platform_draft(first['id'])['draft'], VALID_DRAFT)
        listed = storage.list_platform_drafts()['drafts']
        self.assertEqual([item['id'] for item in listed], [second['id'], first['id']])
        self.assertEqual(listed[0]['title'], '두 번째')

    def test_invalid_or_empty_draft_is_rejected(self):
        for draft in (None, [], {}, {'cards': [None] * 11}):
            with self.assertRaises(RequestError):
                storage.save_platform_draft({'draft': draft})
        with self.assertRaises(RequestError):
            storage.get_platform_draft('../secret')

    def test_platform_drafts_are_account_scoped(self):
        with mock.patch.object(vault, '_user_id', lambda: 'draft-user-a'):
            saved = storage.save_platform_draft({'draft': VALID_DRAFT})
            self.assertEqual(len(storage.list_platform_drafts()['drafts']), 1)
        with mock.patch.object(vault, '_user_id', lambda: 'draft-user-b'):
            self.assertEqual(storage.list_platform_drafts()['drafts'], [])
            with self.assertRaises(RequestError) as caught:
                storage.get_platform_draft(saved['id'])
            self.assertEqual(caught.exception.status, 404)


class TranscriptFolderStorageTests(unittest.TestCase):
    def setUp(self):
        use_memory_vault(self)

    def test_new_account_gets_its_own_empty_folder_state(self):
        with mock.patch.object(vault, '_user_id', lambda: 'folder-user-a'):
            self.assertEqual(storage.get_transcript_folders()['folders'], [])
            storage.save_transcript_folders({'folders': [{'id': 'folder_a', 'name': 'A'}], 'fileFolderMap': {}})
        with mock.patch.object(vault, '_user_id', lambda: 'folder-user-b'):
            self.assertEqual(storage.get_transcript_folders(), {'success': True, 'folders': [], 'fileFolderMap': {}})
        with mock.patch.object(vault, '_user_id', lambda: 'folder-user-a'):
            self.assertEqual(storage.get_transcript_folders()['folders'][0]['name'], 'A')

    def test_tree_and_file_mapping_round_trip(self):
        transcript_id = save_transcript()
        state = storage.save_transcript_folders({
            'folders': [
                {'id': 'folder_parent', 'name': '부모'},
                {'id': 'folder_child', 'name': '자식', 'parentId': 'folder_parent'},
            ],
            'fileFolderMap': {transcript_id: 'folder_child', 'f' * 32: 'folder_child'},
        })
        self.assertEqual(state['folders'][1]['parentId'], 'folder_parent')
        self.assertEqual(state['fileFolderMap'], {transcript_id: 'folder_child'})
        self.assertEqual(storage.get_transcript_folders()['fileFolderMap'], {transcript_id: 'folder_child'})

    def test_cycles_are_broken_and_delete_clears_mapping(self):
        transcript_id = save_transcript()
        saved = storage.save_transcript_folders({
            'folders': [
                {'id': 'folder_a', 'name': 'A', 'parentId': 'folder_b'},
                {'id': 'folder_b', 'name': 'B', 'parentId': 'folder_a'},
            ],
            'fileFolderMap': {transcript_id: 'folder_a'},
        })
        self.assertTrue(any('parentId' not in folder for folder in saved['folders']))
        storage.delete_transcript(transcript_id)
        self.assertEqual(storage.get_transcript_folders()['fileFolderMap'], {})


if __name__ == '__main__':
    unittest.main()
