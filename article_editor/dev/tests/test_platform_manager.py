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

sys.path.insert(0, str(Path(__file__).resolve().parent))
_APP = Path(__file__).resolve().parents[2] / "app"
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.errors import RequestError
import vault_fixture  # noqa: E402,F401  — app/ 를 sys.path 에 올린다
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


@unittest.skipUnless(shutil.which("node"), "Node.js 가 필요합니다")
class PlatformManagerSnapshotTests(unittest.TestCase):
    """snapshotId 가 오면 화면이 보낸 기사 대신 고정본의 제목·본문으로 만들고, 응답에 snapshotId 를 싣는다(재현 가능한 입력)."""

    def setUp(self):
        from vault_fixture import use_temp_vault
        use_temp_vault(self)
        self.dir = tempfile.mkdtemp(prefix="ainews-platform-")
        Path(self.dir, "core-adapter.js").write_text(_ADAPTER, encoding="utf-8")
        patcher = patch.dict(os.environ, {"PLATFORM_GENERATOR_DIR": self.dir})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(shutil.rmtree, self.dir, True)

    def test_generate_uses_snapshot_text_and_echoes_id(self):
        from core import storage
        aid = storage.save_article({"draft": {"bodyHtml": "<p>고정본 본문입니다.</p>", "content": "고정본 본문입니다.", "title": "고정본 제목"}})["articleId"]
        snapshot = storage.create_snapshot(aid)
        sent = []

        def fake_ai(request):
            sent.append(json.loads(request["input"]))
            return {"status": "completed", "output": []}

        with patch.object(PlatformManager, "_ai", staticmethod(fake_ai)):
            result = PlatformManager().generate({"platform": "threads", "snapshotId": snapshot["id"],
                                                 "payload": {"article": {"title": "화면의 다른 제목", "content": "다른 본문"}, "selected_keywords": ["핵심"]}})
        self.assertEqual(result["snapshotId"], snapshot["id"])
        self.assertEqual(sent[0]["article"], {"title": "고정본 제목", "content": "고정본 본문입니다."})
        self.assertEqual(sent[0]["selected_keywords"], ["핵심"])

    def test_unknown_snapshot_is_404_before_node_runs(self):
        with patch("core.managers.platform_manager.shutil.which", return_value=None):  # Node 가 없어도 404 가 먼저
            with self.assertRaises(RequestError) as error:
                PlatformManager().generate({"platform": "threads", "snapshotId": "00000000-0000-4000-8000-000000000000", "payload": {}})
        self.assertEqual(error.exception.status, 404)


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


class PlatformManagerFrozenLookupTests(unittest.TestCase):
    def test_bundle_lookup_override_and_path_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            exe_dir, bundle = root / "exe", root / "bundle"
            exe_dir.mkdir()
            (bundle / "platform-generator").mkdir(parents=True)
            (bundle / "platform-generator" / "core-adapter.js").touch()
            with patch.object(sys, "frozen", True, create=True), \
                    patch.object(sys, "_MEIPASS", str(bundle), create=True), \
                    patch.object(sys, "executable", str(exe_dir / "AINewsroom.exe")), \
                    patch.dict(os.environ, {"PLATFORM_GENERATOR_DIR": ""}), \
                    patch("core.managers.platform_manager.shutil.which", return_value="path-node") as which:
                self.assertEqual(PlatformManager._generator_dir(), bundle / "platform-generator")
                self.assertEqual(PlatformManager._node_executable(), "path-node")
                which.assert_called_once_with("node")
                (bundle / "node").mkdir()
                (bundle / "node" / "node.exe").touch()
                self.assertEqual(PlatformManager._node_executable(), str(bundle / "node" / "node.exe"))
                (exe_dir / "node").mkdir()
                (exe_dir / "node" / "node.exe").touch()
                self.assertEqual(PlatformManager._node_executable(), str(exe_dir / "node" / "node.exe"))
                with patch.dict(os.environ, {"PLATFORM_GENERATOR_DIR": str(root / "override")}):
                    self.assertEqual(PlatformManager._generator_dir(), (root / "override").resolve())
                (bundle / "platform-generator" / "core-adapter.js").unlink()
                (exe_dir / "platform-generator").mkdir()
                (exe_dir / "platform-generator" / "core-adapter.js").touch()
                self.assertEqual(PlatformManager._generator_dir(), exe_dir / "platform-generator")
                sys._MEIPASS = str(exe_dir)
                self.assertEqual(PlatformManager._generator_dir(), exe_dir / "platform-generator")
                (exe_dir / "node" / "node.exe").unlink()
                which.return_value = None
                with self.assertRaises(RequestError) as error:
                    PlatformManager()._call({})
                self.assertEqual(error.exception.status, 503)
                self.assertIn("Node.js", str(error.exception))
                which.return_value = "path-node"
                (exe_dir / "platform-generator" / "core-adapter.js").unlink()
                with self.assertRaises(RequestError) as error:
                    PlatformManager()._call({})
                self.assertEqual(error.exception.status, 503)
                self.assertIn("어댑터", str(error.exception))
