"""Storage Manager — local data access (doc §4, §6).

Frontend and AI modules must not touch file paths directly; they go through here.
Current implementation: encrypted SQLite (``core/storage.py`` on ``core/vault.py``, SQLCipher).
Planned: project files + attachments.
"""
from ..diagnostics import guarded
from ..media_assets import get_media_asset as _get_media_asset, media_asset_file as _media_asset_file, register_media_asset as _register_media_asset
from ..read_models import knowledge_map as _knowledge_map, list_articles as _list_articles
from ..sources import delete_source as _delete_source, get_source as _get_source, list_sources as _list_sources
from ..storage import (create_snapshot as _create_snapshot, get_revision as _get_revision, get_snapshot as _get_snapshot,
                       latest_article as _latest_article, media_file as _media_file, list_revisions as _list_revisions, list_snapshots as _list_snapshots,
                       open_source as _open_source, restore_revision as _restore_revision, save_article as _save_article,
                       source_file as _source_file)


class StorageManager:
    def save_article(self, data):
        """Persist a draft request ``{"draft": {...}, "expectedRevisionNo"?: int}`` to local storage (409 on mismatch)."""
        return guarded('article_save', _save_article, data)

    def open_source(self, data):
        """보관한 취재자료 원본을 기본 프로그램으로 연다 ``{"sourceId": ...}``."""
        return _open_source(data)

    def source_file(self, source_id):
        """앱 안 뷰어용 취재자료 원본 → (bytes, mime)."""
        return _source_file(source_id)

    def latest_article(self, photo_refs=False):
        """가장 최근에 저장된 원고 ``{"draft": {...} | None}``. photo_refs=True 면 사진은 'media:<id>' 참조로."""
        return _latest_article(photo_refs)

    def media_file(self, media_id):
        """원고 사진('media:<id>')의 바이트 → (bytes, mime)."""
        return _media_file(media_id)

    def list_revisions(self, article_id):
        """원고의 저장 이력 목록 ``{"revisions": [...]}`` (최신이 위)."""
        return _list_revisions(article_id)

    def get_revision(self, article_id, revision_no):
        """저장 이력 한 건의 미리보기(읽기 전용)."""
        return _get_revision(article_id, revision_no)

    def restore_revision(self, article_id, revision_no):
        """옛 저장본을 새 최신 저장본으로 복원한다(이력은 지우지 않음)."""
        return guarded('version_restore', _restore_revision, article_id, revision_no)

    def create_snapshot(self, article_id, data):
        """저장 이력(``{"revisionId"?: uuid}``, 없으면 최신)을 고칠 수 없는 고정본으로 만든다."""
        return _create_snapshot(article_id, data.get('revisionId'))

    def list_snapshots(self, article_id):
        """원고의 고정본 목록 ``{"snapshots": [...]}`` (최신이 위)."""
        return _list_snapshots(article_id)

    def get_snapshot(self, snapshot_id):
        """고정본 한 건(본문 포함)."""
        return _get_snapshot(snapshot_id)

    def register_media_asset(self, data):
        """사진을 미디어 자산(UUID)으로 등록한다 ``{"kind":"image","mime_type":..,"data":"data:..;base64,.."}`` (같은 바이트면 같은 자산)."""
        return guarded('media_register', _register_media_asset, data)

    def get_media_asset(self, asset_id):
        """미디어 자산 정보."""
        return _get_media_asset(asset_id)

    def media_asset_file(self, asset_id):
        """미디어 자산의 이미지 바이트 → (bytes, mime)."""
        return _media_asset_file(asset_id)

    def list_sources(self):
        """저장된 취재자료 목록과 각 자료를 쓰는 기사 ``{"sources": [...]}``."""
        return _list_sources()

    def get_source(self, source_id):
        """취재자료 한 건 정보."""
        return _get_source(source_id)

    def delete_source(self, source_id, data):
        """취재자료 삭제 ``{"force"?: bool}`` — 쓰는 기사가 있으면 force 없이는 409(SOURCE_IN_USE)로 경고만 한다."""
        return guarded('source_delete', _delete_source, source_id, (data or {}).get('force', False))

    def list_articles(self):
        """기사 목록(최신 수정순) ``{"articles": [...]}``."""
        return _list_articles()

    def knowledge_map(self):
        """기사·자료·고정본과 실제 근거 있는 연결의 읽기 전용 묶음(Data Map·보관함용)."""
        return _knowledge_map()
