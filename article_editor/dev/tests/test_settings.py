"""환경 설정(cloudBackup): 기본 켜짐, 끄면 유지, 로그인 설정과 같은 settings.json 을 망가뜨리지 않는다."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from vault_fixture import use_temp_vault  # noqa: F401  (sys.path 준비)
from core.errors import RequestError
from core.managers import session_manager, settings_manager


class SettingsTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.file = Path(temp.name) / 'settings.json'
        for module in (session_manager, settings_manager):
            patcher = mock.patch.object(module, 'SETTINGS', self.file)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.settings = settings_manager.SettingsManager()

    def test_default_on_then_off_persists_and_keeps_other_keys(self):
        self.assertEqual(self.settings.get(), {'cloudBackup': True})
        self.file.write_text(json.dumps({'auto_login': False}), encoding='utf-8')
        self.assertEqual(self.settings.update({'cloudBackup': False}), {'cloudBackup': False})
        self.assertEqual(settings_manager.SettingsManager().get(), {'cloudBackup': False})
        self.assertEqual(json.loads(self.file.read_text(encoding='utf-8'))['auto_login'], False)

    def test_rejects_non_boolean(self):
        with self.assertRaises(RequestError):
            self.settings.update({'cloudBackup': 'no'})


if __name__ == '__main__':
    unittest.main()
