"""Storage Manager — local data access (doc §4, §6).

Frontend and AI modules must not touch file paths directly; they go through here.
Current implementation: local JSON article files (``core/storage.py``).
Planned: encrypted SQLite + project files + attachments.
"""
from ..storage import save_article as _save_article
from ..config import ROOT


class StorageManager:
    def __init__(self, root=None):
        self.root = root or ROOT

    def save_article(self, data):
        """Persist a draft request ``{"draft": {...}}`` to local storage."""
        return _save_article(data)
