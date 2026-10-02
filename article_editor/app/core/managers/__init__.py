"""App Core managers (see APP_CORE_ARCHITECTURE.md §4).

Each manager owns one responsibility of the integration layer. The Frontend never
talks to a manager directly; it goes through the App Core API. Internal
implementation may change freely, the API contract stays stable.
"""
from .project_manager import ProjectManager
from .storage_manager import StorageManager
from .ai_manager import AIManager
from .session_manager import SessionManager
from .model_manager import ModelManager
from .collaboration_manager import CollaborationManager
from .sync_manager import SyncManager
from .encryption_manager import EncryptionManager
from .update_manager import UpdateManager

__all__ = [
    "ProjectManager",
    "StorageManager",
    "AIManager",
    "SessionManager",
    "ModelManager",
    "CollaborationManager",
    "SyncManager",
    "EncryptionManager",
    "UpdateManager",
]
