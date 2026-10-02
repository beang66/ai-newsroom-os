"""App Core bootstrap — assemble managers into one Core object (doc §4).

This is the integration layer the Frontend talks to (directly, or via ``core/api.py``).
Internal implementations can change freely; the exposed API contract stays stable.
"""
from .managers import (
    ProjectManager,
    StorageManager,
    AIManager,
    SessionManager,
    ModelManager,
    CollaborationManager,
    SyncManager,
    EncryptionManager,
    UpdateManager,
)


class Core:
    def __init__(self):
        self.storage = StorageManager()
        self.ai = AIManager()
        self.session = SessionManager()
        self.models = ModelManager()
        self.project = ProjectManager(self.storage)
        self.collaboration = CollaborationManager()
        self.sync = SyncManager()
        self.encryption = EncryptionManager()
        self.update = UpdateManager()


def create_core():
    """Build the App Core (managers wired together)."""
    return Core()
