"""동의한 사용자 테스트의 최소 동작 기록. 원고·개인정보·자유 입력은 받지 않는다."""
import datetime
import hashlib
import json
import uuid

from .. import exports, support_report, vault

SCHEMA_VERSION = 1
CONSENT_VERSION = 'ut-events-v1'
MAX_EVENTS = 10_000
RETENTION_DAYS = 7
EVENT_FIELDS = {
    'article_persisted': {'article_id', 'revision_no', 'save_kind', 'duration_ms'},
    'article_save_failed': {'article_id', 'error_code', 'duration_ms'},
    'article_reopened': {'article_id', 'revision_no', 'duration_ms'},
    'output_export_completed': {'export_kind', 'file_count', 'duration_ms'},
}
ERROR_CODES = {'ARTICLE_DELETED', 'REVISION_CONFLICT', 'AUTH_REQUIRED', 'NOT_FOUND', 'REQUEST_ERROR', 'INTERNAL_ERROR'}


class UtEventManager:
    def __init__(self, settings):
        self.settings = settings
        self.session_id = str(uuid.uuid4())

    def enabled(self):
        return self.settings.get()['utMeasurement']

    @staticmethod
    def error_code(error):
        code = getattr(error, 'code', None)
        return code if code in ERROR_CODES else ('REQUEST_ERROR' if hasattr(error, 'status') else 'INTERNAL_ERROR')

    def _participant_id(self):
        return hashlib.sha256(vault.backup_key().encode('ascii')).hexdigest()[:16]

    def record(self, event_name, event_id=None, data_mode='real', **fields):
        """허용 목록 밖 값은 기록하지 않고, 계측 실패는 본 작업에 전파하지 않는다."""
        try:
            allowed = EVENT_FIELDS.get(event_name)
            if not self.enabled() or allowed is None or set(fields) - allowed or data_mode not in ('real', 'mock'):
                return False
            now = datetime.datetime.now(datetime.timezone.utc)
            event_id = event_id or str(uuid.uuid4())
            operation_id, attempt_id = str(uuid.uuid4()), str(uuid.uuid4())
            info = support_report._build_info()
            payload = {
                'event_id': event_id,
                'schema_version': SCHEMA_VERSION,
                'occurred_at': now.isoformat(),
                'session_id': self.session_id,
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
        events = [json.loads(row[0]) for row in rows]
        return {
            'enabled': self.enabled(),
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
