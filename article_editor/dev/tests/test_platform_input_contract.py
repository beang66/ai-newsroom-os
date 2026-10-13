"""실제 Core → 실제 Node 어댑터 입력 경계. 임시 암호화 저장소와 AI 응답 대역만 사용한다."""
import env_isolation  # noqa: F401
import json
import shutil
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))
from vault_fixture import use_temp_vault
from core import storage
from core.errors import RequestError
from core.managers.platform_manager import PlatformManager


@unittest.skipUnless(shutil.which('node'), 'Node.js 가 필요합니다')
class PlatformInputContractTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.body = '도서관 주말 운영을 늘릴 계획입니다.\n평일 운영 시간은 유지합니다.\n사진 설명: 행사 현장입니다.'
        self.aid = storage.save_article({'draft': {'title': '도서관 운영 계획', 'subtitle': '표시 전용 부제',
            'url': 'https://example.test/source', 'content': self.body,
            'bodyHtml': '<p>' + self.body.replace('\n', '</p><p>') + '</p>'}})['articleId']
        self.snapshot = storage.create_snapshot(self.aid)
        self.expected = {'article_id': self.aid, 'title': self.snapshot['title'], 'content': self.snapshot['body_text']}
        generator = Path(__file__).resolve().parents[3] / 'platform-generator'
        setting = patch.dict('os.environ', {'PLATFORM_GENERATOR_DIR': str(generator)})
        setting.start(); self.addCleanup(setting.stop)
        self.manager = PlatformManager()

    @staticmethod
    def response(data):
        return {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(data, ensure_ascii=False)}]}]}

    def test_keywords_uses_frozen_body_without_subtitle_or_caption_guessing(self):
        seen = []
        def ai(request):
            seen.append(json.loads(request['input']))
            return self.response({'candidates': [{'keyword': '도서관', 'reason': '원문 주제', 'source_evidence': ['도서관']}]})
        with patch.object(PlatformManager, '_ai', staticmethod(ai)):
            out = self.manager.keywords({'snapshotId': self.snapshot['id'], 'article': {'title': '다른 화면', 'content': '다른 본문'}})
        self.assertEqual(seen, [{'title': self.expected['title'], 'content': self.expected['content']}])
        self.assertIn('사진 설명: 행사 현장입니다.', seen[0]['content'])
        self.assertTrue(out['candidates'][0]['evidence_valid'])

    def test_generation_and_validation_receive_three_fields_and_keep_url_as_metadata(self):
        seen = []
        def ai(request):
            seen.append(json.loads(request['input']))
            if request['text']['format']['name'].endswith('_validation'):
                return self.response({'issues': []})
            evidence = ['도서관 주말 운영을 늘릴 계획입니다.']
            return self.response({'emoji': '📰', 'opening': {'text': '도서관 주말 운영 확대 계획', 'source_evidence': evidence},
                'paragraphs': [{'text': '도서관은 주말 운영을 늘릴 계획입니다.', 'source_evidence': evidence}],
                'closing': {'text': '평일 운영 시간은 유지합니다.', 'source_evidence': ['평일 운영 시간은 유지합니다.']},
                'hashtags': ['#도서관', '#주말', '#운영']})
        with patch.object(PlatformManager, '_ai', staticmethod(ai)):
            result = self.manager.generate({'platform': 'instagram', 'snapshotId': self.snapshot['id'],
                'payload': {'article': {'article_id': self.aid, 'title': '최신 화면', 'content': '다른 본문', 'subtitle': '합치면 안 되는 부제'}, 'selected_keywords': [], 'requirements': ''}})
            draft = {**result['draft'], 'snapshot_id': self.snapshot['id']}
            checked = self.manager.validate({'snapshotId': self.snapshot['id'], 'payload': {'platform': 'instagram',
                'article': self.expected, 'draft': draft, 'selected_keywords': [], 'requirements': ''}})
        for request in seen:
            self.assertEqual(request['article'], self.expected)
            self.assertNotIn('source_url', request)
        self.assertEqual(result['draft']['source_url'], 'https://example.test/source')
        self.assertEqual(checked['validation']['status'], 'passed')

    def test_core_blog_request_is_rejected_by_real_platform_adapter_without_ai(self):
        with patch.object(PlatformManager, '_ai') as ai:
            with self.assertRaises(RequestError) as error:
                self.manager.generate({'platform': 'blog', 'snapshotId': self.snapshot['id'], 'payload': {'article': self.expected}})
        self.assertEqual(error.exception.status, 400)
        self.assertIn('지원하지', str(error.exception)); ai.assert_not_called()
