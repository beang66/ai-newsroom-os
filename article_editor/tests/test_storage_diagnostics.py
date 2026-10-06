import tempfile,json,unittest
from pathlib import Path
from unittest.mock import patch
import server
class StorageDiagnostics(unittest.TestCase):
    def test_safe_error_log(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(server,'ROOT',Path(temp)):
            server.record_storage_error('/api/articles/a/versions',PermissionError('secret article private path'))
            path=Path(temp)/'.article-workspace/logs/storage-errors.jsonl'
            record=json.loads(path.read_text())
            self.assertEqual(record['errorType'],'PermissionError')
            self.assertEqual(record['operation'],'version_save')
            self.assertNotIn('secret',path.read_text())
