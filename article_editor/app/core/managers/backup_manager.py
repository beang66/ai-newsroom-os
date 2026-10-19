"""Backup Manager — 작성 중 기사의 서버 백업(암호문만 Supabase Storage 의 내 폴더 <user id>/backups/ 에).

열쇠는 우리 백엔드가 관리한다(cloud_backup.py 머리말): 사용자는 복구 키를 다루지 않고, 새 PC 에서는 로그인만 하면 복구된다.

기사 저장(수동·자동)이 끝날 때마다 알림(notify)을 받아 **묶어서** 올린다 — 호출 수를 줄이기 위해:
- 수동 저장: 바로 올린다.
- 자동 임시 저장: 마지막 변경 후 30초 동안 조용하면 올리고, 계속 타이핑 중이어도 처음 변경 후 5분이 지나면 올린다.
- 마지막으로 올린 내용과 같으면 올리지 않는다. 한 번에 하나씩만 올리고, 실패하면 1·2·4…분(최대 10분)으로 늦춰 다시 시도한다.
- 앱을 닫을 때 쌓인 것을 한 번 더 올린다(flush).
기사 하나당 파일 하나(최신 작업본 + 마지막 수동 저장본)라서 업로드 1회가 호출 1회다. 켜짐(cloudBackup)이고 로그인한 때만 동작한다.
"""
import hashlib
import json
import threading
import time

from .. import auth, cloud_backup
from ..errors import RequestError
from ..integrations import supabase
from .settings_manager import SettingsManager

BUCKET = 'transfers'  # 이전 마법사와 같은 비공개 버킷(계정 폴더 규칙 재사용) — 백업은 <user id>/backups/ 아래
QUIET_SECONDS = 30
MAX_WAIT_SECONDS = 300
BACKOFF_MAX_SECONDS = 600
TICK_SECONDS = 5


class BackupManager:
    def __init__(self, session, clock=time.monotonic):
        self._session = session
        self._clock = clock
        self._lock = threading.RLock()
        self._dirty = {}       # article_id -> {user, first, last, manual}
        self._uploaded = {}    # (user, article_id) -> 내용 해시
        self._fails = 0
        self._retry_at = 0.0
        self._last_upload = ''  # 마지막으로 올린 시각(ISO)
        self._last_error = ''
        self._stop = threading.Event()
        self._thread = None

    # ---- 경로·상태 ----
    @staticmethod
    def _user():
        return auth.status().get('userId') or ''

    @staticmethod
    def _folder(user):
        return f'{user}/backups'

    def _token(self):
        token = self._session.token()
        if not token or not self._user():
            raise RequestError('로그인이 필요합니다.', 401, code='AUTH_REQUIRED')
        return token

    def _active(self):
        return bool(self._user() and SettingsManager().get()['cloudBackup'])

    def _key(self, user):
        try:
            return cloud_backup.backup_key(user)
        except RequestError as error:
            if error.code == 'AUTH_REQUIRED':
                raise
            raise RequestError('백업 키를 받지 못했어요. 인터넷 연결과 백엔드의 BACKUP_MASTER_KEY 설정을 확인해 주세요.', 502) from None

    def status(self):
        with self._lock:
            return {'enabled': SettingsManager().get()['cloudBackup'], 'pending': len(self._dirty),
                    'lastUploadAt': self._last_upload, 'error': self._last_error}

    # ---- 저장 알림 → 묶어서 올리기 ----
    def notify(self, article_id, kind='auto'):
        """기사 저장이 끝났다(StorageManager 가 부른다). 백업이 켜졌거나 삭제 알림일 때만 일을 만든다."""
        try:
            user = self._user()
            if not user or (kind != 'deleted' and not self._active()):
                return
            now = self._clock()
            with self._lock:
                item = self._dirty.setdefault(article_id, {'user': user, 'first': now, 'last': now, 'manual': False})
                item['last'] = now
                item['manual'] = item['manual'] or kind == 'manual'
                item['deleted'] = kind == 'deleted'  # 휴지통으로 옮겼으면 서버 사본을 지운다(되살리면 다음 알림이 False 로 되돌린다)
            self._ensure_thread()
        except Exception:
            pass

    def _ensure_thread(self):
        with self._lock:
            if self._thread is None or not self._thread.is_alive():
                self._stop.clear()
                self._thread = threading.Thread(target=self._loop, name='cloud-backup', daemon=True)
                self._thread.start()

    def _loop(self):
        while not self._stop.wait(TICK_SECONDS):
            self.run_due()

    def _due(self, item, now):
        return item['manual'] or item.get('deleted') or now - item['last'] >= QUIET_SECONDS or now - item['first'] >= MAX_WAIT_SECONDS

    def run_due(self, force=False):
        """올릴 때가 된 기사를 하나씩 올린다. force=True 면 때가 안 됐어도 전부(앱 종료·'지금 백업'). → 올린 수"""
        sent = 0
        now = self._clock()
        if not force and now < self._retry_at:
            return 0
        with self._lock:
            ready = [aid for aid, item in self._dirty.items() if force or self._due(item, now)]
        for article_id in ready:
            with self._lock:
                item = self._dirty.get(article_id)
            if item is None:
                continue
            try:
                if self._upload(article_id, item['user'], item.get('deleted')):
                    sent += 1
                with self._lock:
                    self._dirty.pop(article_id, None)
                self._fails, self._last_error = 0, ''
            except Exception as error:  # 실패해도 저장·앱에는 영향이 없다 — 늦춰서 다시 시도
                self._fails += 1
                self._retry_at = self._clock() + min(BACKOFF_MAX_SECONDS, 60 * 2 ** (self._fails - 1))
                self._last_error = getattr(error, 'message', None) or str(error)
                break
        return sent

    def flush(self):
        """쌓인 변경을 지금 올린다(앱을 닫을 때, '지금 백업')."""
        self._retry_at = 0.0
        return self.run_due(force=True)

    def shutdown(self):
        self._stop.set()
        try:
            self.flush()
        except Exception:
            pass

    def _upload(self, article_id, user, deleted=False):
        """한 기사를 올린다(deleted 면 설정과 무관하게 서버 사본을 지운다). 계정이 바뀌면 건너뛴다."""
        if user != self._user():
            return False
        if deleted:
            supabase.storage_delete(BUCKET, f'{self._folder(user)}/{article_id}.enc', self._token())
            self._uploaded.pop((user, article_id), None)
            return True
        if not self._active():
            return False
        raw = cloud_backup.build_payload(article_id)
        if raw is None:
            return False
        digest = hashlib.sha256(raw).hexdigest()
        if self._uploaded.get((user, article_id)) == digest:
            return False  # 내용이 그대로면 올리지 않는다
        sealed = cloud_backup.seal(self._key(user), raw)
        supabase.storage_upload(BUCKET, f'{self._folder(user)}/{article_id}.enc', sealed, self._token())
        self._uploaded[(user, article_id)] = digest
        self._last_upload = time.strftime('%Y-%m-%dT%H:%M:%S%z')
        return True

    # ---- 복구 ----
    def list(self):
        """서버에 있는 백업 목록 → {backups: [{articleId, title, savedAt, bytes, damaged?}]} (키로 풀어서 제목을 읽는다)
        shortcut: 제목을 읽으려고 백업마다 내려받는다(기사 수십 건까지), 수백 건이면 제목·시각을 별도 목록 파일로 둔다."""
        token, user = self._token(), self._user()
        key = self._key(user)
        rows = []
        for name in supabase.storage_list(BUCKET, self._folder(user), token):
            if not name.endswith('.enc'):
                continue
            raw = supabase.storage_download(BUCKET, f'{self._folder(user)}/{name}', token)
            if raw is None:
                continue
            try:
                data = json.loads(cloud_backup.open_sealed(key, raw).decode('utf-8'))
            except (RequestError, ValueError):  # 하나가 깨져도 나머지는 복구할 수 있게 목록에 남긴다
                rows.append({'articleId': name[:-4], 'title': '', 'savedAt': '', 'bytes': len(raw), 'damaged': True})
                continue
            rows.append({'articleId': name[:-4], 'title': data.get('title') or '', 'savedAt': data.get('savedAt') or '', 'bytes': len(raw)})
        return {'backups': sorted(rows, key=lambda r: r['savedAt'], reverse=True)}

    def restore(self, payload):
        """payload: {articleIds: [..]} — 서버 백업을 이 PC 로 되돌린다(기존 이력은 지우지 않고 새 저장본으로 추가)."""
        ids = (payload or {}).get('articleIds')
        if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
            raise RequestError('복구할 기사(articleIds)를 선택해 주세요.')
        token, user = self._token(), self._user()
        key = self._key(user)
        restored, skipped = [], []
        for article_id in ids:
            raw = supabase.storage_download(BUCKET, f'{self._folder(user)}/{article_id}.enc', token)
            if raw is None:
                skipped.append({'articleId': article_id, 'reason': '서버에 없어요'})
                continue
            try:
                cloud_backup.restore_payload(cloud_backup.open_sealed(key, raw))
                restored.append(article_id)
            except RequestError as error:
                skipped.append({'articleId': article_id, 'reason': error.message})
        return {'restored': restored, 'skipped': skipped}

    # ---- 끄기 ----
    def disable(self, payload):
        """payload: {deleteServer: bool} — 백업을 끈다(설정). deleteServer 면 서버의 내 백업도 모두 지운다."""
        delete_server = bool((payload or {}).get('deleteServer'))
        SettingsManager().update({'cloudBackup': False})
        if delete_server:
            token, user = self._token(), self._user()
            for name in supabase.storage_list(BUCKET, self._folder(user), token):
                supabase.storage_delete(BUCKET, f'{self._folder(user)}/{name}', token)
            with self._lock:
                self._uploaded = {k: v for k, v in self._uploaded.items() if k[0] != user}
        with self._lock:
            self._dirty.clear()
        return {'disabled': True, 'serverDeleted': delete_server}
