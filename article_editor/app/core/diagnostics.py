"""저장 실패 진단(su4228 v30 의 record_storage_error 를 우리 저장소에 맞춰 옮김).

원고·사진·키·절대 경로·예외 문구는 남기지 않는다 — 시각, 작업 종류, 예외 종류, errno 만 기록한다.
디스크가 가득 차거나 암호화 저장소에 쓸 수 없을 때도 남길 수 있도록 이 기록만은 작은 일반 파일(APP_DATA/logs)이다.
사용자에게는 원인별로 알아볼 수 있는 안내를 준다.
"""
import datetime
import errno as errno_codes
import json
import threading

from app_paths import APP_DATA

LOG = APP_DATA / 'logs' / 'storage-errors.jsonl'
MAX_BYTES = 256 * 1024
_LOCK = threading.Lock()


def _is_sqlite_error(error):
    from . import vault
    return isinstance(error, vault.sqlite.Error)


def record_storage_error(operation, error):
    """내용 없는 한 줄 기록. 기록 자체가 실패해도 조용히 넘어간다(원래 오류를 가리지 않기 위해)."""
    try:
        event = {'time': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'operation': operation,
                 'errorType': type(error).__name__, 'errno': getattr(error, 'errno', None)}
        with _LOCK:
            LOG.parent.mkdir(parents=True, exist_ok=True)
            if LOG.exists() and LOG.stat().st_size > MAX_BYTES:  # 오래된 절반을 버린다
                lines = LOG.read_text(encoding='utf-8').splitlines()
                LOG.write_text('\n'.join(lines[len(lines) // 2:]) + '\n', encoding='utf-8')
            with LOG.open('a', encoding='utf-8') as file:
                file.write(json.dumps(event, ensure_ascii=False) + '\n')
    except OSError:
        pass


def friendly_message(error):
    text = str(error).lower() if _is_sqlite_error(error) else ''
    if isinstance(error, PermissionError):
        return '저장 폴더에 쓰기 권한이 없어요. 앱 저장 폴더의 권한을 확인해 주세요.'
    if getattr(error, 'errno', None) == errno_codes.ENOSPC or 'disk is full' in text or 'database or disk is full' in text:
        return '디스크 공간이 부족해요. 저장 공간을 확보한 뒤 다시 시도해 주세요.'
    if 'locked' in text or 'busy' in text:
        return '저장소가 다른 작업을 처리 중이에요. 잠시 후 다시 시도해 주세요.'
    return '원고를 저장하지 못했어요. 폴더 권한과 디스크 상태를 확인해 주세요.'


def guarded(operation, function, *args):
    """저장 작업을 실행하다 OS·저장소 오류가 나면 기록을 남기고 원인별 안내로 바꿔 올린다. 다른 오류는 그대로 둔다."""
    from .errors import RequestError
    try:
        return function(*args)
    except RequestError:
        raise
    except Exception as error:
        if not (isinstance(error, OSError) or _is_sqlite_error(error)):
            raise
        record_storage_error(operation, error)
        raise RequestError(friendly_message(error), 500) from None
