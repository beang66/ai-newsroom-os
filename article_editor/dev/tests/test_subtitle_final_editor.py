# su4228 v30 (origin/feature/su4228-article-workspace, 6dc497f) 시험을 그대로 가져옴. 달라진 점: `import server` → `import su_server as server`(우리 코어 모듈로 이어 주는 층).
import copy
import json
import unittest
from unittest.mock import patch
import su_server as server

class FinalEditor(unittest.TestCase):
    evidence='글에 포함된 단어의 25%를 바꾸자 워터마크 검출률은 17%로 하락했다.'
    def test_reported_line_rejected(self):
        issues=server.subtitle_style_violations('글 단어 25% 변경 시 워터마크 검출률 17%까지 떨어짐')
        self.assertIn('보고서식 종결',issues)
        self.assertIn('글과 단어의 관계가 모호한 명사 나열',issues)
    def test_final_editor_rejects_invented_numbers(self):
        with patch.object(server,'structured_call',return_value={'subtitle_1':'단어의 25%를 바꾸자 검출률 3%로 하락'}):
            with self.assertRaises(server.RequestError):server.polish_subtitle_lines(['초안'],self.evidence,'제목',[{'evidence_sentence':self.evidence}])
    def test_real_subheadline_route_invokes_final_editor_and_preserves_title(self):
        fact={'subject':'워터마크','affected':'검출률','action':'단어의 25% 변경','result':'검출률 17%로 하락','time':'','place':'','model_input':self.evidence,'evidence_sentence':self.evidence}
        angle={'focus':'AI 글 워터마크','rationale':'새 기술','preferred_subject':'워터마크','subject_aliases':[], 'required_terms':['워터마크'], 'angle_core_facts':['새 기술'], 'headline_covered_facts':['AI 작성 여부 식별'], 'subtitle_gap_facts':['수정에 따른 검출률 변화'], 'evidence_sentences':[self.evidence],'subtitle_facts':[fact],'model_input':self.evidence}
        calls=[]
        def respond(name,instructions,schema,content):
            calls.append(name)
            if name=='headline_angle':return copy.deepcopy(angle)
            if name=='subtitle_fact_check':return {'subtitle_1':self.evidence}
            if name=='subtitle_review':return {'subtitle_1':'글 단어 25% 변경 시 워터마크 검출률 17%까지 떨어짐'}
            if name=='subtitle_editorial_finish':
                self.assertIn(self.evidence,content)
                return {'subtitle_1':'단어의 25%를 바꾸자 워터마크 검출률 17%로 하락'}
            raise AssertionError('Unexpected call '+name)
        title='AI 작성 여부 식별하는 워터마크'
        with patch.object(server,'structured_call',side_effect=respond),patch.object(server,'generate_subtitle_drafts',return_value=[['거친 요약 초안']]):
            result=server.metadata_assist(self.evidence,title,'subheadline')
        self.assertIn('subtitle_editorial_finish',calls)
        self.assertEqual(result['headline'],title)
        self.assertEqual(result['subtitle'],'단어의 25%를 바꾸자 워터마크 검출률 17%로 하락')
        self.assertNotIn('headline_review',calls)
