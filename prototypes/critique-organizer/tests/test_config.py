"""Local key loading never overwrites a deployment environment variable."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config


class ConfigTests(unittest.TestCase):
    def test_local_env_is_loaded_only_from_the_project_and_process_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, '.env').write_text(
                '# local only\nOPENAI_API_KEY=local-key\nOPENAI_MODEL="gpt-5.4-mini"\nOTHER_SECRET=ignored\n')
            with patch.object(config, 'ROOT', Path(directory)), patch.dict(os.environ, {
                'OPENAI_API_KEY':'deployment-key', 'OPENAI_MODEL':'', 'OTHER_SECRET':'',
            }):
                config.load_local_env()
                self.assertEqual(os.environ['OPENAI_API_KEY'], 'deployment-key')
                self.assertEqual(os.environ['OPENAI_MODEL'], '')
                self.assertEqual(os.environ['OTHER_SECRET'], '')
