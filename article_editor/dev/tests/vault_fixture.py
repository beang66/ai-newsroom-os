"""테스트용 임시 암호화 저장소 — 실제 APP_DATA 와 OS 자격 증명 저장소를 건드리지 않는다."""
import sys
import tempfile
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core import storage, vault  # noqa: E402

TEST_KEY = 'ab' * 32


def use_temp_vault(case):
    """case(TestCase) 동안 임시 DB 와 고정 키를 쓴다. 임시 폴더 경로를 돌려준다."""
    temp = tempfile.TemporaryDirectory()
    # TODO(debt: DEBT-005): source_ingest 워커가 끝나기 전에 DB/키 패치 복구와 폴더 삭제가 실행된다.
    # 서버 업로드 시험에서 database is locked / WinError 32 관찰. fixture 소유 워커를 먼저 기다리고,
    # 추출/HTTP 시험은 실모델 색인을 분리할 것(실사용 데이터 손실로 확인된 것은 아님).
    case.addCleanup(temp.cleanup)
    root = Path(temp.name)
    for patcher in (mock.patch.object(vault, 'DB_PATH', root / 'vault.db'),
                    mock.patch.object(vault, '_device_key', lambda: TEST_KEY),
                    mock.patch.object(storage, 'OPEN_DIR', root / 'open')):
        patcher.start()
        case.addCleanup(patcher.stop)
    return root
