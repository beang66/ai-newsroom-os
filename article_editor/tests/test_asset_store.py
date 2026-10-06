import hashlib,json,tempfile,unittest
from pathlib import Path
from asset_store import AssetStore,AssetError
from version_store import JsonVersionStore,content_hash
PNG=b'\x89PNG\r\n\x1a\n'+b'original pixels'*100
class Assets(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.store=AssetStore(self.temp.name);self.id=hashlib.sha256(PNG).hexdigest()
    def test_original_bytes_preserved_and_shared(self):
        self.assertTrue(self.store.chunk(self.id,0,1,PNG)['ready'])
        path,mime=self.store.read(self.id);self.assertEqual(path.read_bytes(),PNG);self.assertEqual(mime,'image/png')
        self.store.chunk(self.id,0,1,PNG)
        self.assertEqual(len(list((Path(self.temp.name)/'assets').glob('*.bin'))),1)
    def test_split_upload(self):
        self.assertFalse(self.store.chunk(self.id,0,2,PNG[:20])['ready'])
        self.assertTrue(self.store.chunk(self.id,1,2,PNG[20:])['ready'])
    def test_integrity_failure_not_published(self):
        with self.assertRaises(AssetError):self.store.chunk('a'*64,0,1,PNG)
        self.assertFalse(self.store.status('a'*64)['ready'])
    def test_invalid_file_or_path_rejected(self):
        with self.assertRaises(AssetError):self.store.status('../file')
        raw=b'not an image'
        with self.assertRaises(AssetError):self.store.chunk(hashlib.sha256(raw).hexdigest(),0,1,raw)
    def test_old_version_keeps_original_image_reference(self):
        self.store.chunk(self.id,0,1,PNG);versions=JsonVersionStore(self.temp.name);article='c'*32
        url=self.store.status(self.id)['url'];old={'articleId':article,'bodyHtml':f'<img src="{url}">','photos':[{'data':url,'original':url}]}
        first=versions.create(article,old)['version']
        current={'articleId':article,'bodyHtml':'사진 제거한 원고','photos':[]}
        versions.atomic(Path(self.temp.name)/'articles'/(article+'.json'),current)
        result=versions.restore(article,first['versionId'],current,content_hash(current))
        self.assertEqual(result['draft']['photos'][0]['original'],url)
        self.assertEqual(self.store.read(self.id)[0].read_bytes(),PNG)
