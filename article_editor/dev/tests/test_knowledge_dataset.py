"""DataMap link/backlink acceptance fixture (dev/tests/fixtures/datamap)."""
import env_isolation  # noqa: F401
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402
from core import knowledge_files, read_models  # noqa: E402


class KnowledgeDatasetTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)

    def test_sample_dataset_has_resolved_backlinks_and_missing_targets(self):
        sample_root = Path(__file__).resolve().parent / "fixtures" / "datamap"
        files = [
            {"path": path.name, "content": path.read_text(encoding="utf-8")}
            for path in sorted(sample_root.glob("*.md"))
        ]

        result = knowledge_files.import_files({"files": files})
        graph = read_models.knowledge_map()

        self.assertEqual(result["imported"], 5)
        self.assertEqual(len(graph["files"]), 5)
        self.assertEqual(len(graph["file_links"]), 21)
        self.assertEqual(len(graph["edges"]), 18)
        self.assertEqual(len(graph["unresolved"]), 2)
        self.assertEqual(
            sum(not link["resolved"] for link in graph["file_links"]),
            3,
        )
        self.assertTrue(all(item["backlink_count"] > 0 for item in graph["files"]))

    def test_role_is_stored_by_core_from_role_folders(self):
        knowledge_files.import_files({"files": [
            {"path": "vault/프로젝트/인터뷰/a.md", "content": "# A"},
            {"path": "원자료/기획/b.md", "content": "# B"},
            {"path": "기획.md", "content": "# C"},
        ]})
        roles = {f["path"]: f["role"] for f in read_models.knowledge_map()["files"]}
        self.assertEqual(roles, {"vault/프로젝트/인터뷰/a.md": "interview", "원자료/기획/b.md": "plan", "기획.md": "note"},
                         "가장 안쪽 역할 폴더가 우선, 파일 이름은 쓰지 않는다")

    def test_files_and_notes_come_as_one_resource_list(self):
        from core import storage
        storage.save_source("통계.pdf", b"raw", "통계 본문")
        knowledge_files.import_files({"files": [{"path": "검증/check.md", "content": "# 검증"}]})
        resources = read_models.knowledge_map()["resources"]
        self.assertEqual(sorted((r["kind"], r["role"], r["name"]) for r in resources),
                         [("file", "data", "통계.pdf"), ("note", "verify", "검증")])


if __name__ == "__main__":
    unittest.main()
