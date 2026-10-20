"""동의한 사용자 테스트의 최소 동작 기록. 원고·개인정보·자유 입력은 받지 않는다."""
import datetime
import hashlib
import json
import uuid

from .. import exports, support_report, vault

SCHEMA_VERSION = 2
CONSENT_VERSION = 'ut-events-v2'
MAX_EVENTS = 10_000
RETENTION_DAYS = 7
EVENT_FIELDS = {
    'article_persisted': {'article_id', 'revision_no', 'save_kind', 'duration_ms'},
    'article_save_failed': {'article_id', 'error_code', 'duration_ms'},
    'article_reopened': {'article_id', 'revision_no', 'duration_ms'},
    'output_export_completed': {'export_kind', 'file_count', 'duration_ms'},
    # v2: 코어 작업(팩트체크·변환·발행 등)의 성공/실패, 플랫폼별 변환 결과, 화면 이동, 화면에서 막힌 시도
    'task_completed': {'task', 'article_id', 'duration_ms'},
    'task_failed': {'task', 'article_id', 'error_code', 'http_status', 'duration_ms'},
    'platform_target_finished': {'run_id', 'article_id', 'platform', 'status', 'error_code', 'cards_total', 'cards_failed', 'duration_ms'},
    'screen_viewed': {'screen', 'from_screen'},
    'ui_blocked': {'task', 'reason_code'},
}
ERROR_CODES = {'ARTICLE_DELETED', 'REVISION_CONFLICT', 'AUTH_REQUIRED', 'NOT_FOUND', 'REQUEST_ERROR', 'INTERNAL_ERROR'}
# 코드가 없는 RequestError 는 HTTP 상태로 분류한다(메시지 문구는 기록하지 않는다)
STATUS_CODES = {400: 'INVALID_INPUT', 401: 'AUTH_REQUIRED', 403: 'AUTH_REQUIRED', 404: 'NOT_FOUND', 409: 'CONFLICT',
                413: 'TOO_LARGE', 429: 'BUSY', 502: 'UPSTREAM_ERROR', 503: 'ENGINE_UNAVAILABLE', 504: 'TIMEOUT'}
# 화면이 직접 보낼 수 있는 이벤트와 값 — 자유 입력은 받지 않는다
SCREENS = {'desk', 'writer', 'interview', 'convert', 'map', 'archive', 'settings'}
UI_TASKS = {'platform_keywords', 'platform_run', 'platform_validate', 'factcheck', 'cms_publish', 'transcribe', 'export'}
UI_REASONS = {'MISSING_TITLE_BODY', 'NO_TARGET', 'SOURCE_NOT_APPLIED', 'SOURCE_CHANGED', 'SNAPSHOT_FAILED', 'RESPONSE_INVALID',
              'NETWORK', 'OTHER'}
CLIENT_VALUES = {
    'screen_viewed': {'screen': SCREENS, 'from_screen': SCREENS | {None}},
    'ui_blocked': {'task': UI_TASKS, 'reason_code': UI_REASONS},
}


class UtEventManager:
    """동의는 계정별 저장소(app_meta)에 둔다 — 한 PC 를 여러 참여자가 계정을 바꿔 쓰므로 참여자마다 직접 켠다.
    세션은 '앱 실행 안에서 한 계정이 로그인해 있는 동안'이다. 로그인·로그아웃하거나 계정이 바뀌면 새로 만든다."""

    def __init__(self):
        self.session_id = str(uuid.uuid4())
        self._session_user = None

    @staticmethod
    def _consented(db):
        row = db.execute("SELECT value FROM app_meta WHERE key = 'ut_consent'").fetchone()
        return bool(row) and row[0] == CONSENT_VERSION

    def enabled(self):
        """지금 로그인한 계정이 이번 범위(CONSENT_VERSION)에 동의했는가. 로그인 전이면 아니오."""
        try:
            with vault.connect() as db:
                return self._consented(db)
        except Exception:
            return False

    def set_enabled(self, data):
        """payload: {enabled: bool} — 지금 계정의 동의를 켜고 끈다(로그인 필요) → preview()."""
        enabled = (data or {}).get('enabled')
        if not isinstance(enabled, bool):
            from ..errors import RequestError
            raise RequestError('enabled 는 true/false 여야 합니다.')
        with vault.connect() as db:
            if enabled:
                db.execute("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('ut_consent', ?)", (CONSENT_VERSION,))
            else:
                db.execute("DELETE FROM app_meta WHERE key = 'ut_consent'")
        return self.preview()

    def restart_session(self):
        """로그인·로그아웃 직후 부른다 — 같은 계정으로 다시 로그인해도 새 세션으로 센다."""
        self._session_user, self.session_id = None, str(uuid.uuid4())

    def _session(self):
        user = vault._user_id()
        if user != self._session_user:  # 자동 로그인·로그인 유지 복원처럼 로그인 경로를 거치지 않은 계정 변경
            self._session_user, self.session_id = user, str(uuid.uuid4())
        return self.session_id

    @staticmethod
    def error_code(error):
        code = getattr(error, 'code', None)
        if code in ERROR_CODES:
            return code
        status = getattr(error, 'status', None)
        return STATUS_CODES.get(status) or ('REQUEST_ERROR' if status and status < 500 else 'INTERNAL_ERROR')

    def record_client(self, data):
        """화면이 보낸 이벤트 ``{"event": 이름, ...값}``. 정해진 이름·값만 받고, 나머지는 조용히 버린다."""
        rules = CLIENT_VALUES.get((data or {}).get('event'))
        fields = {key: value for key, value in (data or {}).items() if key != 'event'}
        if not rules or set(fields) - set(rules) or any(fields.get(key) not in allowed for key, allowed in rules.items()):
            return {'recorded': False}
        return {'recorded': self.record(data['event'], **fields)}

    def _participant_id(self):
        return hashlib.sha256(vault.backup_key().encode('ascii')).hexdigest()[:16]

    def record(self, event_name, event_id=None, data_mode='real', **fields):
        """허용 목록 밖 값은 기록하지 않고, 계측 실패는 본 작업에 전파하지 않는다."""
        try:
            allowed = EVENT_FIELDS.get(event_name)
            if allowed is None or set(fields) - allowed or data_mode not in ('real', 'mock'):
                return False
            now = datetime.datetime.now(datetime.timezone.utc)
            event_id = event_id or str(uuid.uuid4())
            operation_id, attempt_id = str(uuid.uuid4()), str(uuid.uuid4())
            info = support_report._build_info()
            payload = {
                'event_id': event_id,
                'schema_version': SCHEMA_VERSION,
                'occurred_at': now.isoformat(),
                'session_id': self._session(),
                'participant_id': self._participant_id(),
                'build': info.get('commit') or 'development',
                'environment': 'ut',
                'data_mode': data_mode,
                'event_name': event_name,
                'operation_id': operation_id,
                'attempt_id': attempt_id,
                **fields,
            }
            cutoff = (now - datetime.timedelta(days=RETENTION_DAYS)).isoformat()
            with vault.connect() as db:
                if not self._consented(db):
                    return False
                db.execute('DELETE FROM ut_events WHERE occurred_at < ?', (cutoff,))
                count = db.execute('SELECT count(*) FROM ut_events').fetchone()[0]
                overflow = max(0, count - MAX_EVENTS + 1)
                if overflow:
                    db.execute('DELETE FROM ut_events WHERE event_id IN '
                               '(SELECT event_id FROM ut_events ORDER BY occurred_at LIMIT ?)', (overflow,))
                    current = db.execute("SELECT value FROM app_meta WHERE key = 'ut_events_dropped'").fetchone()
                    db.execute("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('ut_events_dropped', ?)",
                               (str(int(current[0]) + overflow if current else overflow),))
                cursor = db.execute('INSERT OR IGNORE INTO ut_events VALUES (?, ?, ?)',
                                    (event_id, payload['occurred_at'], json.dumps(payload, ensure_ascii=False, separators=(',', ':'))))
                return cursor.rowcount == 1
        except Exception:
            return False

    def preview(self):
        with vault.connect() as db:
            rows = db.execute('SELECT payload_json FROM ut_events ORDER BY occurred_at').fetchall()
            dropped = db.execute("SELECT value FROM app_meta WHERE key = 'ut_events_dropped'").fetchone()
            enabled = self._consented(db)
        events = [json.loads(row[0]) for row in rows]
        return {
            'enabled': enabled,
            'consentVersion': CONSENT_VERSION,
            'count': len(events),
            'dropped': int(dropped[0]) if dropped else 0,
            'firstAt': events[0]['occurred_at'] if events else None,
            'lastAt': events[-1]['occurred_at'] if events else None,
            'eventNames': sorted({event['event_name'] for event in events}),
            'fields': sorted({key for event in events for key in event}),
        }

    def delete(self):
        with vault.connect() as db:
            deleted = db.execute('DELETE FROM ut_events').rowcount
            db.execute("DELETE FROM app_meta WHERE key = 'ut_events_dropped'")
        return {'deleted': deleted}

    def export(self):
        with vault.connect() as db:
            rows = db.execute('SELECT payload_json FROM ut_events ORDER BY occurred_at').fetchall()
        if not rows:
            from ..errors import RequestError
            raise RequestError('내보낼 사용자 테스트 기록이 없습니다.')
        target = exports.folder('diagnostics')
        target.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M')
        path = exports._unique(target / f'AI-Newsroom-UT기록_{stamp}.jsonl')
        path.write_text('\n'.join(row[0] for row in rows) + '\n', encoding='utf-8')
        return {'folder': str(target), 'files': [str(path)], 'count': len(rows)}
