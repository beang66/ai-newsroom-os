# su4228 v30 (origin/feature/su4228-article-workspace, 6dc497f) 시험을 그대로 가져옴. 달라진 점: `import server` → `import su_server as server`(우리 코어 모듈로 이어 주는 층).
import json
import inspect
import unittest
from unittest.mock import patch
import su_server as server

class SubtitleFactRewrite(unittest.TestCase):
    evidence='약 1600자 분량의 영어 글에서 단어 10%를 바꾸자 탐지율이 92%에서 66%로 떨어졌다.'
    def fact(self):
        return {'subject':'워터마크','action':'단어 수정','result':'탐지율 감소','evidence_sentence':self.evidence}
    def test_fact_check_receives_draft_and_original(self):
        checked={'subtitle_1':'단어 10% 수정 시 탐지율 92%에서 66%로 감소'}
        with patch.object(server,'structured_call',return_value=checked) as call:
            self.assertEqual(server.confirm_subtitle_facts(self.evidence,'제목',[self.fact()],[['탐지율 92%에서']]),checked)
        name,instructions,schema,content=call.call_args.args
        self.assertEqual(name,'subtitle_fact_check')
        self.assertIn('부제 문구를 작성하지 말고',instructions)
        item=json.loads(content)['items'][0]
        self.assertEqual(item['evidence_sentence'],self.evidence)
        self.assertEqual(item['kobart_drafts'],['탐지율 92%에서'])
        self.assertNotIn('1600',checked['subtitle_1'])
    def test_invented_number_rejected(self):
        with patch.object(server,'structured_call',return_value={'subtitle_1':'탐지율 92%에서 80%로 감소'}):
            with self.assertRaises(server.RequestError):
                server.confirm_subtitle_facts(self.evidence,'제목',[self.fact()],[['초안']])
    def test_empty_fact_rejected(self):
        with patch.object(server,'structured_call',return_value={'subtitle_1':''}):
            with self.assertRaises(server.RequestError):
                server.confirm_subtitle_facts(self.evidence,'제목',[self.fact()],[['초안']])
    def test_rewrite_receives_checked_facts(self):
        source=inspect.getsource(server.metadata_assist)
        self.assertLess(source.index('confirm_subtitle_facts('),source.index("structured_call('subtitle_review'"))
        self.assertIn("'checked_core_fact':checked_subtitle_facts",source)
        self.assertNotIn("value=preferred+' '+value",source)
