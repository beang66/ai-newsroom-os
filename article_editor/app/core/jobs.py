"""긴 작업(모델 설치·팩트체크·플랫폼 생성·전사 등)의 공통 작업 기록 — 팀 계약 v0.8 ProcessingJob.

기록은 암호화 저장소(vault)의 processing_jobs 표에만 둔다. 평문 파일·다른 DB 는 쓰지 않는다.
표(processing_jobs)는 다른 표와 같이 vault.SCHEMA 에 있다.

상태 흐름(LifecycleStatus):
  queued  → running | cancelled | failed
  running → succeeded | failed | cancelled
  succeeded / failed / cancelled 는 끝 상태 — 어떤 전이도 허용하지 않는다(409).

취소는 협조식이다: queued 면 바로 cancelled, running 이면 cancel_requested 만 켜 두고
작업자가 is_cancel_requested() 로 확인한 뒤 acknowledge_cancel() 로 끝낸다.
작업의 입력·출력은 자원 참조(JobReference)만 담는다 — 원고 내용은 여기 저장하지도 로그에 남기지도 않는다.
"""
import datetime
import threading
import uuid

from . import vault
from .errors import RequestError
from .ids import IdError, uuid_text

JOB_TYPES = ('source_ingest', 'verification', 'transcription', 'platform_generation', 'media_render')
RESOURCE_TYPES = ('source', 'snapshot', 'verification_run', 'transcript', 'platform_output', 'media_asset')
TERMINAL = ('succeeded', 'failed', 'cancelled')

_COLUMNS = ('id, workspace_id, type, status, progress, input_resource_type, input_resource_id, output_resource_type, '
            'output_resource_id, error_code, error_message, retryable, cancel_requested, created_at, updated_at, '
            'started_at, finished_at')

_LOCK = threading.RLock()  # 읽고-검사하고-쓰는 전이를 이 프로세스 안에서 한 번에 하나씩
_OWN = set()  # 이 프로세스가 만든 작업 id — 시작 복구가 지금 돌고 있는 작업을 실패로 바꾸지 않게
GENERIC_FAILURE = '작업 처리 중 오류가 발생했어요. 다시 시도해 주세요.'


class JobCancelled(Exception):
    """작업자가 취소 요청을 확인하고 멈출 때 던진다."""


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _job_id(job_id):
    try:
        return uuid_text(job_id)
    except IdError:
        raise RequestError('작업 id 형식이 올바르지 않습니다.', 400)


def _ref(ref, label):
    if not isinstance(ref, dict) or ref.get('resource_type') not in RESOURCE_TYPES:
        raise RequestError(f'{label} 자원 종류가 올바르지 않습니다.', 400)
    try:
        return ref['resource_type'], uuid_text(ref.get('resource_id'))
    except IdError:
        raise RequestError(f'{label} 자원 id 형식이 올바르지 않습니다.', 400)


def _shape(row):
    (job_id, workspace_id, job_type, status, progress, in_type, in_id, out_type, out_id,
     code, message, retryable, _cancel, created_at, _updated, started_at, finished_at) = row
    job = {
        'id': job_id, 'workspace_id': workspace_id, 'type': job_type, 'status': status, 'progress': float(progress),
        'input_ref': {'resource_type': in_type, 'resource_id': in_id},
        'output_ref': {'resource_type': out_type, 'resource_id': out_id} if out_type else None,
        'error': {'code': code, 'message': message, 'retryable': bool(retryable)} if code else None,
        'created_at': created_at,
    }
    if started_at:
        job['started_at'] = started_at
    if finished_at:
        job['completed_at'] = finished_at
    return job


def _load(db, job_id):
    row = db.execute(f'SELECT {_COLUMNS} FROM processing_jobs WHERE id = ? AND workspace_id = ?',
                     (job_id, vault.WORKSPACE_ID)).fetchone()
    if row is None:
        raise RequestError('작업을 찾을 수 없습니다.', 404)
    return row


def _transition(job_id, allowed, **fields):
    """현재 상태가 allowed 안에 있을 때만 fields 로 바꾼다. 끝 상태면 409, 그 밖의 잘못된 전이도 409."""
    job_id = _job_id(job_id)
    with _LOCK, vault.connect() as db:
        status = _load(db, job_id)[3]
        if status in TERMINAL:
            raise RequestError('이미 끝난 작업입니다.', 409)
        if status not in allowed:
            raise RequestError(f'{status} 상태의 작업은 이 단계로 바꿀 수 없습니다.', 409)
        fields['updated_at'] = _now()
        if fields.get('status') in TERMINAL:
            fields['finished_at'] = fields['updated_at']
        sets = ', '.join(f'{name} = ?' for name in fields)
        db.execute(f'UPDATE processing_jobs SET {sets} WHERE id = ?', (*fields.values(), job_id))
        return _shape(_load(db, job_id))


def create_job(job_type, input_ref):
    """새 작업(queued). input_ref = {resource_type, resource_id}."""
    if job_type not in JOB_TYPES:
        raise RequestError('지원하지 않는 작업 종류입니다.', 400)
    in_type, in_id = _ref(input_ref, '입력')
    job_id, now = str(uuid.uuid4()), _now()
    with _LOCK, vault.connect() as db:
        db.execute('INSERT INTO processing_jobs (id, workspace_id, type, status, progress, input_resource_type, '
                   'input_resource_id, cancel_requested, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, 0, ?, ?)',
                   (job_id, vault.WORKSPACE_ID, job_type, 'queued', in_type, in_id, now, now))
        _OWN.add(job_id)
        return _shape(_load(db, job_id))


def get_job(job_id):
    with vault.connect() as db:
        return _shape(_load(db, _job_id(job_id)))


def set_running(job_id):
    return _transition(job_id, ('queued',), status='running', started_at=_now())


def set_progress(job_id, progress):
    """진행률(0..1 로 자른다). running 일 때만."""
    if isinstance(progress, bool) or not isinstance(progress, (int, float)) or progress != progress:
        raise RequestError('진행률은 숫자여야 합니다.', 400)
    return _transition(job_id, ('running',), progress=min(1.0, max(0.0, float(progress))))


def finish(job_id, output_ref):
    out_type, out_id = _ref(output_ref, '출력')
    return _transition(job_id, ('running',), status='succeeded', progress=1.0,
                       output_resource_type=out_type, output_resource_id=out_id)


def fail(job_id, code, message, retryable):
    if not isinstance(code, str) or not code or not isinstance(message, str):
        raise RequestError('오류 코드와 메시지가 필요합니다.', 400)
    return _transition(job_id, ('queued', 'running'), status='failed',
                       error_code=code, error_message=message, retryable=int(bool(retryable)))


def request_cancel(job_id):
    """queued → 바로 cancelled. running → cancel_requested 만 켜고 계속 running(작업자가 확인 후 끝낸다).
    이미 끝난 작업은 409."""
    job_id = _job_id(job_id)
    with _LOCK:
        if get_job(job_id)['status'] == 'queued':
            return _transition(job_id, ('queued',), status='cancelled', cancel_requested=1)
        return _transition(job_id, ('running',), cancel_requested=1)


def is_cancel_requested(job_id):
    with vault.connect() as db:
        return bool(_load(db, _job_id(job_id))[12])


def acknowledge_cancel(job_id):
    """작업자가 취소 요청을 받아들여 멈췄다 → cancelled. 요청이 없었으면 409."""
    job_id = _job_id(job_id)
    with _LOCK:
        if not is_cancel_requested(job_id) and get_job(job_id)['status'] not in TERMINAL:
            raise RequestError('취소 요청이 없는 작업입니다.', 409)
        return _transition(job_id, ('running',), status='cancelled')


def recover_interrupted_jobs():
    """이전 프로세스가 queued/running 으로 남긴 작업 → failed(INTERRUPTED, 다시 시도 가능). 바꾼 개수를 돌려준다."""
    now = _now()
    with _LOCK, vault.connect() as db:
        rows = db.execute("SELECT id FROM processing_jobs WHERE workspace_id = ? AND status IN ('queued', 'running')",
                          (vault.WORKSPACE_ID,)).fetchall()
        stale = [job_id for (job_id,) in rows if job_id not in _OWN]
        for job_id in stale:
            db.execute("UPDATE processing_jobs SET status = 'failed', error_code = 'INTERRUPTED', error_message = ?, "
                       'retryable = 1, updated_at = ?, finished_at = ? WHERE id = ?',
                       ('앱이 종료되어 작업이 중단됐어요. 다시 시도해 주세요.', now, now, job_id))
        return len(stale)


class JobContext:
    """작업자에게 주는 손잡이: 진행률 보고와 협조식 취소 확인."""

    def __init__(self, job_id):
        self.job_id = job_id

    def progress(self, value):
        set_progress(self.job_id, value)

    def cancelled(self):
        return is_cancel_requested(self.job_id)


def run_in_background(job_id, worker):
    """worker(ctx) 를 데몬 스레드에서 돌린다. 반환값(출력 JobReference)으로 succeeded,
    JobCancelled 또는 취소 요청 뒤 반환/실패면 cancelled, 그 밖의 예외는 failed(WORKER_ERROR).
    시작한 Thread 를 돌려준다."""
    job_id = _job_id(job_id)

    def run():
        try:
            set_running(job_id)
        # TODO(debt: DEBT-004): DB 잠금/OS 오류는 이 예외 처리에서 빠져 워커 스레드 밖으로 샌다.
        # 시작/완료 기록 실패를 처리하고 다음 실행의 중단 작업 복구와 함께 확인할 것.
        except RequestError:
            return  # 시작 전에 취소됐거나 이미 끝난 작업
        try:
            output_ref = worker(JobContext(job_id))
            outcome = ('cancel',) if is_cancel_requested(job_id) else ('finish', output_ref)
        except JobCancelled:
            outcome = ('cancel',)
        except RequestError as e:
            outcome = ('fail', e.message, False)
        except Exception:  # 예외 내용(원고가 섞일 수 있다)은 기록하지 않는다
            outcome = ('fail', GENERIC_FAILURE, True)
        try:
            if outcome[0] != 'cancel' and is_cancel_requested(job_id):
                outcome = ('cancel',)
            if outcome[0] == 'cancel':
                acknowledge_cancel(job_id)
            elif outcome[0] == 'finish':
                try:
                    finish(job_id, outcome[1])
                except RequestError as e:
                    if e.status != 400:
                        raise
                    fail(job_id, 'WORKER_ERROR', '작업 결과 형식이 올바르지 않습니다.', False)
            else:
                fail(job_id, 'WORKER_ERROR', outcome[1], outcome[2])
        # TODO(debt: DEBT-004): 완료/취소 상태 기록에서도 sqlite.Error/OSError가 처리되지 않는다.
        except RequestError:
            pass  # 저장소를 못 열었으면 다음 시작 때 recover_interrupted_jobs 가 정리한다

    thread = threading.Thread(target=run, name='job-' + job_id[:8], daemon=True)
    thread.start()
    return thread
