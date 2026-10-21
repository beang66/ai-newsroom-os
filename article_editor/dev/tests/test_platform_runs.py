"""Persisted platform work survives remounts and process restarts without live AI."""
import env_isolation  # noqa: F401
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))
from core import platform_runs, storage  # noqa: E402
import vault_fixture  # noqa: E402


class FakeManager:
    def __init__(self):
        self.calls = []

    def generate(self, data):
        self.calls.append(data['platform'])
        if data['platform'] == 'card_news':
            return {'draft': {'article_id': data['payload']['article']['article_id'],
                              'cards': [{'card_id': 'a', 'role': 'cover',
                                         'content': {'keyword': '서울😀', 'headline': '제목', 'body': '본문'}}]}}
        return {'draft': {'article_id': data['payload']['article']['article_id'],
                          'opening': data['platform'] + ' result'}}

    def render(self, data):
        self.calls.append('render')
        return {'asset': {'id': 'asset-id', 'local_uri': '/api/media-assets/asset-id/file'}}


class PlatformRunTests(unittest.TestCase):
    def setUp(self):
        vault_fixture.use_temp_vault(self)
        saved = storage.save_article({'draft': {'title': '시작 기사', 'bodyHtml': '<p>시작 본문</p>',
                                                 'content': '시작 본문'}})
        self.snapshot = storage.create_snapshot(saved['articleId'])
        self.manager = FakeManager()

    def start(self, targets=('instagram', 'threads')):
        with patch.object(platform_runs, '_launch'):
            return platform_runs.start_run({
                'articleId': self.snapshot['article_id'], 'snapshotId': self.snapshot['id'],
                'revisionNo': self.snapshot['revision_no'], 'sourceSignature': '["시작 기사","","시작 본문",""]',
                'targets': list(targets), 'selectedKeywords': [], 'requirements': '',
                'baseFingerprints': {target: '' for target in targets},
            }, self.manager)

    def test_results_are_persisted_by_original_article_and_snapshot(self):
        run = self.start()
        self.assertEqual(platform_runs.list_runs(run['article_id'])['runs'][0]['id'], run['id'])
        platform_runs._work(run['id'], self.manager)
        result = platform_runs.get_run(run['id'])
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['revision_no'], self.snapshot['revision_no'])
        self.assertEqual(self.manager.calls, ['instagram', 'threads'])
        for target in result['targets']:
            draft = result['results'][target]['draft']
            self.assertEqual(result['results'][target]['status'], 'succeeded')
            self.assertEqual(draft['generation_run']['id'], run['id'])
            self.assertEqual(draft['snapshot_id'], self.snapshot['id'])
        self.assertEqual(platform_runs.list_runs('another-article')['runs'], [])

    def test_generation_input_is_three_fields_and_keeps_url_as_metadata(self):
        saved = storage.save_article({'draft': {'title': '부제 있는 기사', 'subtitle': '화면 부제', 'url': 'https://example.test/a',
                                                 'bodyHtml': '<p>부제 본문</p>', 'content': '부제 본문'}})
        self.snapshot = storage.create_snapshot(saved['articleId'])
        run = self.start(('instagram',))
        platform_runs._work(run['id'], self.manager)
        draft = platform_runs.get_run(run['id'])['results']['instagram']['draft']
        self.assertEqual(draft['generation_input']['article'],
                         {'article_id': saved['articleId'], 'title': '부제 있는 기사', 'content': self.snapshot['body_text']})
        self.assertEqual(draft['generation_input']['source_url'], self.snapshot['url'])

    def test_resume_skips_finished_target_and_retries_pending_target(self):
        run = self.start()
        platform_runs._update(run['id'], status='running', target='instagram',
                              entry={'status': 'succeeded', 'draft': {'opening': 'saved'}})
        with patch.object(platform_runs, '_launch') as launch:
            self.assertEqual(platform_runs.resume_runs(self.manager), 1)
            launch.assert_called_once_with(run['id'], self.manager)
        platform_runs._work(run['id'], self.manager)
        self.assertEqual(self.manager.calls, ['threads'])
        self.assertEqual(platform_runs.get_run(run['id'])['results']['instagram']['draft']['opening'], 'saved')

    def test_card_render_key_matches_frontend_contract(self):
        card = {'card_id': 'a', 'role': 'cover',
                'content': {'keyword': '서울😀', 'headline': '제목', 'body': '본문'}}
        self.assertEqual(platform_runs._render_key(card, 0, 1, 'article', 'snapshot'),
                         'v1:183:a928a60e32491f2e9d0a31320eb0bd46')
        run = self.start(('card_news',))
        platform_runs._work(run['id'], self.manager)
        result = platform_runs.get_run(run['id'])['results']['card_news']
        self.assertEqual(result['status'], 'succeeded')
        self.assertEqual(result['draft']['cards'][0]['rendered_image']['snapshot_id'], self.snapshot['id'])
        self.assertEqual(self.manager.calls, ['card_news', 'render'])

    def test_background_launch_finishes_after_screen_detaches(self):
        run = self.start(('threads',))
        platform_runs._launch(run['id'], self.manager)
        platform_runs.wait_for_active_runs()
        self.assertEqual(platform_runs.get_run(run['id'])['status'], 'completed')
        self.assertEqual(self.manager.calls, ['threads'])
