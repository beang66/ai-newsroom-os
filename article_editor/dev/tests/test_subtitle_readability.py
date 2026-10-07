# su4228 v30 (origin/feature/su4228-article-workspace, 6dc497f) 시험을 그대로 가져옴. 달라진 점: `import server` → `import su_server as server`(우리 코어 모듈로 이어 주는 층).
import json
import unittest
from unittest.mock import patch
import su_server as server

class SubtitleReadability(unittest.TestCase):
    def test_reported_bad_lines_trigger_repair(self):
        self.assertIn('보고서식 종결',server.subtitle_style_violations('워터마크는 단어 선택 방식을 미세 조정해 흔적을 남김'))
        self.assertIn('비율 대상과 행동의 조사 누락',server.subtitle_style_violations('단어 10% 수정하면 워터마크 인식률이 92%에서 66%로 감소'))
        self.assertEqual(server.subtitle_style_violations('단어의 10%를 바꾸면 탐지율 92%→66%'),[])
    def test_reported_candidates_repaired_without_losing_numbers(self):
        bad={'subtitle_candidates':['워터마크는 단어 선택 방식을 미세 조정해 흔적을 남김\n단어 10% 수정하면 워터마크 인식률이 92%에서 66%로 감소']*3}
        good={'subtitle_candidates':['단어 선택에 패턴을 넣어 AI 작성 여부 식별\n단어의 10%를 바꾸면 탐지율 92%→66%']*3}
        polished={f'subtitle_{i+1}':v for i,v in enumerate(good['subtitle_candidates'])}
        with patch.object(server,'structured_call',return_value=polished) as call:
            result=server.finalize_openai_subtitles(bad,'단어 선택에 패턴을 넣는다. 단어의 10%를 바꾸면 탐지율이 92%에서 66%로 감소했다.','AI 글 식별 기술')
        self.assertEqual(result,good)
        self.assertEqual(call.call_args.args[0],'subtitle_editorial_finish')
        for number in ('10%','92%','66%'):self.assertIn(number,result['subtitle_candidates'][0])
    def test_readability_rules_reach_generation_and_existing_final_audit(self):
        for name in ('subtitle_review','subtitles','subtitle_style_repair','metadata_ambiguity_audit'):
            with self.subTest(name=name),patch.object(server,'openai_call',return_value={'output':[{'content':[{'type':'output_text','text':'{}'}]}]}) as call:
                server.structured_call(name,'기본 편집 지시',{},'기사')
                prompt=call.call_args.args[1]['instructions']
                self.assertIn('사실 검사와 문체 검사를 따로',prompt)
                self.assertIn('명사형 종결은 마지막 어미의 선택',prompt)
                self.assertIn('원문에 없는 작동 방식은 만들지',prompt)
    def test_fact_check_not_forced_into_short_subtitle_style(self):
        with patch.object(server,'openai_call',return_value={'output':[{'content':[{'type':'output_text','text':'{}'}]}]}) as call:
            server.structured_call('subtitle_fact_check','완전한 문장으로 사실 확인',{},'기사')
        self.assertEqual(call.call_args.args[1]['instructions'],'완전한 문장으로 사실 확인')
