"""제목·부제 ONNX 경로가 transformers 4.46.2 원본과 같은 후보를 내는지 (변환본이 설치된 PC에서만)."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import json
import sys
import unittest
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.ai import local_models as lm  # noqa: E402

FIXTURE = Path(__file__).parent / 'fixtures' / 'seq2seq_reference.json'


class LocalModelsOnnxTests(unittest.TestCase):
    def setUp(self):
        if lm._onnx_model('headline') is None or lm._onnx_model('subtitle') is None:
            self.skipTest('ONNX 제목·부제 모델 미설치')
        self.cases = json.loads(FIXTURE.read_text(encoding='utf-8'))['cases']

    def test_headline_matches_reference(self):
        for case in self.cases:
            self.assertEqual(lm.generate_headline_drafts(case['headline_input']), case['headline'])

    def test_subtitle_matches_reference(self):
        for case in self.cases:
            self.assertEqual(lm.generate_subtitle_drafts(case['subtitle_facts']), case['subtitle'])



class MissingModelTests(unittest.TestCase):
    """변환본이 없으면 transformers 로 넘어가지 않고 503 안내를 낸다(2026-10-02 대체 경로 삭제)."""

    def test_missing_model_is_503(self):
        from unittest.mock import patch
        from core.errors import RequestError
        empty = Path(__file__).parent / '__no_model__'
        with patch.dict(lm._MARKER, {'headline': (empty, 'beam.onnx'), 'subtitle': (empty, 'decoder.onnx')}),                 patch.dict(lm._onnx, clear=True):
            self.assertFalse(lm.headline_dependencies_ready())
            for call in (lambda: lm.generate_headline_drafts('기사'), lambda: lm.generate_subtitle_drafts([{'model_input': '문장'}])):
                with self.assertRaises(RequestError) as ctx:
                    call()
                self.assertEqual(ctx.exception.status, 503)
        self.assertEqual(lm.generate_subtitle_drafts([]), [])


if __name__ == '__main__':
    unittest.main()
