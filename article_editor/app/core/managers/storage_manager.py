"""Storage Manager — local data access (doc §4, §6).

Frontend and AI modules must not touch file paths directly; they go through here.
Current implementation: local JSON article files (``core/storage.py``).
Planned: encrypted SQLite + project files + attachments.
"""
from ..storage import open_source as _open_source, save_article as _save_article


class StorageManager:
    def save_article(self, data):
        """Persist a draft request ``{"draft": {...}}`` to local storage."""
        return _save_article(data)

    def open_source(self, data):
        """보관한 취재자료 원본을 기본 프로그램으로 연다 ``{"sourceId": ...}``."""
        return _open_source(data)
