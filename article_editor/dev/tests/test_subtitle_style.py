# su4228 v30 (origin/feature/su4228-article-workspace, 6dc497f) 시험을 그대로 가져옴. 달라진 점: `import server` → `import su_server as server`(우리 코어 모듈로 이어 주는 층).
import unittest,os,json
from unittest.mock import patch
import su_server as server
class SubtitleStyle(unittest.TestCase):
    def test_report_ending(self):
        self.assertIn('보고서식 종결',server.subtitle_style_violations('글 워터마크 도입함'))
        self.assertEqual(server.subtitle_style_violations('글 워터마크 도입'),[])
    def test_comparison_truncation(self):
        for line in ['탐지율 92%에서','탐지율 92%→','워터마크 도입할']:
            self.assertTrue(server.subtitle_style_violations(line))
        self.assertEqual(server.subtitle_style_violations('탐지율 92%→80%로 감소'),[])
    def test_missing_particle(self):
        self.assertTrue(server.subtitle_style_violations('전용 프로그램 확인 가능한 워터마크'))
        self.assertEqual(server.subtitle_style_violations('전용 프로그램으로 식별하는 워터마크'),[])
    def test_rules_in_local_edit_requests(self):
        captured={}
        def call(path,payload):
            captured.update(payload);return {'output':[{'content':[{'type':'output_text','text':'{}'}]}]}
        with patch.object(server,'openai_call',side_effect=call):
            server.structured_call('subtitle_review','기존 규칙',{},'원고')
        # 2026-10-08: 동아일보 부제 규칙(줄 수 기본 3줄, 제목 숫자 반복 금지)이 붙는지 확인
        self.assertIn('기본 3줄',captured['instructions']);self.assertIn('제목에 있는 숫자는 부제에 다시 쓰지 않습니다',captured['instructions'])
    def test_donga_declarative_ending(self):
        self.assertIn('서술형 종결',server.subtitle_style_violations('로건 8이닝 무실점 투구 빛냈다'))
        self.assertEqual(server.subtitle_style_violations('로건 8이닝 무실점 역투'),[])
        self.assertEqual(server.subtitle_style_violations('한선수 “최선 다하고 싶다”'),[])  # 인용은 허용
    def test_donga_four_lines_and_dash(self):
        # 동아일보 규칙: 부제 최대 4줄, 나열 기호 '·' → '-' (9·19 같은 날짜 표기는 유지)
        four='고사목 제거·나무예방주사 실시\nQR코드로 그루터기 추적 관리\n9·19 합의 이후 감시 강화\n청정지역 지정 목표'
        with patch.object(server,'structured_call',return_value={'subtitle_1':four}):
            out=server.polish_subtitle_lines(['초안'],'9·19 합의 원문','제목',multiline=True)
        self.assertEqual(out,['고사목 제거-나무예방주사 실시\nQR코드로 그루터기 추적 관리\n9·19 합의 이후 감시 강화\n청정지역 지정 목표'])
        with patch.object(server,'structured_call',return_value={'subtitle_1':four+'\n다섯째 줄'}):
            with self.assertRaises(server.RequestError):server.polish_subtitle_lines(['초안'],'9·19 합의 원문','제목',multiline=True)
    def test_openai_repair(self):
        bad={'subtitle_candidates':['전용 프로그램 확인 가능한 워터마크 도입함','탐지율 92%에서','원문 기반 추가 정보']}
        good={'subtitle_candidates':['전용 프로그램으로 식별하는 워터마크 도입','단어 수정에 따른 탐지 성능 변화','원문 기반 추가 정보']}
        with patch.dict(os.environ,{'USE_LOCAL_MODELS':'false'}),patch.object(server,'structured_call',side_effect=[bad,{f'subtitle_{i+1}':v for i,v in enumerate(bad['subtitle_candidates'])},good]) as call:
            r=server.assist({'kind':'metadata','requested':'subheadline','body':'워터마크 탐지율은 92%다. 기사 테스트 본문입니다. '*5})
            self.assertEqual(r,good);self.assertEqual(call.call_args_list[-1].args[0],'subtitle_style_repair')
    def test_persistent_errors_rejected(self):
        bad={'subtitle_candidates':['탐지율 92%에서']*3}
        with patch.object(server,'structured_call',return_value=bad):
            with self.assertRaises(server.RequestError):server.finalize_openai_subtitles(bad,'원문','제목')
