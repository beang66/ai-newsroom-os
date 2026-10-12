"""저장 위치 이전(app_paths.migrate_legacy): 기사는 내 문서로, 나머지는 앱 데이터로, 이미 있는 파일은 덮어쓰지 않는다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

import app_paths  # noqa: E402


class MigrateTests(unittest.TestCase):
    def test_moves_articles_and_workspace_without_overwriting(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            legacy = root / 'app' / '.article-workspace'
            (legacy / 'articles').mkdir(parents=True)
            (legacy / 'articles' / 'a.json').write_text('기사', encoding='utf-8')
            (legacy / 'factcheck').mkdir()
            (legacy / 'factcheck' / 'cache.sqlite3').write_text('old', encoding='utf-8')
            (root / 'data' / 'factcheck').mkdir(parents=True)
            (root / 'data' / 'factcheck' / 'cache.sqlite3').write_text('new', encoding='utf-8')
            with mock.patch.multiple(app_paths, APP_ROOT=root / 'app', ARTICLES_DIR=root / 'docs' / 'articles',
                                     APP_DATA=root / 'data'), mock.patch.dict('os.environ', {'AI_NEWSROOM_DOCUMENTS': ''}):
                with mock.patch.dict('os.environ', {'AI_NEWSROOM_DOCUMENTS': str(root / 'tmp')}):
                    self.assertEqual(app_paths.migrate_legacy(), [])  # 위치를 바꾼 실행(테스트)에서는 옮기지 않는다
                    self.assertTrue((legacy / 'articles' / 'a.json').exists())
                left = app_paths.migrate_legacy()
                self.assertEqual(app_paths.migrate_legacy(), left)  # 두 번 불러도 같다
            self.assertEqual((root / 'docs' / 'articles' / 'a.json').read_text(encoding='utf-8'), '기사')
            self.assertEqual((root / 'data' / 'factcheck' / 'cache.sqlite3').read_text(encoding='utf-8'), 'new')
            self.assertEqual([Path(p).name for p in left], ['cache.sqlite3'])  # 같은 이름은 남겨 둔다
            self.assertFalse((legacy / 'articles').exists())


if __name__ == '__main__':
    unittest.main()
