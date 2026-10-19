"""보관함 메타데이터는 코어 저장소에 남고 데이터맵과 같은 휴지통 상태를 쓴다."""
import env_isolation  # noqa: F401
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402
from core import knowledge_files, library_state, read_models, storage  # noqa: E402


class LibraryStateTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def test_state_round_trip_is_normalized(self):
        saved = library_state.save_state({'state': {
            'favorites': ['note:a', 'note:a', ''],
            'folders': [{'id': 'desk', 'name': '취재'}, {'id': '', 'name': '제외'}],
            'folderItems': {'note:a': ['desk', 'desk']},
            'tagDefinitions': ['중요'],
            'tags': {'note:a': ['중요']},
            'aliases': {'note:a': '새 이름'},
            'trashed': ['note:b'],
        }})['state']
        self.assertEqual(saved['favorites'], ['note:a'])
        self.assertEqual(saved['folders'], [{'id': 'desk', 'name': '취재'}])
        self.assertEqual(library_state.get_state()['state'], saved)

    def test_trashed_files_are_hidden_from_knowledge_map_not_deleted(self):
        source_id, _ = storage.save_source('보고서.txt', b'raw', '본문')
        note = knowledge_files.import_files({'files': [{'path': 'notes/a.md', 'content': '# A'}]})['files'][0]
        library_state.save_state({'state': {'trashed': [f'source:{source_id}', f"note:{note['id']}"]}})
        graph = read_models.knowledge_map()
        self.assertEqual(graph['sources'], [])
        self.assertEqual(graph['files'], [])
        self.assertEqual(knowledge_files.list_files()['files'][0]['id'], note['id'])


if __name__ == '__main__':
    unittest.main()
