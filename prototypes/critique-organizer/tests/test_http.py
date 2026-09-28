"""Real HTTP integration tests; binds an ephemeral loopback port in a single process."""
import base64
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from app import store
from app.server import build_server


class HTTPTests(unittest.TestCase):
    def test_organizer_http_flow(self):
        status,body,_=self.request('/api/projects',{'title':'HTTP 교통 취재'})
        self.assertEqual(status,201);project=json.loads(body)
        raw='보도자료\n김하늘 교수는 버스 정책을 설명했다.'.encode()
        status,body,_=self.request('/api/intake',{'name':'release.txt','data':base64.b64encode(raw).decode(),'project_id':project['id']})
        self.assertEqual(status,200);doc=json.loads(body)
        from urllib.parse import quote
        status,body,_=self.request('/api/catalog?q='+quote('김하늘'))
        self.assertEqual(status,200);self.assertTrue(any(d['id']==doc['id'] for d in json.loads(body)['documents']))
        status,body,_=self.request('/api/organized/'+doc['id'])
        self.assertEqual(status,200);meta=json.loads(body)['document']['organization']
        status,body,_=self.request('/api/organization',{'document_id':doc['id'],'revision':meta['revision'],'changes':{'tags':['직접 지정']}})
        self.assertEqual(status,200)
        status,body,_=self.request('/api/explore?depth=2')
        self.assertEqual(status,200);self.assertTrue(json.loads(body)['edges'])
        self.assertEqual(self.request('/api/documents/'+doc['id']+'/original')[1],raw)
        self.request('/api/documents/'+doc['id'],method='DELETE')

    def test_failed_upload_download_encoded_id(self):
        from urllib.parse import quote
        status,body,_=self.request('/api/intake',{'name':'broken.png','data':base64.b64encode(b'raw image').decode()})
        self.assertEqual(status,200);item=json.loads(body)
        self.assertEqual(item['status'],'failed')
        self.assertEqual(self.request('/api/failed-original/'+quote(item['failure_id'],safe=''))[1],b'raw image')
        self.assertEqual(self.request('/api/intake/remove',{'failure_id':item['failure_id']})[0],200)

    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.old_path=store.DB_PATH
        store.DB_PATH=Path(cls.temp.name)/'http.sqlite3'
        cls.server=build_server(0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.server.server_address[1])

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
        store.DB_PATH=cls.old_path;cls.temp.cleanup()

    def request(self,path,payload=None,method=None,headers=None):
        request=Request(self.base+path,data=json.dumps(payload).encode() if payload is not None else None,
                        method=method,headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with urlopen(request,timeout=5) as response:
                return response.status,response.read(),response.headers
        except HTTPError as error:
            return error.code,error.read(),error.headers

    def test_upload_review_source_and_delete_end_to_end(self):
        raw='새빛시 교통연구원은 버스 요금을 1200원으로 발표했다.'.encode()
        status,body,_=self.request('/api/documents',{'name':'source.txt','path':'source.txt','data':base64.b64encode(raw).decode()})
        self.assertEqual(status,201);doc=json.loads(body)
        status,body,_=self.request('/api/reviews',{'article':'버스 요금은 1300원이다.','article_id':'test','article_version':1,'source_document_ids':[doc['id']]})
        self.assertEqual(status,200);result=json.loads(body)
        self.assertEqual(result['claims'][0]['status'],'review_required')
        self.assertEqual(result['claims'][0]['candidates'][0]['document_id'],doc['id'])
        status,body,headers=self.request('/api/documents/'+doc['id']+'/original')
        self.assertEqual(body,raw);self.assertIn('attachment',headers['Content-Disposition'])
        status,body,_=self.request('/api/documents/'+doc['id'],method='DELETE')
        self.assertEqual(json.loads(body)['deleted_review_count'],1)
        self.assertEqual(self.request('/api/reviews/'+result['id'])[0],404)
        self.assertEqual(self.request('/api/documents/'+doc['id']+'/original')[0],404)

    def test_seven_checks_without_sources_and_acknowledgement(self):
        status,body,_=self.request('/api/reviews',{'article':'몇일 뒤에 할수있다.','title':'발표 소식','article_id':'critique','article_version':1})
        self.assertEqual(status,200);result=json.loads(body)
        self.assertEqual(len(result['checks']),7);self.assertFalse(result['publication_blocked'])
        item=next(f for f in result['findings'] if f['rule_id']=='spell.days')
        payload={'review_id':result['id'],'finding_id':item['id'],'status':'acknowledged','input_hash':result['input_hash']}
        self.assertEqual(self.request('/api/finding-status',payload)[0],200)
        status,body,_=self.request('/api/reviews/'+result['id'])
        self.assertEqual(next(f for f in json.loads(body)['review']['findings'] if f['id']==item['id'])['status'],'acknowledged')
        payload['input_hash']='stale';self.assertEqual(self.request('/api/finding-status',payload)[0],400)

    def test_proofread_and_source_selection_validation(self):
        status,body,_=self.request('/api/proofread',{'article':'몇일 뒤','title':''})
        self.assertEqual(status,200);self.assertTrue(json.loads(body)['findings'])
        self.assertEqual(self.request('/api/reviews',{'article':'정상적인 문장입니다.','article_id':'a','article_version':1,'source_document_ids':['missing']})[0],400)
        self.assertEqual(self.request('/api/proofread',{'article':'test','glossary':[{'canonical':'','variants':[]}]})[0],400)

    def test_health_does_not_claim_provider_connection(self):
        status,body,_=self.request('/api/health')
        self.assertEqual(status,200)
        self.assertIn(json.loads(body)['openai_connection'],{'not_tested','connected','failed'})

    def test_explicit_connection_probe_reports_sanitized_failure(self):
        with patch.dict('os.environ',{'OPENAI_API_KEY':'fixture-key'}), \
             patch('app.openai_adapter.OpenAIResponses._post',side_effect=TimeoutError('secret transport detail')):
            status,body,_=self.request('/api/openai/check',{})
            self.assertEqual(status,200)
            result=json.loads(body)
            self.assertEqual(result,{'status':'failed','reason':'network_or_timeout'})
            self.assertNotIn('secret',body.decode())

    def test_openai_opt_in_requires_key_and_organizer_does_not_send_without_it(self):
        with patch.dict('os.environ',{'OPENAI_API_KEY':''}):
            self.assertEqual(self.request('/api/reviews',{'article':'기사입니다.','article_id':'x','article_version':1,'use_openai':True})[0],400)
            status,body,_=self.request('/api/intake',{'name':'memo.txt','data':base64.b64encode('자료 원문'.encode()).decode()})
            self.assertEqual(status,200)
            doc=json.loads(body)
            self.assertEqual(self.request('/api/organization/suggest',{'document_id':doc['id']})[0],400)

    def test_cross_origin_mutations_rejected(self):
        status,_,_=self.request('/api/reviews',{},headers={'Origin':'https://example.org'})
        self.assertEqual(status,403)
        self.assertEqual(self.request('/api/documents/a',method='DELETE',headers={'Origin':'null'})[0],403)

    def test_payload_validation(self):
        self.assertEqual(self.request('/api/reviews',[])[0],400)
        self.assertEqual(self.request('/api/reviews',{'article':None,'article_id':'a','article_version':1})[0],400)
        self.assertEqual(self.request('/api/reviews',{'article':'짧은 문장','article_id':'a','article_version':True})[0],400)
        self.assertEqual(self.request('/api/documents',{'name':'a.txt','data':'!invalid'})[0],400)

    def test_frontend_assets_and_security_headers(self):
        status,html,headers=self.request('/')
        self.assertEqual(status,200)
        self.assertIn(b'sourceDialog',html)
        self.assertEqual(headers['X-Content-Type-Options'],'nosniff')
        self.assertEqual(self.request('/app.js')[0],200)
        self.assertEqual(self.request('/style.css')[0],200)
        self.assertEqual(self.request('/../app/openai_adapter.py')[0],404)


if __name__=='__main__': unittest.main()
