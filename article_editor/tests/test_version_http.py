import json,tempfile,threading,unittest,urllib.request
from pathlib import Path
from unittest.mock import patch
import server
from sqlite_store import SQLiteVersionStore
class VersionHTTP(unittest.TestCase):
    def test_save_list_read_restore_routes(self):
        with tempfile.TemporaryDirectory() as temp:
            host=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            port=host.server_address[1];store=SQLiteVersionStore(Path(temp)/'.article-workspace',server.SAVE_LOCK)
            with patch.object(server,'PORT',port),patch.object(server,'ROOT',Path(temp)),patch.object(server,'VERSION_STORE',store):
                thread=threading.Thread(target=host.serve_forever,daemon=True);thread.start()
                try:
                    base=f'http://127.0.0.1:{port}'
                    def request(path,data=None):
                        req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','Origin':base})
                        with urllib.request.urlopen(req) as response:return json.load(response)
                    draft={'title':'기사','bodyHtml':'첫 원고','photos':[]}
                    saved=request('/api/articles/save',{'draft':draft});draft['articleId']=saved['articleId'];path=f"/api/articles/{saved['articleId']}/versions"
                    self.assertEqual(request('/api/articles/'+saved['articleId'])['draft']['bodyHtml'],'첫 원고')
                    self.assertEqual(request('/api/status')['version_storage'],'sqlite')
                    v=request(path,{'draft':draft,'kind':'manual'})['version']
                    self.assertEqual(len(request(path)['versions']),1)
                    self.assertEqual(request(path+'/'+v['versionId'])['draft']['bodyHtml'],'첫 원고')
                    draft['bodyHtml']='수정 원고';request('/api/articles/save',{'draft':draft})
                    latest=request(path,{'draft':draft})['version']
                    restored=request(path+'/'+v['versionId']+'/restore',{'draft':draft,'expectedHash':latest['contentHash']})
                    self.assertEqual(restored['draft']['bodyHtml'],'첫 원고')
                    self.assertEqual(len(request(path)['versions']),2)
                finally:host.shutdown();host.server_close();thread.join()
    def test_frontend_save_against_actual_sqlite_http(self):
        import subprocess, shutil
        if not shutil.which('node'):self.skipTest('node unavailable')
        with tempfile.TemporaryDirectory() as temp:
            host=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);port=host.server_address[1]
            with patch.object(server,'PORT',port),patch.object(server,'ROOT',Path(temp)),patch.object(server,'VERSION_STORE',SQLiteVersionStore(Path(temp)/'.article-workspace',server.SAVE_LOCK)):
                thread=threading.Thread(target=host.serve_forever,daemon=True);thread.start()
                try:
                    result=subprocess.run(['node',str(Path(__file__).with_name('manual-save-http.mjs')),f'http://127.0.0.1:{port}'],capture_output=True,text=True,timeout=30)
                    self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                finally:host.shutdown();host.server_close();thread.join()
