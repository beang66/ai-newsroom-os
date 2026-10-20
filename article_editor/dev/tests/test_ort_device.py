"""로컬 ONNX 실행 장치 고르기(core/ai/ort_device.py): 그래픽 메모리 기준, 강제 설정, GPU 실패 시 CPU."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))

try:
    import onnxruntime as ort
    from core.ai import ort_device as D
except ImportError:  # 팩트체크 런타임이 없는 환경
    ort = None

GB = 1 << 30


class FakeSession:
    def __init__(self, providers, fail_run=False):
        self.providers, self.fail_run = providers, fail_run

    def run(self, *_):
        if self.fail_run:
            raise RuntimeError('dml')
        return [self.providers[0]]


@unittest.skipIf(ort is None, 'onnxruntime 필요')
class OrtDeviceTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.model = Path(temp.name) / 'model.onnx'
        self.model.write_bytes(b'x' * 1000)
        (Path(temp.name) / 'model.onnx.data').write_bytes(b'x' * 1000)
        patch = mock.patch.dict(os.environ)
        patch.start()
        self.addCleanup(patch.stop)
        os.environ.pop(D.ENV, None)

    def choose(self, providers, vram):
        with mock.patch.object(ort, 'get_available_providers', return_value=providers), \
                mock.patch.object(D, 'gpu_memory', return_value=vram):
            return D.choose(self.model)[0]

    def test_model_bytes_includes_external_data(self):
        self.assertEqual(D.model_bytes(self.model), 2000)

    def test_memory_rule_and_overrides(self):
        self.assertEqual(self.choose([D.CPU], 8 * GB), 'cpu', 'DirectML 없으면 CPU')
        self.assertEqual(self.choose([D.DML, D.CPU], 8 * GB), 'gpu')
        with mock.patch.object(D, 'model_bytes', return_value=int(2.4 * GB)):
            self.assertEqual(self.choose([D.DML, D.CPU], 3 * GB), 'cpu', '2.4GB 판정기는 3GB 카드에서 CPU')
            self.assertEqual(self.choose([D.DML, D.CPU], 6 * GB), 'gpu')
        os.environ[D.ENV] = 'cpu'
        self.assertEqual(self.choose([D.DML, D.CPU], 8 * GB), 'cpu')
        os.environ[D.ENV] = 'gpu'
        self.assertEqual(self.choose([D.DML, D.CPU], 0), 'gpu', 'gpu 강제는 메모리 기준을 건너뛴다')

    def test_gpu_open_failure_falls_back_to_cpu(self):
        def make(providers):
            if providers[0] == D.DML:
                raise RuntimeError('no device')
            return FakeSession(providers)
        with mock.patch.object(D, 'choose', return_value=('gpu', 'test')):
            s = D._Session(self.model, make)
        self.assertEqual(s.run(None, {}), [D.CPU])
        self.assertEqual(D.status()['models'][str(self.model)]['device'], 'cpu')

    def test_gpu_first_run_failure_falls_back_to_cpu(self):
        with mock.patch.object(D, 'choose', return_value=('gpu', 'test')):
            s = D._Session(self.model, lambda p: FakeSession(p, fail_run=p[0] == D.DML))
        self.assertEqual(s.run(None, {}), [D.CPU])
        self.assertIn('첫 실행 실패', D.status()['models'][str(self.model)]['reason'])


if __name__ == '__main__':
    unittest.main()
