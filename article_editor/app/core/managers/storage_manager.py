"""Storage Manager — local data access (doc §4, §6).

Frontend and AI modules must not touch file paths directly; they go through here.
Current implementation: local JSON article files (``core/storage.py``).
Planned: encrypted SQLite + project files + attachments.
"""
from ..storage import save_article as _save_article


class StorageManager:
    def save_article(self, data):
        """Persist a draft request ``{"draft": {...}}`` to local storage."""
        return _save_article(data)
