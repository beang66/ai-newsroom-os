"""발행·백업·녹취 보존의 데이터 경계 회귀 검사."""
import env_isolation  # noqa: F401
import base64
import sys
import unittest
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core import backend_proxy, storage, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402
from core.managers.platform_manager import PlatformManager  # noqa: E402
from vault_fixture import use_temp_vault  # noqa: E402


class ReliabilityFeaturesTests(unittest.TestCase):
    def test_portable_backup_restores_without_exporting_device_key(self):
        root = use_temp_vault(self)
        first = storage.save_article({'draft': {'title': '백업 원고', 'bodyHtml': '<p>보존</p>'}})['articleId']
        raw = vault.export_backup('portable-password-123')
        self.assertGreater(len(raw), 1000)
        storage.save_article({'draft': {'title': '백업 이후', 'bodyHtml': '<p>나중</p>'}})
        restored = vault.restore_backup(raw, 'portable-password-123')
        self.assertTrue(restored['restored'])
        self.assertEqual(storage.latest_article()['draft']['articleId'], first)
        self.assertTrue((root / 'vault.before-restore.db').is_file())

    def test_backup_rejects_wrong_password_without_replacing_current_data(self):
        use_temp_vault(self)
        storage.save_article({'draft': {'title': '현재 원고', 'bodyHtml': '<p>현재</p>'}})
        raw = vault.export_backup('correct-password-123')
        with self.assertRaises(RequestError):
            vault.restore_backup(raw, 'wrong-password-1234')
        self.assertEqual(storage.latest_article()['draft']['title'], '현재 원고')

    def test_transcript_keeps_audio_and_all_dialogues(self):
        use_temp_vault(self)
        audio = b'full original audio'
        result = storage.save_transcript({
            'filename': 'interview.m4a', 'mimeType': 'audio/mp4',
            'data': 'data:audio/mp4;base64,' + base64.b64encode(audio).decode(),
        }, {'dialogues': [{'id': 'seg-1', 'speaker': 'reporter', 'speakerName': '기자',
                           'timestamp': 0, 'text': '전체 녹취'}], 'duration': 12.5})
        identifier = result['transcriptId']
        self.assertEqual(storage.list_transcripts()['transcripts'][0]['segments'], 1)
        self.assertEqual(storage.get_transcript(identifier)['dialogues'][0]['text'], '전체 녹취')
        self.assertEqual(storage.transcript_audio(identifier), (audio, 'audio/mp4'))

    def test_cms_publish_uses_backend_and_drops_embedded_photo_bytes(self):
        article = {'articleId': 'a' * 32, 'title': '실제 송고', 'subtitle': '부제', 'content': '본문',
                   'photos': [{'caption': '설명', 'data': 'data:image/png;base64,SECRET'}]}
        with mock.patch.object(backend_proxy, 'post', return_value={'id': 'cms-1'}) as post:
            out = PlatformManager().publish({'article': article})
        self.assertEqual(out, {'published': True, 'id': 'cms-1'})
        self.assertEqual(post.call_args.args[0], '/cms/publish')
        self.assertNotIn('SECRET', str(post.call_args.args[1]))


    def test_restore_failure_before_swap_keeps_live_db(self):
        use_temp_vault(self)
        storage.save_article({'draft': {'title': 'backup', 'bodyHtml': '<p>a</p>'}})
        raw = vault.export_backup('portable-password-123')
        storage.save_article({'draft': {'title': 'live', 'bodyHtml': '<p>b</p>'}})
        with mock.patch.object(vault.os, 'replace', side_effect=OSError('power loss')):
            with self.assertRaises(OSError):
                vault.restore_backup(raw, 'portable-password-123')
        self.assertTrue(vault.DB_PATH.is_file())
        self.assertEqual(storage.latest_article()['draft']['title'], 'live')

    def test_backup_too_big_to_restore_is_refused_at_export(self):
        use_temp_vault(self)
        storage.save_article({'draft': {'title': 'big', 'bodyHtml': '<p>a</p>'}})
        with mock.patch.object(vault, 'MAX_BACKUP_BYTES', 100):
            with self.assertRaises(RequestError) as caught:
                vault.export_backup('portable-password-123')
        self.assertEqual(caught.exception.status, 413)

    def test_cms_publish_rejects_error_and_empty_responses(self):
        article = {'articleId': 'a' * 32, 'title': 'title', 'subtitle': '', 'content': 'body'}
        for bad in ({'error': 'validation failed'}, {}):
            with mock.patch.object(backend_proxy, 'post', return_value=bad):
                with self.assertRaises(RequestError):
                    PlatformManager().publish({'article': article})

if __name__ == '__main__':
    unittest.main()
