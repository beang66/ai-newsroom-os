"""Storage Manager — local data access (doc §4, §6).

Frontend and AI modules must not touch file paths directly; they go through here.
Current implementation: encrypted SQLite (``core/storage.py`` on ``core/vault.py``, SQLCipher).
Planned: project files + attachments.
"""
import time

from ..diagnostics import guarded
from ..knowledge_files import delete_file as _delete_knowledge_file, get_file as _get_knowledge_file, import_files as _import_knowledge_files
from ..media_assets import get_media_asset as _get_media_asset, media_asset_file as _media_asset_file, register_media_asset as _register_media_asset
from ..read_models import knowledge_map as _knowledge_map, list_articles as _list_articles
from ..sources import delete_source as _delete_source, get_source as _get_source, list_sources as _list_sources
from ..storage import (create_snapshot as _create_snapshot, get_revision as _get_revision, get_snapshot as _get_snapshot,
                       get_transcript as _get_transcript, list_transcripts as _list_transcripts,
                       latest_article as _latest_article, get_article as _get_article, publish_article as _publish_article, media_file as _media_file, list_revisions as _list_revisions, list_snapshots as _list_snapshots,
                       open_source as _open_source, restore_revision as _restore_revision, prune_legacy_revisions as _prune_legacy_revisions, save_article as _save_article, delete_article as _delete_article,
                       list_trash as _list_trash, restore_deleted as _restore_deleted,
                       source_file as _source_file, transcript_audio as _transcript_audio, save_speaker_edits as _save_speaker_edits)
from .. import vault


class StorageManager:
    def __init__(self, on_saved=None, events=None):
        self._on_saved = on_saved  # (article_id, kind) — 저장이 끝나면 부른다(서버 백업 알림). 실패해도 저장에는 영향 없음
        self._events = events

    def _saved(self, result, kind):
        """kind: 'manual' | 'auto' | 'deleted'(휴지통으로 옮김)."""
        if self._on_saved and isinstance(result, dict) and result.get('articleId'):
            try:
                self._on_saved(result['articleId'], kind)
            except Exception:
                pass
        return result

    def save_article(self, data):
        """Persist a draft request ``{"draft": {...}, "expectedRevisionNo"?: int}`` to local storage (409 on mismatch)."""
        started = time.monotonic()
        try:
            result = guarded('article_save', _save_article, data)
        except Exception as error:
            if self._events:
                draft = data.get('draft') if isinstance(data, dict) else None
                self._events.record('article_save_failed', article_id=draft.get('articleId') if isinstance(draft, dict) else None,
                                    error_code=self._events.error_code(error), duration_ms=int((time.monotonic() - started) * 1000))
            raise
        if self._events and isinstance(result, dict):
            self._events.record('article_persisted', article_id=result.get('articleId'), revision_no=result.get('revisionNo'),
                                save_kind=result.get('kind', 'manual'), duration_ms=int((time.monotonic() - started) * 1000))
        return self._saved(result, result.get('kind', 'manual') if isinstance(result, dict) else 'manual')

    def publish_article(self, data):
        """CMS 최종 발행 ``{"draft": {...}}`` — 수동 저장 + 기사당 하나인 발행본 덮어쓰기(발행 시각 갱신)."""
        return self._saved(guarded('article_publish', _publish_article, data), 'manual')

    def get_article(self, article_id, version=None, photo_refs=False):
        """기사 하나를 편집기로 연다. 모양은 latest_article 과 같다.
        version 없음 = 그 기사의 최신 저장본(임시 저장 포함) | 'saved'(마지막 수동 저장본) | 'published'(발행본)."""
        started = time.monotonic()
        result = _latest_article(photo_refs, article_id) if version is None else _get_article(article_id, version, photo_refs)
        if self._events:
            self._events.record('article_reopened', article_id=article_id, revision_no=result.get('revisionNo'),
                                duration_ms=int((time.monotonic() - started) * 1000))
        return result

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
        result = guarded('version_restore', _restore_revision, article_id, revision_no)
        if self._on_saved:
            try:
                self._on_saved(article_id, 'manual')
            except Exception:
                pass
        return result

    def delete_article(self, article_id):
        """보관소에서 기사 지우기 = 휴지통(30일 뒤 영구 삭제) → {deleted, articleId, purgeAt}.
        서버 백업 사본은 바로 지운다 — 영구 삭제한 기사가 서버 백업 복구로 되살아나지 않게."""
        return self._saved(_delete_article(article_id), 'deleted')

    def list_trash(self):
        """휴지통 목록 ``{"articles": [{articleId, title, deletedAt, purgeAt}]}``."""
        return _list_trash()

    def restore_deleted(self, article_id):
        """휴지통에서 되살린다(서버 백업도 다시 올린다) → {restored, articleId}."""
        return self._saved(_restore_deleted(article_id), 'manual')

    def prune_legacy_revisions(self, article_id):
        """수동 저장 도입 전의 옛 자동 저장 이력을 지운다(저장 이력 화면의 '정리')."""
        return guarded('revision_prune', _prune_legacy_revisions, article_id)

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

    def import_knowledge_files(self, data):
        """앱 관리 저장소에 Markdown 지식 파일을 가져오고 링크를 다시 해석한다."""
        return guarded('knowledge_files_import', _import_knowledge_files, data)

    def get_knowledge_file(self, file_id):
        """Markdown 지식 파일 한 건과 실제 링크·백링크를 반환한다."""
        return _get_knowledge_file(file_id)

    def delete_knowledge_file(self, file_id):
        """Markdown 지식 파일을 삭제하고 남은 링크를 다시 해석한다."""
        return guarded('knowledge_file_delete', _delete_knowledge_file, file_id)

    def list_transcripts(self):
        return _list_transcripts()

    def get_transcript(self, transcript_id):
        return _get_transcript(transcript_id)

    def transcript_audio(self, transcript_id):
        return _transcript_audio(transcript_id)

    def save_speaker_edits(self, transcript_id, edits):
        return _save_speaker_edits(transcript_id, edits)

    def export_backup(self, data):
        import base64
        raw = vault.export_backup(data.get('password'))
        return {'filename': 'ai-newsroom-backup.db', 'data': base64.b64encode(raw).decode()}

    def restore_backup(self, data):
        import base64
        encoded = data.get('data')
        if not isinstance(encoded, str):
            from ..errors import RequestError
            raise RequestError('복구할 백업 파일을 선택해 주세요.')
        try:
            raw = base64.b64decode(encoded.split(',', 1)[-1], validate=True)
        except ValueError:
            from ..errors import RequestError
            raise RequestError('백업 파일을 읽지 못했습니다.') from None
        return guarded('vault_restore', vault.restore_backup, raw, data.get('password'))
