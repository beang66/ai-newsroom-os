"""앱 종료(서버 정지) 때 외부 프로그램용 임시 복호화본 폴더가 지워진다."""
import sys
import unittest
from pathlib import Path

import env_isolation  # noqa: F401  (core 보다 먼저)
from vault_fixture import use_temp_vault

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))


class ExitCleanupTests(unittest.TestCase):
    def test_stop_removes_open_dir(self):
        use_temp_vault(self)
        from core import storage
        from desktop import runtime
        server = runtime.start_server()
        storage.OPEN_DIR.mkdir(parents=True, exist_ok=True)
        (storage.OPEN_DIR / 'source.txt').write_text('임시 복호화본', encoding='utf-8')
        server.stop()
        self.assertFalse(storage.OPEN_DIR.exists(), '종료하면 임시 복호화본이 남지 않아야 한다')


class WebviewScrubTests(unittest.TestCase):
    def test_scrub_removes_autofill_and_old_indexeddb_once(self):
        import tempfile
        from desktop import shell
        with tempfile.TemporaryDirectory() as temp:
            store = Path(temp)
            profile = store / 'EBWebView' / 'Default'
            (profile / 'IndexedDB' / 'x.leveldb').mkdir(parents=True)
            (profile / 'IndexedDB' / 'x.leveldb' / '000003.log').write_bytes(b'old plaintext')
            (profile / 'Web Data').write_bytes(b'autofill')
            (profile / 'Preferences').write_bytes(b'keep')
            shell.scrub_webview_store(store)
            self.assertFalse((profile / 'Web Data').exists())
            self.assertFalse((profile / 'IndexedDB').exists())
            self.assertTrue((profile / 'Preferences').exists(), '그 밖의 설정은 건드리지 않는다')
            (profile / 'IndexedDB').mkdir()
            (profile / 'IndexedDB' / 'new.log').write_bytes(b'encrypted backup')
            (profile / 'Web Data').write_bytes(b'autofill again')
            shell.scrub_webview_store(store)
            self.assertFalse((profile / 'Web Data').exists(), '자동 완성 기록은 매번 지운다')
            self.assertTrue((profile / 'IndexedDB' / 'new.log').exists(), 'IndexedDB 는 한 번만 비운다(암호화된 백업은 남는다)')


if __name__ == '__main__':
    unittest.main()
