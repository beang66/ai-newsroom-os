"""AI suggestions are only shown for exact, current article spans."""
import unittest
from unittest.mock import Mock

from app import critique, model_proofread, openai_adapter


class ModelProofreadTests(unittest.TestCase):
    def test_additional_typo_and_unicode_offsets(self):
        article='😀 오늘 회의가 잇었습니다.'
        start=article.index('잇었습니다')
        client=Mock()
        client.structured.return_value={'issues':[{'field':'body','start':start,'end':start+len('잇었습니다'),
            'original':'잇었습니다','replacement':'있었습니다','reason':'잘못된 철자'}]}
        result=model_proofread.OpenAIProofreader('test',client=client).check(article,'',[],[])
        self.assertEqual(result['state'],'evaluated')
        self.assertEqual(result['findings'][0]['anchor']['start'],start)
        self.assertEqual(result['findings'][0]['replacement'],'있었습니다')
        self.assertEqual(result['findings'][0]['basis'],'model_assessment')

    def test_fabricated_offsets_quoted_words_and_duplicate_rules_are_discarded(self):
        article='몇일 뒤 “잇어”라고 말했다. 잇다.'
        def issue(word,replacement,start):
            return {'field':'body','start':start,'end':start+len(word),
                'original':word,'replacement':replacement,'reason':'후보'}
        client=Mock()
        client.structured.return_value={'issues':[
            issue('없다','있다',0), issue('잇어','있어',article.index('잇어')),
            issue('몇일','며칠',0), issue('잇다','있다',article.index('잇다'))]}
        existing=critique.proofreading(article)
        result=model_proofread.OpenAIProofreader('test',client=client).check(article,'',[],existing)
        self.assertEqual([f['anchor']['text'] for f in result['findings']],['잇다'])
        self.assertEqual(result['rejected'],3)

    def test_unavailable_is_visible_and_keeps_local_checks(self):
        client=Mock()
        client.structured.side_effect=TimeoutError()
        result=model_proofread.OpenAIProofreader('test',client=client).check('몇일 뒤','',[],[])
        self.assertEqual(result['state'],'unavailable')
        self.assertEqual(result['findings'],[])

    def test_connection_probe_reports_safe_failure_and_success(self):
        from unittest.mock import patch
        with patch.dict('os.environ',{'OPENAI_API_KEY':'test'}), patch.object(openai_adapter.OpenAIResponses,'_post') as post:
            post.side_effect=TimeoutError('private request')
            self.assertEqual(openai_adapter.probe()['reason'],'network_or_timeout')
            post.side_effect=None
            post.return_value={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'{"ok":true}'}]}]}
            self.assertEqual(openai_adapter.probe()['status'],'connected')
            self.assertEqual(openai_adapter.connection_state()['reason'],'')


if __name__=='__main__': unittest.main()
