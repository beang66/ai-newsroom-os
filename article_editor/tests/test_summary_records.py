import unittest,os,hashlib,tempfile,pathlib,json
from unittest.mock import patch
import server
class SummaryRecords(unittest.TestCase):
    body='공원 개방과 시설 관리 계획에 대한 기사입니다. 주민들이 산책로를 이용할 수 있습니다.'
    def generate(self,provider):
        with patch.dict(os.environ,{'FLOW_SUMMARY_PROVIDER':provider}),patch.object(server,'generate_subtitle_drafts',return_value=[['공원 개방']]),patch.object(server,'structured_call',return_value={'paragraphs':['공원 개방','산책로 조성','시설 관리'],'advice':''}):
            return server.assist({'kind':'flow','body':self.body})
    def test_openai_record(self):
        m=self.generate('openai')['metadata'];self.assertEqual([v['model'] for v in m['models']],[server.TEXT_MODEL]);self.assertEqual(m['input_sha256'],hashlib.sha256(self.body.encode()).hexdigest());self.assertIn('generated_at',m)
    def test_kobart_record(self):
        self.assertEqual([v['model'] for v in self.generate('kobart')['metadata']['models']],[server.SUBTITLE_MODEL,server.TEXT_MODEL])
    def test_invalid_provider(self):
        with patch.dict(os.environ,{'FLOW_SUMMARY_PROVIDER':'unknown'}):
            with self.assertRaises(server.RequestError):server.assist({'kind':'flow','body':self.body})
    def test_empty_result(self):
        with patch.dict(os.environ,{'FLOW_SUMMARY_PROVIDER':'openai'}),patch.object(server,'structured_call',return_value={'paragraphs':[]}):
            with self.assertRaises(server.RequestError):server.assist({'kind':'flow','body':self.body})
    def test_saved_record(self):
        result=self.generate('openai');result['inputText']=self.body
        with tempfile.TemporaryDirectory() as directory,patch.object(server,'ROOT',pathlib.Path(directory)),patch.object(server,'VERSION_STORE',server.SQLiteVersionStore(pathlib.Path(directory)/'.article-workspace')):
            saved=server.save_article({'draft':{'bodyHtml':self.body,'summary':result}})
            self.assertEqual(server.VERSION_STORE.current(saved['articleId'])['summary'],result)
