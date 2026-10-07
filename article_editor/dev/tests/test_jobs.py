"""공통 작업 기록(core/jobs.py, 계약 v0.8 ProcessingJob): 상태 흐름·진행률·백그라운드 실행·취소·시작 복구."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import threading
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402  — 먼저 import: app/ 를 sys.path 에 올린다
from core import jobs, vault  # noqa: E402
from core.errors import RequestError  # noqa: E402

WAIT = 2  # 초. 스레드 동기화는 Event 로 하고, 이건 멈춤 방지용 상한일 뿐이다


def ref(resource_type='source'):
    return {'resource_type': resource_type, 'resource_id': str(uuid.uuid4())}


class JobTestCase(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        jobs._OWN.clear()

    def new(self, job_type='verification'):
        return jobs.create_job(job_type, ref())

    def assertStatus(self, job_id, status):
        self.assertEqual(jobs.get_job(job_id)['status'], status)

    def assertConflict(self, call, *args):
        with self.assertRaises(RequestError) as caught:
            call(*args)
        self.assertEqual(caught.exception.status, 409)


class ShapeAndValidationTests(JobTestCase):
    def test_create_and_get_have_contract_shape(self):
        input_ref = ref('transcript')
        job = jobs.create_job('transcription', input_ref)
        self.assertEqual(str(uuid.UUID(job['id'])), job['id'])
        self.assertEqual(job, jobs.get_job(job['id']))
        self.assertEqual({k: job[k] for k in ('workspace_id', 'type', 'status', 'progress', 'input_ref', 'output_ref', 'error')},
                         {'workspace_id': vault.WORKSPACE_ID, 'type': 'transcription', 'status': 'queued', 'progress': 0.0,
                          'input_ref': input_ref, 'output_ref': None, 'error': None})
        self.assertTrue(job['created_at'])

    def test_finished_job_carries_output_and_completed_at(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        out = ref('verification_run')
        done = jobs.finish(job_id, out)
        self.assertEqual((done['status'], done['output_ref'], done['progress']), ('succeeded', out, 1.0))
        self.assertIn('completed_at', done)
        self.assertIn('started_at', done)

    def test_failed_job_carries_error_body(self):
        job_id = self.new()['id']
        failed = jobs.fail(job_id, 'X_FAIL', '실패', True)
        self.assertEqual(failed['error'], {'code': 'X_FAIL', 'message': '실패', 'retryable': True})

    def test_invalid_type_and_refs_are_rejected(self):
        for job_type, input_ref in (('model_install', ref()), ('verification', {'resource_type': 'article', 'resource_id': str(uuid.uuid4())}),
                                    ('verification', {'resource_type': 'source', 'resource_id': 'nope'}),
                                    ('verification', None), ('verification', {'resource_type': 'source'})):
            with self.assertRaises(RequestError) as caught:
                jobs.create_job(job_type, input_ref)
            self.assertEqual(caught.exception.status, 400)
        job_id = self.new()['id']
        jobs.set_running(job_id)
        with self.assertRaises(RequestError):
            jobs.finish(job_id, {'resource_type': 'bogus', 'resource_id': str(uuid.uuid4())})
        self.assertStatus(job_id, 'running')

    def test_missing_and_malformed_ids(self):
        with self.assertRaises(RequestError) as caught:
            jobs.get_job(str(uuid.uuid4()))
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(RequestError) as caught:
            jobs.get_job('../etc')
        self.assertEqual(caught.exception.status, 400)

    def test_jobs_persist_across_connections_in_the_vault(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT status, workspace_id FROM processing_jobs WHERE id = ?', (job_id,)).fetchone(),
                             ('running', vault.WORKSPACE_ID))
        with vault.connect() as db:
            db.execute('SELECT 1')
        self.assertStatus(job_id, 'running')


class TransitionTests(JobTestCase):
    def test_legal_path_queued_running_succeeded(self):
        job_id = self.new()['id']
        self.assertEqual(jobs.set_running(job_id)['status'], 'running')
        self.assertEqual(jobs.finish(job_id, ref('platform_output'))['status'], 'succeeded')

    def test_cannot_finish_or_progress_a_queued_job(self):
        job_id = self.new()['id']
        self.assertConflict(jobs.finish, job_id, ref())
        self.assertConflict(jobs.set_progress, job_id, 0.5)
        self.assertStatus(job_id, 'queued')

    def test_cannot_start_twice(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        self.assertConflict(jobs.set_running, job_id)

    def test_terminal_states_are_final(self):
        succeeded, failed, cancelled = (self.new()['id'] for _ in range(3))
        jobs.set_running(succeeded)
        jobs.finish(succeeded, ref())
        jobs.fail(failed, 'E', 'e', False)
        jobs.request_cancel(cancelled)
        for job_id in (succeeded, failed, cancelled):
            before = jobs.get_job(job_id)
            for call, args in ((jobs.set_running, ()), (jobs.set_progress, (0.3,)), (jobs.finish, (ref(),)),
                               (jobs.fail, ('E', 'e', True)), (jobs.request_cancel, ()), (jobs.acknowledge_cancel, ())):
                self.assertConflict(call, job_id, *args)
            self.assertEqual(jobs.get_job(job_id), before)

    def test_progress_is_clamped_and_numeric(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        self.assertEqual(jobs.set_progress(job_id, 0.25)['progress'], 0.25)
        self.assertEqual(jobs.set_progress(job_id, 7)['progress'], 1.0)
        self.assertEqual(jobs.set_progress(job_id, -3)['progress'], 0.0)
        for bad in ('0.5', None, True, float('nan')):
            with self.assertRaises(RequestError) as caught:
                jobs.set_progress(job_id, bad)
            self.assertEqual(caught.exception.status, 400)

    def test_acknowledge_without_request_is_rejected(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        self.assertConflict(jobs.acknowledge_cancel, job_id)
        self.assertStatus(job_id, 'running')


class CancelTests(JobTestCase):
    def test_cancel_queued_is_immediate(self):
        job_id = self.new()['id']
        self.assertEqual(jobs.request_cancel(job_id)['status'], 'cancelled')
        self.assertConflict(jobs.set_running, job_id)

    def test_cancel_running_waits_for_worker(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        self.assertFalse(jobs.is_cancel_requested(job_id))
        self.assertEqual(jobs.request_cancel(job_id)['status'], 'running')
        self.assertTrue(jobs.is_cancel_requested(job_id))
        self.assertEqual(jobs.request_cancel(job_id)['status'], 'running')  # 두 번 눌러도 같다
        self.assertEqual(jobs.acknowledge_cancel(job_id)['status'], 'cancelled')

    def test_cancel_terminal_is_409(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        jobs.finish(job_id, ref())
        self.assertConflict(jobs.request_cancel, job_id)
        self.assertStatus(job_id, 'succeeded')


class BackgroundTests(JobTestCase):
    def run_job(self, worker):
        job_id = self.new()['id']
        thread = jobs.run_in_background(job_id, worker)
        return job_id, thread

    def join(self, thread):
        thread.join(WAIT)
        self.assertFalse(thread.is_alive())

    def test_success_records_progress_and_output(self):
        out = ref('verification_run')
        seen = {}

        def worker(ctx):
            seen['running'] = jobs.get_job(ctx.job_id)['status']
            ctx.progress(0.5)
            seen['progress'] = jobs.get_job(ctx.job_id)['progress']
            return out
        job_id, thread = self.run_job(worker)
        self.join(thread)
        self.assertEqual(seen, {'running': 'running', 'progress': 0.5})
        job = jobs.get_job(job_id)
        self.assertEqual((job['status'], job['output_ref'], job['error']), ('succeeded', out, None))

    def test_request_error_fails_with_its_message(self):
        def worker(ctx):
            raise RequestError('모델이 없어요.', 503)
        job_id, thread = self.run_job(worker)
        self.join(thread)
        self.assertEqual(jobs.get_job(job_id)['error'], {'code': 'WORKER_ERROR', 'message': '모델이 없어요.', 'retryable': False})

    def test_other_exception_fails_generic_and_hides_details(self):
        def worker(ctx):
            raise ValueError('원고 본문 비밀 내용')
        job_id, thread = self.run_job(worker)
        self.join(thread)
        error = jobs.get_job(job_id)['error']
        self.assertEqual((error['code'], error['message'], error['retryable']), ('WORKER_ERROR', jobs.GENERIC_FAILURE, True))
        self.assertNotIn('원고', error['message'])

    def test_bad_output_ref_fails(self):
        job_id, thread = self.run_job(lambda ctx: {'resource_type': 'nope'})
        self.join(thread)
        job = jobs.get_job(job_id)
        self.assertEqual((job['status'], job['error']['code']), ('failed', 'WORKER_ERROR'))

    def test_cooperative_cancel_by_raising(self):
        started, cancel_sent = threading.Event(), threading.Event()

        def worker(ctx):
            started.set()
            self.assertTrue(cancel_sent.wait(WAIT))
            if ctx.cancelled():
                raise jobs.JobCancelled()
            return ref()
        job_id, thread = self.run_job(worker)
        self.assertTrue(started.wait(WAIT))
        self.assertEqual(jobs.request_cancel(job_id)['status'], 'running')
        cancel_sent.set()
        self.join(thread)
        self.assertStatus(job_id, 'cancelled')

    def test_cancel_honoured_when_worker_returns_anyway(self):
        started, cancel_sent = threading.Event(), threading.Event()

        def worker(ctx):
            started.set()
            self.assertTrue(cancel_sent.wait(WAIT))
            return ref()
        job_id, thread = self.run_job(worker)
        self.assertTrue(started.wait(WAIT))
        jobs.request_cancel(job_id)
        cancel_sent.set()
        self.join(thread)
        job = jobs.get_job(job_id)
        self.assertEqual((job['status'], job['output_ref']), ('cancelled', None))

    def test_job_cancelled_before_thread_starts_never_runs(self):
        job_id = self.new()['id']
        jobs.request_cancel(job_id)
        ran = threading.Event()
        self.join(jobs.run_in_background(job_id, lambda ctx: ran.set()))
        self.assertFalse(ran.is_set())
        self.assertStatus(job_id, 'cancelled')


class RecoveryTests(JobTestCase):
    def test_restart_marks_leftover_jobs_interrupted(self):
        queued, running, done = (self.new()['id'] for _ in range(3))
        jobs.set_running(running)
        jobs.set_running(done)
        jobs.finish(done, ref())
        jobs._OWN.clear()  # 새 프로세스처럼
        self.assertEqual(jobs.recover_interrupted_jobs(), 2)
        for job_id in (queued, running):
            job = jobs.get_job(job_id)
            self.assertEqual((job['status'], job['error']['code'], job['error']['retryable']), ('failed', 'INTERRUPTED', True))
        self.assertStatus(done, 'succeeded')
        self.assertEqual(jobs.recover_interrupted_jobs(), 0)

    def test_recovery_leaves_this_process_jobs_alone(self):
        job_id = self.new()['id']
        jobs.set_running(job_id)
        self.assertEqual(jobs.recover_interrupted_jobs(), 0)
        self.assertStatus(job_id, 'running')

    def test_core_startup_recovers_and_never_raises(self):
        from core.create_core import create_core
        job_id = self.new()['id']
        jobs._OWN.clear()
        core = create_core()
        self.assertEqual(core.jobs.get(job_id)['error']['code'], 'INTERRUPTED')
        from unittest import mock
        with mock.patch.object(vault, '_device_key', side_effect=RequestError('no key', 500)):
            create_core()  # 저장소를 못 열어도 시작은 된다


if __name__ == '__main__':
    unittest.main()
