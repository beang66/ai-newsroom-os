"""우리 core/ids.py 의 id 변환이 su4228 의 integration/core_contract.py 와 같은 값을 내는지 대조한다
(팀 namespace 를 그쪽 함수에 넘겼을 때). 둘이 어긋나면 담당자 어댑터가 만든 id 와 코어 id 가 달라진다."""
import env_isolation  # noqa: F401
import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
for _path in (_ROOT, _ROOT / "app"):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from core import ids  # noqa: E402
from integration import core_contract  # noqa: E402

NAMESPACE = str(ids.TEAM_NAMESPACE)


class IdsMatchContractTests(unittest.TestCase):
    def test_legacy_uuid_same_values(self):
        for entity, legacy in (("article", "a" * 32), ("media_asset", "b" * 32), ("revision", "c" * 32 + ":7"), ("source", "d" * 16)):
            self.assertEqual(ids.legacy_uuid(entity, legacy), core_contract.legacy_uuid(entity, legacy, NAMESPACE))

    def test_uuid_text_same_for_valid_input(self):
        for value in (ids.legacy_uuid("article", "x"), ids.legacy_uuid("article", "x").replace("-", "")):
            self.assertEqual(ids.uuid_text(value), core_contract.uuid_text(value))


if __name__ == "__main__":
    unittest.main()
