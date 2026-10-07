"""platform-generator App Core adapter tests — no external AI/network.

실제 Node 프로세스(가짜 어댑터 + 진짜 core-bridge.js)로 줄 단위 통신을 시험한다. Node 가 없는 PC 에서는 건너뛴다.
"""
import env_isolation  # noqa: F401
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_APP = Path(__file__).resolve().parents[2] / "app"
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.errors import RequestError
from core.managers.platform_manager import PlatformManager

_REAL_BRIDGE = (Path(__file__).resolve().parents[3] / "platform-generator" / "core-bridge.js").as_posix()

# 가짜 어댑터: 첫 줄(작업)을 받고 → 코어에 AI 호출 1번 요청 → 응답을 결과에 담아 돌려준다. 환경(키 유무)도 보고한다.
_ADAPTER = """
const { readInput, call } = require(%r);
(async () => {
  try {
    const input = JSON.parse(await readInput());
    const ai = await call({ instructions: 'x', input: JSON.stringify(input.payload || input.article || {}) });
    process.stdout.write('로그 줄(JSON 아님)\\n');
    process.stdout.write(JSON.stringify({ ok: true, result: {
      action: input.action, ai,
      bridge: process.env.PLATFORM_AI_BRIDGE, hasOpenAiKey: !!process.env.OPENAI_API_KEY, hasGeminiKey: !!process.env.GEMINI_API_KEY,
    } }) + '\\n', () => process.exit(0));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message, status: error.status }) + '\\n', () => process.exit(1));
  }
})();
""" % _REAL_BRIDGE


@unittest.skipUnless(shutil.which("node"), "Node.js 가 필요합니다")
class PlatformManagerBridgeTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="ainews-platform-")
        Path(self.dir, "core-adapter.js").write_text(_ADAPTER, encoding="utf-8")
        self.patches = [patch.dict(os.environ, {"PLATFORM_GENERATOR_DIR": self.dir, "OPENAI_API_KEY": "k", "GEMINI_API_KEY": "g"})]
        for item in self.patches:
            item.start()
        self.manager = PlatformManager()

    def tearDown(self):
        for item in self.patches:
            item.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_generate_sends_payload_and_routes_ai_through_core(self):
        seen = []

        def fake_ai(request):
            seen.append(request)
            return {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "{}"}]}]}

        payload = {"article": {"title": "제목", "content": "본문"}, "selected_keywords": ["핵심"], "requirements": ""}
        with patch.object(PlatformManager, "_ai", staticmethod(fake_ai)):
            result = self.manager.generate({"platform": "instagram", "payload": payload})
        self.assertEqual(result["action"], "generate")
        self.assertEqual(result["ai"]["status"], "completed")  # Node 가 받은 응답은 코어가 만든 것
        self.assertEqual(seen[0]["instructions"], "x")
        self.assertEqual(json.loads(seen[0]["input"])["selected_keywords"], ["핵심"])
        self.assertEqual(result["bridge"], "core")
        self.assertFalse(result["hasOpenAiKey"])  # Node 프로세스에는 외부 AI 키를 넘기지 않는다
        self.assertFalse(result["hasGeminiKey"])

    def test_keywords_passes_only_article(self):
        with patch.object(PlatformManager, "_ai", staticmethod(lambda request: {"status": "completed", "output": []})):
            result = self.manager.keywords({"article": {"title": "제목", "content": "본문", "extra": "버림"}})
        self.assertEqual(result["action"], "keywords")

    def test_ai_error_reaches_node_and_comes_back_with_status(self):
        def refuse(_request):
            raise RequestError("사용 한도에 도달했어요.", 429)

        with patch.object(PlatformManager, "_ai", staticmethod(refuse)):
            with self.assertRaises(RequestError) as error:
                self.manager.generate({"platform": "threads", "payload": {"a": 1}})
        self.assertEqual(error.exception.status, 429)
        self.assertIn("사용 한도", str(error.exception))

    def test_model_comes_from_core_config(self):
        from core import config

        sent = {}

        def fake_openai_call(path, payload):
            sent.update(path=path, payload=payload)
            return {"status": "completed", "output": []}

        with patch("core.ai.client.openai_call", fake_openai_call):
            PlatformManager._ai({"model": "gpt-5", "store": True, "instructions": "x"})
        self.assertEqual(sent["path"], "responses")
        self.assertEqual(sent["payload"]["model"], config.TEXT_MODEL)
        self.assertIs(sent["payload"]["store"], False)


class PlatformManagerGuardTests(unittest.TestCase):
    def test_rejects_unknown_platform_before_node(self):
        with self.assertRaises(RequestError) as error:
            PlatformManager().generate({"platform": "twitter", "payload": {}})
        self.assertEqual(error.exception.status, 400)

    @patch("core.managers.platform_manager.shutil.which", return_value=None)
    def test_missing_node_is_service_unavailable(self, _):
        with self.assertRaises(RequestError) as error:
            PlatformManager().generate({"platform": "instagram", "payload": {}})
        self.assertEqual(error.exception.status, 503)


if __name__ == "__main__":
    unittest.main()
