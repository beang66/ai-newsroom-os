import env_isolation  # noqa: F401
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'app'))
from vault_fixture import use_temp_vault
from core import storage,vault,media_assets
from core.ai import router
from core.errors import RequestError
from core.managers.platform_manager import PlatformManager


class PlatformConnectionsTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.manager=PlatformManager()
        self.article_id=storage.save_article({'draft':{'title':'도서관 운영 계획','content':'도서관 주말 운영을 늘릴 계획입니다. 평일 운영 시간은 유지합니다.','bodyHtml':'<p>도서관 운영 계획</p>'}})['articleId']
        self.snapshot=storage.create_snapshot(self.article_id)

    def test_validation_uses_frozen_article_and_rejects_other_origin(self):
        draft={'article_id':self.article_id,'snapshot_id':self.snapshot['id'],'opening':'도서관 운영 계획','paragraphs':['주말 운영을 늘릴 계획이야.'],'closing':'','hashtags':[],'block_evidence':{'opening':[self.snapshot['body_text']],'paragraphs':[[self.snapshot['body_text']]],'closing':[]}}
        payload={'platform':'threads','article':{'article_id':self.article_id,'title':'변경된 화면','content':'다른 내용'},'draft':draft,'selected_keywords':[],'requirements':''}
        with patch.object(self.manager,'_call',return_value={'success':True,'validation':{'platform':'threads','status':'passed'}}) as call:
            result=self.manager.validate({'snapshotId':self.snapshot['id'],'payload':payload})
            self.assertEqual(result['snapshotId'],self.snapshot['id'])
            self.assertEqual(call.call_args.args[0]['payload']['article']['content'],self.snapshot['body_text'])
            self.assertEqual(call.call_args.args[0]['action'],'validate')
            payload['draft']={**draft,'article_id':'other'}
            with self.assertRaises(RequestError):self.manager.validate({'snapshotId':self.snapshot['id'],'payload':payload})

    def test_real_node_validation_uses_core_bridge(self):
        body=self.snapshot['body_text'];calls=[]
        def ai(request):
            calls.append(request)
            return {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'issues':[]})}]}]}
        draft={'article_id':self.article_id,'snapshot_id':self.snapshot['id'],'opening':'도서관 운영 계획','paragraphs':['도서관 주말 운영을 늘릴 계획이야.'],'closing':'','hashtags':['#도서관','#주말','#운영'],'block_evidence':{'opening':[body],'paragraphs':[[body]],'closing':[]}}
        with patch.object(PlatformManager,'_ai',staticmethod(ai)):
            result=self.manager.validate({'snapshotId':self.snapshot['id'],'payload':{'platform':'threads','draft':draft,'selected_keywords':[],'requirements':''}})
        self.assertTrue(result['success']);self.assertEqual(result['validation']['platform'],'threads');self.assertEqual(len(calls),2)
        self.assertTrue(all('model' in request for request in calls))

    def test_card_photo_keywords_keep_card_focus_and_legacy_body(self):
        for card in ({'keyword':'도서관','headline':'운영 확대','answer':'주말 확대','detail':'평일 유지'},{'headline':'운영 확대','body':'이전 본문'}):
            with patch.object(router,'structured_call',return_value={'keywords':['library','weekend','books']}) as call:
                router.assist({'kind':'photo_keywords','body':'기사의 다른 문단에서는 축구를 설명합니다.','card':card})
                sent=json.loads(call.call_args.args[3]);self.assertEqual(sent['current_card']['headline'],'운영 확대')
                self.assertIn('다른 문단',call.call_args.args[1]);self.assertEqual(sent['current_card'].get('body'),card.get('body',''))

    def test_sns_refuses_foreign_stale_asset_and_builds_ordered_jpg_from_vault(self):
        captured=[];self.manager._sns=SimpleNamespace(call=lambda p,a,d:captured.append(d) or {'success':True},close=lambda:None)
        asset=media_assets.register_media_asset({'kind':'image','mime_type':'image/jpeg','filename':'card.jpg','generated':True,'data':'data:image/jpeg;base64,/9j/2Q=='})
        origin={'article_id':self.article_id,'snapshot_id':self.snapshot['id'],'render_key':'current'}
        key=self.manager._render_origin_key(asset['id'],self.article_id,self.snapshot['id'],'current')
        with vault.connect() as db:db.execute('INSERT INTO app_meta(key,value) VALUES (?,?)',(key,json.dumps(origin)))
        data={'platform':'threads','action':'prepare','articleId':self.article_id,'snapshotId':self.snapshot['id'],'payload':{'text':'원고\n\n줄바꿈','assets':[{'id':asset['id'],'key':'old'}]}}
        with self.assertRaises(RequestError):self.manager.sns(data)
        self.assertEqual(captured,[])
        data['payload']['assets'][0]['key']=None
        with self.assertRaises(RequestError):self.manager.sns(data)
        data['payload']['assets'][0]['key']='current';self.manager.sns(data)
        self.assertEqual(captured[0]['text'],'원고\n\n줄바꿈');self.assertEqual(captured[0]['assets'][0]['order'],1);self.assertEqual(captured[0]['assets'][0]['data_url'],'data:image/jpeg;base64,/9j/2Q==')
        data['articleId']='other'
        with self.assertRaises(RequestError):self.manager.sns(data)

    def test_identical_jpg_dedup_keeps_each_render_origin_and_order(self):
        captured=[];self.manager._sns=SimpleNamespace(call=lambda p,a,d:captured.append(d) or {'success':True},close=lambda:None)
        assets=[]
        with patch.object(self.manager,'_call',return_value={'mime_type':'image/jpeg','data':'/9j/2Q=='}):
            for index in range(2):
                result=self.manager.render({'snapshotId':self.snapshot['id'],'payload':{'card_id':'c'+str(index),'article_id':self.article_id,'render_key':'key'+str(index)}})
                assets.append({'id':result['asset']['id'],'key':'key'+str(index)})
        self.assertEqual(assets[0]['id'],assets[1]['id'])
        self.manager.sns({'platform':'instagram','action':'prepare','articleId':self.article_id,'snapshotId':self.snapshot['id'],'payload':{'text':'두 카드','assets':assets}})
        self.assertEqual([file['order'] for file in captured[0]['assets']],[1,2])

    def test_text_only_sns_without_snapshot_requires_real_saved_article(self):
        captured=[];self.manager._sns=SimpleNamespace(call=lambda p,a,d:captured.append(d) or {'success':True},close=lambda:None)
        request={'platform':'threads','action':'prepare','articleId':self.article_id,'payload':{'text':'현재 원고','assets':[]}}
        self.manager.sns(request);self.assertEqual(len(captured),1)
        request['articleId']='f'*32
        with self.assertRaises(RequestError):self.manager.sns(request)
        self.assertEqual(len(captured),1)

    def test_no_publish_operation_and_owned_service_is_closed(self):
        with self.assertRaises(RequestError):self.manager.sns({'platform':'threads','action':'publish'})
        closed=[];self.manager._sns=SimpleNamespace(close=lambda:closed.append(True));self.manager.close()
        self.assertEqual(closed,[True]);self.assertIsNone(self.manager._sns)

    def test_real_sns_process_close_and_restart_without_browser(self):
        try:
            self.assertEqual(self.manager.sns({'platform':'instagram','action':'status'})['reason'],'browser_closed')
            first=self.manager._sns.proc
            self.assertIsNone(first.poll())
            self.manager.sns({'platform':'instagram','action':'close'})
            self.assertIsNone(self.manager._sns)
            self.assertEqual(first.poll(),0)
            self.manager.sns({'platform':'threads','action':'status'})
            second=self.manager._sns.proc
            self.assertNotEqual(first.pid,second.pid)
            self.manager.close()
            self.assertEqual(second.poll(),0)
        finally:self.manager.close()

    def test_uploaded_and_unsplash_photo_bytes_attribution_and_card_link_restore(self):
        from copy import deepcopy
        png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII='
        photos=[{'id':'uploaded','data':png,'url':'','original':png,'caption':'내 사진','source':'직접 업로드','provider':'upload'},
                {'id':'unsplash','data':png,'url':'','original':png,'caption':'도서관','source':'사진가 / Unsplash','provider':'unsplash','sourceUrl':'https://unsplash.com/photos/fixture','unsplashId':'fixture'}]
        draft={'articleId':self.article_id,'title':'도서관 운영 계획','content':self.snapshot['body_text'],'bodyHtml':'<p>도서관 운영 계획</p>','photos':deepcopy(photos),
               'cardNews':{'article_id':self.article_id,'snapshot_id':self.snapshot['id'],'cards':[{'card_id':'c1','photoId':'uploaded'},{'card_id':'c2','photoId':'unsplash'}]}}
        storage.save_article({'draft':draft})
        restored=storage.latest_article(photo_refs=True)['draft']
        self.assertEqual(restored['cardNews'],draft['cardNews'])
        for actual,expected in zip(restored['photos'],photos):
            for key in ('id','caption','source','provider','sourceUrl','unsplashId'):
                self.assertEqual(actual.get(key),expected.get(key))
            for key in ('data','original'):
                self.assertTrue(actual[key].startswith('media:'))
                raw,mime=storage.media_file(actual[key][6:])
                self.assertEqual(mime,'image/png')
                import base64
                self.assertEqual(raw,base64.b64decode(png.split(',')[1]))

    def test_desktop_stop_closes_owned_service(self):
        from desktop.runtime import LocalServer
        from core.api import CORE
        server=object.__new__(LocalServer)
        server._thread=None
        server._httpd=SimpleNamespace(server_close=lambda:None)
        with patch.object(CORE.platform,'close') as close,patch.object(storage,'cleanup_open'):
            server.stop()
            close.assert_called_once_with()

    def test_concurrent_first_sns_request_does_not_create_second_owner(self):
        import threading
        entered,release=threading.Event(),threading.Event()
        def call(*args):entered.set();release.wait(5);return {'success':True}
        service=SimpleNamespace(call=call,close=lambda:None)
        with patch('core.managers.sns_service.SnsService',return_value=service) as factory:
            thread=threading.Thread(target=lambda:self.manager.sns({'platform':'instagram','action':'status'}))
            thread.start()
            try:
                self.assertTrue(entered.wait(5))
                with self.assertRaises(RequestError) as error:self.manager.sns({'platform':'threads','action':'connect'})
                self.assertEqual(error.exception.status,409);factory.assert_called_once()
            finally:release.set();thread.join(5);self.manager.close()
