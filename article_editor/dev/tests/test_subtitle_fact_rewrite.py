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
    def test_mismatched_evidence_is_corrected_from_body(self):
        # 2026-10-08: 각도 분석이 근거 문장을 잘못 짝지어도, 숫자가 모두 있는 본문 문장이 있으면 근거를 바로잡는다
        body='전국 5개 구장에 9만5922명이 입장했다. KT는 시즌 누적 관중 100만4272명으로 창단 첫 100만 관중을 넘었다.'
        fact={'subject':'KT','action':'관중 돌파','result':'100만 관중','evidence_sentence':'전국 5개 구장에 9만5922명이 입장했다.'}
        checked={'subtitle_1':'KT는 시즌 누적 관중 100만4272명으로 창단 첫 100만 관중 돌파'}
        with patch.object(server,'structured_call',return_value=checked):
            self.assertEqual(server.confirm_subtitle_facts(body,'제목',[fact],[['초안']]),checked)
        self.assertEqual(fact['evidence_sentence'],'KT는 시즌 누적 관중 100만4272명으로 창단 첫 100만 관중을 넘었다.')
    def test_ungrounded_fact_is_dropped_not_fatal(self):
        # 2026-10-08: 사실 하나가 원문 수치와 안 맞으면 그 줄만 빼고 나머지로 진행한다
        good={'subject':'워터마크','action':'단어 수정','result':'탐지율 감소','evidence_sentence':self.evidence}
        bad={'subject':'한선수','action':'계약','result':'은퇴 시점','evidence_sentence':'마흔두 살까지 하고 싶다.'}
        facts=[good,bad];drafts=[['초안1'],['초안2']]
        checked={'subtitle_1':'단어 10% 수정 시 탐지율 92%에서 66%로 감소','subtitle_2':'42세까지 선수 생활'}
        with patch.object(server,'structured_call',return_value=checked):
            out=server.confirm_subtitle_facts(self.evidence+' 마흔두 살까지 하고 싶다.','제목',facts,drafts)
        self.assertEqual(out,{'subtitle_1':checked['subtitle_1']})
        self.assertEqual(facts,[good]);self.assertEqual(drafts,[['초안1']])
    def test_empty_fact_rejected(self):
        with patch.object(server,'structured_call',return_value={'subtitle_1':''}):
            with self.assertRaises(server.RequestError):
                server.confirm_subtitle_facts(self.evidence,'제목',[self.fact()],[['초안']])
    def test_rewrite_receives_checked_facts(self):
        source=inspect.getsource(server.metadata_assist)
        self.assertLess(source.index('confirm_subtitle_facts('),source.index("structured_call('subtitle_review'"))
        self.assertIn("'checked_core_fact':checked_subtitle_facts",source)
        self.assertNotIn("value=preferred+' '+value",source)
