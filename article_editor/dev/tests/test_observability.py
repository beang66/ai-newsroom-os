"""팩트체크 라우팅 로그: 기본은 평문 파일을 만들지 않는다(주장·근거 발췌 보호)."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))

from core.ai.factcheck import observability  # noqa: E402


def record():
    observability.record_factcheck_event(request_id='r', node_id='n', claim='극비 주장', status='SUPPORTED', confidence=.9,
                                         reason='이유', evidence={'text': '극비 근거'}, model_metadata={}, linked_source_count=1)


class ObservabilityTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.dir = Path(temp.name)
        for patcher in (mock.patch.object(observability, '_LOG_DIR', self.dir),
                        mock.patch.object(observability, '_LOG_PATH', self.dir / 'events.jsonl')):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_off_by_default(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('FACTCHECK_ROUTING_LOG', None)
            record()
        self.assertFalse((self.dir / 'events.jsonl').exists())

    def test_on_when_enabled(self):
        with mock.patch.dict(os.environ, {'FACTCHECK_ROUTING_LOG': '1'}):
            record()
        self.assertIn('극비 주장', (self.dir / 'events.jsonl').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
