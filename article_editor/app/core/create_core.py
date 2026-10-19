"""App Core bootstrap — assemble managers into one Core object (doc §4).

This is the integration layer the Frontend talks to (directly, or via ``core/api.py``).
Internal implementations can change freely; the exposed API contract stays stable.
"""
from .managers.ai_manager import AIManager
from .managers.backup_manager import BackupManager
from .managers.job_manager import JobManager
from .managers.model_manager import ModelManager
from .managers.platform_manager import PlatformManager
from .managers.session_manager import SessionManager
from .managers.settings_manager import SettingsManager
from .managers.share_manager import ShareManager
from .managers.storage_manager import StorageManager
from .managers.transfer_manager import TransferManager
from .managers.ut_event_manager import UtEventManager


class Core:
    def __init__(self):
        self.session = SessionManager()
        self.backup = BackupManager(self.session)
        self.settings = SettingsManager()
        self.events = UtEventManager(self.settings)
        self.storage = StorageManager(on_saved=self.backup.notify, events=self.events)
        self.ai = AIManager()
        self.models = ModelManager()
        self.transfer = TransferManager(self.session)
        self.shares = ShareManager(self.session, self.storage)
        self.platform = PlatformManager()
        self.jobs = JobManager()
        try:
            self.jobs.recover_interrupted()  # 이전 실행이 남긴 queued/running 작업 → failed(INTERRUPTED)
        except Exception:
            pass  # 저장소를 못 열어도 시작은 막지 않는다(필요할 때 저장소가 다시 오류를 낸다)
        try:
            self.platform.resume_runs()
        except Exception:
            pass  # 로그인 전에는 저장소를 열 수 없다. 로그인 후 다시 이어간다.


def create_core():
    """Build the App Core (managers wired together)."""
    return Core()
