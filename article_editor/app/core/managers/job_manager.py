"""Job Manager — 긴 작업의 공통 기록(계약 v0.8 ProcessingJob, ``core/jobs.py``).

지금은 조회·취소만 API 로 연다. 기존 기능(모델 설치·팩트체크 등)을 작업으로 옮기는 건 다음 단계.
"""
from .. import jobs as _jobs


class JobManager:
    def get(self, job_id):
        """작업 상태 한 건(ProcessingJob 모양)."""
        return _jobs.get_job(job_id)

    def cancel(self, job_id):
        """취소 요청. queued 면 바로 cancelled, running 이면 작업자가 멈출 때까지 running. 끝난 작업은 409."""
        return _jobs.request_cancel(job_id)

    def recover_interrupted(self):
        """이전 실행이 남긴 queued/running 작업을 failed(INTERRUPTED) 로 정리한다."""
        return _jobs.recover_interrupted_jobs()
