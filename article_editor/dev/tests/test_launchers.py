"""Windows launchers must remain cmd-safe and bootstrap their Python runtime."""
import unittest
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class LauncherBatchTests(unittest.TestCase):
    def test_window_launchers_are_ascii_and_use_shared_dependency_bootstrap(self):
        for name in ('start_windows.bat', 'start_window.bat'):
            content = (ROOT / name).read_bytes()
            self.assertTrue(content.isascii(), f'{name} must stay ASCII for cmd.exe')
            text = content.decode('ascii')
            self.assertIn('ensure_storage_deps.bat', text)
            self.assertIn('AI_NEWSROOM_PYTHON', text)

    def test_dependency_bootstrap_uses_project_runtime_and_storage_requirements(self):
        text = (ROOT / 'scripts' / 'ensure_storage_deps.bat').read_text(encoding='ascii')
        self.assertIn('.runtime', text)
        self.assertIn('--target', text)
        self.assertIn('requirements-storage.txt', text)
        self.assertIn('import keyring', text)
        self.assertIn('import sqlcipher3', text)

    def test_direct_server_command_discovers_project_runtime(self):
        env = os.environ.copy()
        env.pop('PYTHONPATH', None)
        result = subprocess.run(
            [sys.executable, '-c', "import sys; sys.path.insert(0, 'app'); import server"],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
