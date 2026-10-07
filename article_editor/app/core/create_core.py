"""App Core bootstrap — assemble managers into one Core object (doc §4).

This is the integration layer the Frontend talks to (directly, or via ``core/api.py``).
Internal implementations can change freely; the exposed API contract stays stable.
"""
from .managers.ai_manager import AIManager
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


def create_core():
    """Build the App Core (managers wired together)."""
    return Core()
