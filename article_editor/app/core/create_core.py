"""App Core bootstrap — assemble managers into one Core object (doc §4).

This is the integration layer the Frontend talks to (directly, or via ``core/api.py``).
Internal implementations can change freely; the exposed API contract stays stable.
"""
from .managers.ai_manager import AIManager
from .managers.job_manager import JobManager
from .managers.model_manager import ModelManager
from .managers.platform_manager import PlatformManager
from .managers.session_manager import SessionManager
from .managers.storage_manager import StorageManager


class Core:
    def __init__(self):
        self.storage = StorageManager()
        self.ai = AIManager()
        self.session = SessionManager()
        self.models = ModelManager()
        self.platform = PlatformManager()
        self.jobs = JobManager()
        try:
            self.jobs.recover_interrupted()  # 이전 실행이 남긴 queued/running 작업 → failed(INTERRUPTED)
        except Exception:
            pass  # 저장소를 못 열어도 시작은 막지 않는다(필요할 때 저장소가 다시 오류를 낸다)


def create_core():
    """Build the App Core (managers wired together)."""
    return Core()
