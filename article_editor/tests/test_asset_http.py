import hashlib,json,tempfile,threading,unittest,urllib.request
from pathlib import Path
from unittest.mock import patch
import server
from asset_store import AssetStore
from sqlite_store import SQLiteVersionStore
class AssetHTTP(unittest.TestCase):
    def test_photo_upload_article_versions_restore_and_read(self):
        with tempfile.TemporaryDirectory() as temp:
            host=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);port=host.server_address[1]
            storage=Path(temp)/'.article-workspace'
            with patch.object(server,'PORT',port),patch.object(server,'ROOT',Path(temp)),patch.object(server,'ASSET_STORE',AssetStore(storage)),patch.object(server,'VERSION_STORE',SQLiteVersionStore(storage,server.SAVE_LOCK)):
                thread=threading.Thread(target=host.serve_forever,daemon=True);thread.start()
                base=f'http://127.0.0.1:{port}'
                def request(path,data=None,mime='application/json',raw=False):
                    body=data if mime=='application/octet-stream' else json.dumps(data).encode() if data is not None else None
                    req=urllib.request.Request(base+path,data=body,headers={'Content-Type':mime,'Origin':base})
                    with urllib.request.urlopen(req) as response:
                        value=response.read();return value if raw else json.loads(value)
                try:
                    image=b'\x89PNG\r\n\x1a\n'+b'original bytes'*200
                    photo='/api/article-assets/'+hashlib.sha256(image).hexdigest()
                    self.assertFalse(request(photo+'/status')['ready'])
                    self.assertTrue(request(photo+'/chunks/0?total=1',image,'application/octet-stream')['ready'])
                    self.assertEqual(request(photo,raw=True),image)
                    draft={'bodyHtml':f'<figure><img src="{photo}"></figure>','photos':[{'data':photo,'original':photo}]}
                    saved=request('/api/articles/save',{'draft':draft});draft['articleId']=saved['articleId']
                    path=f"/api/articles/{saved['articleId']}/versions"
                    v=request(path,{'draft':draft})['version']
                    empty={'articleId':saved['articleId'],'bodyHtml':'사진 없는 원고','photos':[]}
                    request('/api/articles/save',{'draft':empty});latest=request(path,{'draft':empty})['version']
                    restored=request(path+'/'+v['versionId']+'/restore',{'draft':empty,'expectedHash':latest['contentHash']})
                    self.assertEqual(restored['draft']['photos'][0]['original'],photo)
                    self.assertEqual(request(photo,raw=True),image)
                    self.assertEqual(len(list((storage/'assets').glob('*.bin'))),1)
                finally:host.shutdown();host.server_close();thread.join()
