"""ONNX tokenization, model selection, readiness and measured-vector regression.

KEEP — 삭제 금지: 로컬 임베딩은 2026-10-08부터 '잠정 폐기'(기본은 원격 /ai/embeddings)일 뿐 코드는 일부러 남겨 둔 것이다.
용도: 로컬 ONNX 인코더(onnx_embedding.py)의 회귀 테스트 — 인코더를 남기는 한 이 테스트도 남긴다.
지금 이 코드를 부르는 곳이 없어 보여도(정적 분석·미사용 검사에 걸려도) 지우지 말 것. 되살리려면 FACTCHECK_EMBEDDING_RUNTIME=onnx 로 명시한다.
"""
import env_isolation  # noqa: F401 -- first: no developer credentials or vault
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))
import numpy as np
from core.ai.factcheck import onnx_embedding, paths, retrieval
from core.managers.ai_manager import AIManager
from core import source_index


class FakeTokenizer:
    def __init__(self):
        self.calls = []

    def encode_batch(self, values):
        self.calls.append(values)
        return [SimpleNamespace(ids=list(range(1, len(value) + 1)),
                                attention_mask=[1] * len(value)) for value in values]


class OnnxEmbeddingTests(unittest.TestCase):
    def encoder(self):
        encoder = onnx_embedding.OnnxQwenEncoder(Path('unused'), retrieval.query_input)
        encoder.tokenizer = FakeTokenizer()
        encoder.pad_id = 99
        encoder.session = mock.Mock()

        def run(outputs, inputs):
            rows = np.zeros((len(inputs['input_ids']), 1024), dtype=np.float64)
            rows[:, 0] = 1.0
            return [rows]
        encoder.session.run.side_effect = run
        return encoder

    def test_left_padding_attention_masks_shape_and_dtype(self):
        encoder = self.encoder()
        values = encoder.encode(['ab', 'abcd'], 'document')
        inputs = encoder.session.run.call_args.args[1]
        np.testing.assert_array_equal(inputs['input_ids'], [[99, 99, 1, 2], [1, 2, 3, 4]])
        np.testing.assert_array_equal(inputs['attention_mask'], [[0, 0, 1, 1], [1, 1, 1, 1]])
        self.assertEqual(inputs['input_ids'].dtype, np.int64)
        self.assertEqual(values.shape, (2, 1024))
        self.assertEqual(values.dtype, np.dtype('<f4'))
        self.assertEqual(encoder.session.run.call_args.args[0], ['embedding'])

    def test_batching_and_order(self):
        encoder = self.encoder()
        texts = ['abc'] * 9
        self.assertEqual(encoder.encode(texts, 'document').shape, (9, 1024))
        self.assertEqual([len(c.args[1]['input_ids']) for c in encoder.session.run.call_args_list], [4, 4, 1])

    def test_long_context_runs_individually(self):
        encoder = self.encoder()
        encoder.encode(['x' * 2049, 'ab'], 'document')
        self.assertEqual([c.args[1]['input_ids'].shape for c in encoder.session.run.call_args_list], [(1, 2049), (1, 2)])

    def test_queries_use_unchanged_instruction(self):
        encoder = self.encoder()
        encoder.encode(['abc'], 'query')
        self.assertEqual(encoder.tokenizer.calls, [[retrieval.query_input('abc')]])

    def test_empty_list_does_not_load_model(self):
        encoder = onnx_embedding.OnnxQwenEncoder('missing', retrieval.query_input)
        with mock.patch.object(encoder, '_load') as load:
            self.assertEqual(encoder.encode([], 'document').shape, (0, 1024))
            load.assert_not_called()
        with self.assertRaises(ValueError):
            encoder.encode([], 'invalid')

    def test_bad_outputs_are_rejected(self):
        for output in (np.zeros((1, 2)), np.zeros((1, 1024)), np.full((1, 1024), np.nan)):
            encoder = self.encoder()
            encoder.session.run.side_effect = None
            encoder.session.run.return_value = [output]
            with self.assertRaises(ValueError):
                encoder.encode(['abc'], 'document')

    def test_complete_model_files_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            encoder = onnx_embedding.OnnxQwenEncoder(folder, retrieval.query_input)
            for name in onnx_embedding.MODEL_FILES:
                self.assertFalse(encoder.available())
                (folder / name).touch()
            self.assertTrue(encoder.available())
            with mock.patch.dict(sys.modules, {'onnxruntime': None}):
                self.assertFalse(encoder.available())

    def test_load_configures_right_truncation_left_padding_and_cpu(self):
        import onnxruntime as ort
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for name in onnx_embedding.MODEL_FILES:
                (folder / name).touch()
            (folder / 'embedding.json').write_text(json.dumps({'dimension': 1024, 'max_length': 8192,
                'pooling': 'last_token', 'padding_side': 'left', 'normalize': 'l2'}), encoding='utf-8')
            tokenizer = mock.Mock()
            tokenizer.token_to_id.return_value = 151643
            with mock.patch('tokenizers.Tokenizer', **{'from_file.return_value': tokenizer}), \
                    mock.patch.object(ort, 'InferenceSession') as session:
                encoder = onnx_embedding.OnnxQwenEncoder(folder, retrieval.query_input)
                encoder._load()
                encoder._load()
                session.assert_called_once()
                tokenizer.no_padding.assert_called_once()
                tokenizer.enable_truncation.assert_called_once_with(max_length=8192, direction='right')
                self.assertEqual(session.call_args.kwargs['providers'], ['CPUExecutionProvider'])
                self.assertEqual(encoder.pad_id, 151643)
            (folder / 'embedding.json').write_text('{"dimension": 12}', encoding='utf-8')
            with self.assertRaises(ValueError):
                onnx_embedding.OnnxQwenEncoder(folder, retrieval.query_input)._load()

    def test_factory_remote_default_and_onnx_torch_explicit(self):
        from core.ai.factcheck import remote_embedding
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('FACTCHECK_EMBEDDING_RUNTIME', None)
            self.assertIsInstance(retrieval.create_encoder(), remote_embedding.RemoteQwenEncoder)
            self.assertIsNone(retrieval.create_encoder().fallback)  # 로컬 폴백 없음
            self.assertIn('onnxruntime', paths.embedding_dependencies())  # 판정기·경계 모델용
        with mock.patch.dict(os.environ, {'FACTCHECK_EMBEDDING_RUNTIME': 'onnx'}):
            self.assertIsInstance(retrieval.VectorCache().encoder, onnx_embedding.OnnxQwenEncoder)
            self.assertNotIn('torch', paths.embedding_dependencies())
        with mock.patch.dict(os.environ, {'FACTCHECK_EMBEDDING_RUNTIME': 'torch'}):
            self.assertIsInstance(retrieval.VectorCache().encoder, retrieval.QwenEncoder)
            self.assertIn('torch', paths.embedding_dependencies())

    def test_cache_key_is_runtime_independent(self):
        keys = []
        for runtime in ('torch', 'onnx'):
            with mock.patch.dict(os.environ, {'FACTCHECK_EMBEDDING_RUNTIME': runtime}):
                keys.append(retrieval.vector_key('same news text', 'document'))
        self.assertEqual(keys[0], keys[1])
        self.assertNotEqual(keys[0], retrieval.vector_key('same news text', 'query'))

    def test_readiness_and_ingestion_do_not_require_torch(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / 'model.onnx').touch()
            (folder / 'judge.json').touch()
            with mock.patch.multiple(paths, JUDGE_DIR=folder, BOUNDARY_DIR=folder), \
                    mock.patch.dict(os.environ, {'FACTCHECK_EMBEDDING_RUNTIME': 'onnx'}), \
                    mock.patch.object(onnx_embedding.OnnxQwenEncoder, 'available', return_value=True), \
                    mock.patch('importlib.util.find_spec', side_effect=lambda n: None if n in ('torch', 'transformers') else object()):
                status = AIManager().factcheck_status()
                self.assertTrue(status['ready'])
                self.assertEqual(set(status['runtime']), {'numpy', 'tokenizers', 'onnxruntime'})
                self.assertTrue(source_index._runtime_available())


class InstalledOnnxEmbeddingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.encoder = onnx_embedding.OnnxQwenEncoder(paths.EMBEDDING_DIR, retrieval.query_input)
        fixture = Path(__file__).parent / 'fixtures/embedding_reference.npz'
        if not cls.encoder.available():
            raise unittest.SkipTest('Installed ONNX model required')
        cls.reference = np.load(fixture, allow_pickle=False) if fixture.is_file() else None

    @classmethod
    def tearDownClass(cls):
        if cls.reference is not None:
            cls.reference.close()
        cls.encoder.session = None

    def test_matches_stored_torch_references_in_both_roles(self):
        if self.reference is None:
            self.skipTest('Run verify_embedding_onnx.py --reference-fixture dev/tests/fixtures/embedding_reference.npz first')
        self.assertEqual(str(self.reference['model_id']), retrieval.MODEL_ID)
        for role in ('document', 'query'):
            expected = self.reference[role]
            actual = self.encoder.encode(self.reference['texts'].tolist(), role)
            cosine = np.sum(actual.astype(np.float64) * expected, axis=1)
            self.assertGreaterEqual(float(cosine.min()), 0.9999)
            self.assertEqual(actual.dtype, np.float32)

    def test_inference_and_readiness_with_torch_imports_blocked(self):
        code = """import importlib.abc, sys
class BlockTorch(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in ('torch', 'transformers'):
            raise ImportError('torch/transformers intentionally unavailable')
sys.meta_path.insert(0, BlockTorch())
from core.ai.factcheck.retrieval import create_encoder
from core.managers.ai_manager import AIManager
from core import source_index
encoder = create_encoder()
assert encoder.available()
assert encoder.encode(['Korean news 2026'], 'document').shape == (1, 1024)
assert 'torch' not in AIManager().factcheck_status()['runtime']
assert source_index._runtime_available()
assert not any(x.split('.')[0] in ('torch', 'transformers') for x in sys.modules)
print('ONNX inference and readiness passed without torch/transformers')
"""
        env = {**os.environ, 'PYTHONPATH': str(Path(__file__).resolve().parents[2] / 'app'),
               'FACTCHECK_EMBEDDING_RUNTIME': 'onnx', 'AI_NEWSROOM_SKIP_DOTENV': '1'}
        result = subprocess.run([sys.executable, '-c', code], env=env, capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
