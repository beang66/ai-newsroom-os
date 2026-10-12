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


if __name__ == '__main__':
    unittest.main()
