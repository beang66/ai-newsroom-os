"""테스트용 임시 암호화 저장소 — 실제 APP_DATA 와 OS 자격 증명 저장소를 건드리지 않는다."""
import sys
import tempfile
import threading
import time
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core import storage, vault  # noqa: E402

TEST_KEY = 'ab' * 32


def _join_background_jobs(timeout=90.0):
    """백그라운드 작업(core.jobs.run_in_background 가 띄우는 'job-…' 스레드)이 끝날 때까지 기다린다.
    DEBT-005: 자료 업로드가 시작한 색인 작업이 끝나기 전에 DB/키 패치를 풀고 임시 폴더를 지우면
    다음 테스트가 'file is not a database'·'Directory not empty'(윈도우: database is locked·WinError 32)로 깨졌다.
    모델이 설치된 PC 에서는 이 작업이 실제 임베딩 모델을 불러와(전체 스위트처럼 부하가 클 때 10초를 넘긴다) 대기를 90초로 둔다."""
    deadline = time.monotonic() + timeout
    for thread in threading.enumerate():
        if thread.name.startswith('job-') and thread is not threading.current_thread():
            thread.join(max(0.0, deadline - time.monotonic()))


def use_temp_vault(case):
    """case(TestCase) 동안 임시 DB 와 고정 키를 쓴다. 임시 폴더 경로를 돌려준다."""
    temp = tempfile.TemporaryDirectory()
    case.addCleanup(temp.cleanup)
    root = Path(temp.name)
    for patcher in (mock.patch.object(vault, 'DB_PATH', root / 'vault.db'),
                    mock.patch.object(vault, '_device_key', lambda: TEST_KEY),
                    mock.patch.object(storage, 'OPEN_DIR', root / 'open')):
        patcher.start()
        case.addCleanup(patcher.stop)
    case.addCleanup(_join_background_jobs)  # 정리는 거꾸로 돈다 → 작업 대기 → 패치 해제 → 임시 폴더 삭제
    return root
