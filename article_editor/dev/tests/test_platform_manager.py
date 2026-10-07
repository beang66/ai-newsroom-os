"""platform-generator App Core adapter tests — no external AI/network."""
import env_isolation  # noqa: F401
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

_APP = Path(__file__).resolve().parents[2] / "app"
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.errors import RequestError
from core.managers.platform_manager import PlatformManager


class PlatformManagerTests(unittest.TestCase):
    def setUp(self):
        self.manager = PlatformManager()

    def completed(self, payload, code=0, stderr=""):
        return SimpleNamespace(
            stdout=json.dumps(payload, ensure_ascii=False),
            stderr=stderr,
            returncode=code,
        )

    @patch("core.managers.platform_manager.Path.is_file", return_value=True)
    @patch("core.managers.platform_manager.shutil.which", return_value="node")
    @patch("core.managers.platform_manager.subprocess.run")
    def test_generate_passes_platform_payload_to_existing_adapter(self, run, *_):
        run.return_value = self.completed({
            "ok": True,
            "result": {"success": True, "draft": {"platform": "instagram", "opening": "초안"}},
        })
        payload = {
            "article": {"title": "제목", "content": "본문"},
            "selected_keywords": ["핵심"],
            "requirements": "",
        }
        result = self.manager.generate({"platform": "instagram", "payload": payload})
        self.assertEqual(result["draft"]["opening"], "초안")
        sent = json.loads(run.call_args.kwargs["input"])
        self.assertEqual(sent, {"action": "generate", "platform": "instagram", "payload": payload})
        self.assertEqual(run.call_args.kwargs["cwd"].replace("\\", "/").split("/")[-1], "platform-generator")

    @patch("core.managers.platform_manager.Path.is_file", return_value=True)
    @patch("core.managers.platform_manager.shutil.which", return_value="node")
    @patch("core.managers.platform_manager.subprocess.run")
    def test_keywords_passes_only_article_to_adapter(self, run, *_):
        run.return_value = self.completed({
            "ok": True,
            "result": {"candidates": [{"keyword": "핵심", "reason": "중요", "source_evidence": ["본문"]}]},
        })
        result = self.manager.keywords({"article": {"title": "제목", "content": "본문"}})
        self.assertEqual(result["candidates"][0]["keyword"], "핵심")
        sent = json.loads(run.call_args.kwargs["input"])
        self.assertEqual(sent["action"], "keywords")
        self.assertEqual(sent["article"], {"title": "제목", "content": "본문"})

    def test_rejects_unknown_platform_before_node(self):
        with self.assertRaises(RequestError) as error:
            self.manager.generate({"platform": "twitter", "payload": {}})
        self.assertEqual(error.exception.status, 400)

    @patch("core.managers.platform_manager.shutil.which", return_value=None)
    def test_missing_node_is_service_unavailable(self, _):
        with self.assertRaises(RequestError) as error:
            self.manager.generate({"platform": "instagram", "payload": {}})
        self.assertEqual(error.exception.status, 503)


if __name__ == "__main__":
    unittest.main()
