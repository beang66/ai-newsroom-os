# su4228 v30 (origin/feature/su4228-article-workspace, 6dc497f) 의 시험을 그대로 가져옴. 달라진 점은 이 머리말(경로 설정)뿐이다.
import sys
from pathlib import Path
_ROOT = Path(__file__).resolve().parents[2]  # article_editor/ — integration/·onnx_models.py 가 있는 곳
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
import hashlib,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import onnx_models

class ONNXConfigTests(unittest.TestCase):
    def test_runtime_selection(self):
        with patch.dict(os.environ,{'LOCAL_MODEL_RUNTIME':'onnx'}):self.assertEqual(onnx_models.runtime(),'onnx')
        with patch.dict(os.environ,{'LOCAL_MODEL_RUNTIME':'invalid'}):
            with self.assertRaises(ValueError):onnx_models.runtime()
    def test_bundle_identity_size_hash_and_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'encoder_model.onnx').write_bytes(b'test bytes')
            manifest={'format':'onnx','kind':'headline','model_id':'test/model','files':[{'path':'encoder_model.onnx','bytes':10,'sha256':hashlib.sha256(b'test bytes').hexdigest()}]}
            (root/'manifest.json').write_text(json.dumps(manifest))
            onnx_models.validate_bundle(root,'headline','test/model',True)
            with self.assertRaises(ValueError):onnx_models.validate_bundle(root,'subtitle','test/model')
            (root/'encoder_model.onnx').write_bytes(b'wrongbytes')
            with self.assertRaises(ValueError):onnx_models.validate_bundle(root,'headline','test/model',True)
            manifest['files'][0]['path']='../outside.onnx';(root/'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):onnx_models.validate_bundle(root,'headline','test/model')

if __name__=='__main__':unittest.main()
