"""The bundled DataMap sample stays useful as a link/backlink acceptance fixture."""
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
        sample_root = Path(__file__).resolve().parents[3] / "sample-data" / "datamap"
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


if __name__ == "__main__":
    unittest.main()
