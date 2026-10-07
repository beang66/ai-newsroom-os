"""Storage Manager — local data access (doc §4, §6).

Frontend and AI modules must not touch file paths directly; they go through here.
Current implementation: encrypted SQLite (``core/storage.py`` on ``core/vault.py``, SQLCipher).
Planned: project files + attachments.
"""
from ..diagnostics import guarded
from ..storage import (get_revision as _get_revision, latest_article as _latest_article, list_revisions as _list_revisions,
                       open_source as _open_source, restore_revision as _restore_revision, save_article as _save_article,
                       source_file as _source_file)


class StorageManager:
    def save_article(self, data):
        """Persist a draft request ``{"draft": {...}}`` to local storage."""
        return guarded('article_save', _save_article, data)

    def open_source(self, data):
        """보관한 취재자료 원본을 기본 프로그램으로 연다 ``{"sourceId": ...}``."""
        return _open_source(data)

    def source_file(self, source_id):
        """앱 안 뷰어용 취재자료 원본 → (bytes, mime)."""
        return _source_file(source_id)

    def latest_article(self):
        """가장 최근에 저장된 원고 ``{"draft": {...} | None}``."""
        return _latest_article()

    def list_revisions(self, article_id):
        """원고의 저장 이력 목록 ``{"revisions": [...]}`` (최신이 위)."""
        return _list_revisions(article_id)

    def get_revision(self, article_id, revision_no):
        """저장 이력 한 건의 미리보기(읽기 전용)."""
        return _get_revision(article_id, revision_no)

    def restore_revision(self, article_id, revision_no):
        """옛 저장본을 새 최신 저장본으로 복원한다(이력은 지우지 않음)."""
        return guarded('version_restore', _restore_revision, article_id, revision_no)
