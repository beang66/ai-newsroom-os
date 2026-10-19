"""Encrypted, resumable platform generation runs tied to immutable article snapshots."""
from __future__ import annotations

import datetime
import json
import os
import threading
import uuid

from . import vault
from .errors import RequestError
from .storage import get_snapshot

_LOCK = threading.RLock()
_ACTIVE: set[str] = set()
_THREADS: dict[str, threading.Thread] = {}
_TARGETS = ('instagram', 'threads', 'card_news')
_EXCLUDED = {'validation_status', 'evidence_status', 'validation_review', 'rendered_image',
             'render_error', 'generation_review', 'generation_review_binding', 'evidence_valid',
             'block_evidence_valid', 'generation_run'}
_COLUMNS = ('id, article_id, snapshot_id, source_signature, targets_json, options_json, '
            'results_json, status, active_target, created_at, updated_at')


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _canonical(value):
    if isinstance(value, list):
        return [_canonical(item) for item in value]
    if isinstance(value, dict):
        return {key: _canonical(value[key]) for key in sorted(value) if key not in _EXCLUDED}
    return value


def _render_key(card, index, count, article_id, snapshot_id):
    value = {'card': card, 'photo': None, 'ordinal': index + 1, 'cardCount': count,
             'article_id': article_id, 'snapshot_id': snapshot_id}
    text = json.dumps(_canonical(value), ensure_ascii=False, separators=(',', ':'))
    encoded = text.encode('utf-16-le')
    units = [int.from_bytes(encoded[i:i + 2], 'little') for i in range(0, len(encoded), 2)]
    values = [2166136261, 2246822507, 3266489909, 668265263]
    primes = [16777619, 3266489917, 668265263, 374761393]
    for unit in units:
        values = [((value ^ unit) * prime) & 0xffffffff for value, prime in zip(values, primes)]
    return 'v1:' + str(len(units)) + ':' + ''.join(f'{value:08x}' for value in values)


def _row(row, details=False):
    (run_id, article_id, snapshot_id, source, targets, options, results, status,
     active, created, updated) = row
    items = json.loads(results)
    settings = json.loads(options)
    result = {'id': run_id, 'article_id': article_id, 'snapshot_id': snapshot_id,
              'source_signature': source, 'targets': json.loads(targets), 'status': status,
              'active_target': active, 'created_at': created, 'updated_at': updated,
              'progress': {key: value['status'] for key, value in items.items()}}
    result['revision_no'] = settings.get('revision_no')
    if details:
        result['results'] = items
        result['options'] = settings
    return result


def _get(run_id, details=False):
    try:
        run_id = str(uuid.UUID(run_id))
    except (ValueError, TypeError):
        raise RequestError('작업 ID를 확인해 주세요.', 400)
    with vault.connect() as db:
        row = db.execute(f'SELECT {_COLUMNS} FROM platform_runs WHERE id=? AND workspace_id=?',
                         (run_id, vault.WORKSPACE_ID)).fetchone()
    if not row:
        raise RequestError('플랫폼 생성 작업을 찾을 수 없습니다.', 404)
    return _row(row, details)


def get_run(run_id):
    return _get(run_id, True)


def list_runs(article_id):
    if not isinstance(article_id, str) or not article_id:
        raise RequestError('기사 ID를 확인해 주세요.', 400)
    with vault.connect() as db:
        rows = db.execute(f'SELECT {_COLUMNS} FROM platform_runs WHERE workspace_id=? AND article_id=? '
                          'ORDER BY created_at DESC LIMIT 20', (vault.WORKSPACE_ID, article_id)).fetchall()
    return {'runs': [_row(row) for row in rows]}


def start_run(data, manager):
    article_id, snapshot_id = data.get('articleId'), data.get('snapshotId')
    snapshot = get_snapshot(snapshot_id)
    if snapshot['article_id'] != article_id:
        raise RequestError('기사와 고정본이 다릅니다.', 409)
    if snapshot['revision_no'] != data.get('revisionNo'):
        raise RequestError('기사 저장본과 고정본이 다릅니다.', 409)
    targets = data.get('targets')
    if not isinstance(targets, list) or not targets or len(targets) > 3 or len(set(targets)) != len(targets) \
            or any(target not in _TARGETS for target in targets):
        raise RequestError('생성할 플랫폼을 확인해 주세요.', 400)
    source = data.get('sourceSignature')
    if not isinstance(source, str) or not source or len(source) > 5_000_000:
        raise RequestError('생성 원문의 서명을 확인해 주세요.', 400)
    keywords, requirements = data.get('selectedKeywords', []), data.get('requirements', '')
    if not isinstance(keywords, list) or any(not isinstance(item, str) for item in keywords) \
            or not isinstance(requirements, str) or len(requirements) > 3000:
        raise RequestError('생성 조건을 확인해 주세요.', 400)
    keywords = list(dict.fromkeys(item.strip() for item in keywords if item.strip()))
    requirements = requirements.strip()
    bases = data.get('baseFingerprints') or {}
    revision_no = data.get('revisionNo')
    if not isinstance(revision_no, int) or revision_no < 1:
        raise RequestError('저장본 번호를 확인해 주세요.', 400)
    if not isinstance(bases, dict) or any(not isinstance(bases.get(target, ''), str) for target in targets):
        raise RequestError('기존 원고 기준을 확인해 주세요.', 400)
    with _LOCK, vault.connect() as db:
        existing = db.execute(f'SELECT {_COLUMNS} FROM platform_runs WHERE workspace_id=? AND article_id=? '
                              "AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1",
                              (vault.WORKSPACE_ID, article_id)).fetchone()
        if existing:
            result = _row(existing)
        else:
            run_id, now = str(uuid.uuid4()), _now()
            db.execute('INSERT INTO platform_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                       (run_id, vault.WORKSPACE_ID, article_id, snapshot_id, source,
                        json.dumps(targets), json.dumps({'selected_keywords': keywords,
                        'requirements': requirements, 'base_fingerprints': bases,
                        'revision_no': revision_no}),
                        json.dumps({target: {'status': 'pending'} for target in targets}),
                        'queued', None, now, now))
            result = {'id': run_id, 'article_id': article_id, 'snapshot_id': snapshot_id,
                      'source_signature': source, 'targets': targets, 'status': 'queued',
                      'active_target': None, 'created_at': now, 'updated_at': now,
                      'revision_no': revision_no,
                      'progress': {target: 'pending' for target in targets}}
    _launch(result['id'], manager)
    return result


def _update(run_id, *, status=None, active=None, target=None, entry=None):
    with _LOCK, vault.connect() as db:
        row = db.execute('SELECT results_json FROM platform_runs WHERE id=? AND workspace_id=?',
                         (run_id, vault.WORKSPACE_ID)).fetchone()
        if not row:
            return
        results = json.loads(row[0])
        if target is not None:
            results[target] = entry
        db.execute('UPDATE platform_runs SET results_json=?, status=COALESCE(?,status), '
                   'active_target=?, updated_at=? WHERE id=? AND workspace_id=?',
                   (json.dumps(results, ensure_ascii=False), status, active, _now(), run_id, vault.WORKSPACE_ID))


def _render_cards(run, target, draft, manager):
    cards = draft.get('cards') or []
    if not cards or any(not isinstance(card, dict) or not card.get('card_id') for card in cards) \
            or len({card['card_id'] for card in cards}) != len(cards):
        raise RequestError('JPG를 준비할 카드 목록을 확인해 주세요.', 400)
    for index, card in enumerate(cards):
        if card.get('rendered_image') or card.get('render_error'):
            continue
        key = _render_key(card, index, len(cards), run['article_id'], run['snapshot_id'])
        payload = {**card, 'card_id': card['card_id'], 'article_id': run['article_id'],
                   'page': index + 1, 'total_pages': len(cards), 'template': 'text_only',
                   'content': card.get('content') or card, 'render_key': key}
        try:
            asset = manager.render({'payload': payload, 'snapshotId': run['snapshot_id']})['asset']
            card['rendered_image'] = {'id': asset['id'], 'uri': asset['local_uri'],
                                      'object_ref': asset.get('object_ref'), 'key': key,
                                      'article_id': run['article_id'], 'snapshot_id': run['snapshot_id']}
        except Exception as error:
            card['render_error'] = {'key': key, 'reason': str(error)[:500]}
        _update(run['id'], status='running', active=target, target=target,
                entry={'status': 'rendering', 'draft': draft, 'rendered': index + 1})
    return {'status': 'succeeded' if all(card.get('rendered_image') for card in cards) else 'jpg_failed',
            'draft': draft}


def _work(run_id, manager):
    try:
        run = get_run(run_id)
        options = run['options']
        snapshot = get_snapshot(run['snapshot_id'])
        article = {'article_id': run['article_id'], 'title': snapshot['title'],
                   'content': snapshot['body_text'], 'subtitle': snapshot['subtitle'], 'url': snapshot['url']}
        _update(run_id, status='running')
        for target in run['targets']:
            run = get_run(run_id)
            entry = run['results'][target]
            if entry['status'] in ('succeeded', 'jpg_failed', 'failed'):
                continue
            _update(run_id, status='running', active=target, target=target,
                    entry=entry if entry['status'] == 'rendering' else {'status': 'running'})
            try:
                if entry['status'] == 'rendering' and target == 'card_news':
                    draft = entry['draft']
                else:
                    payload = {'article': article, 'selected_keywords': options['selected_keywords'],
                               'requirements': options['requirements'], 'source_url': article['url']}
                    response = manager.generate({'platform': target, 'payload': payload,
                                                 'snapshotId': run['snapshot_id']})
                    draft = response['draft']
                    if not isinstance(draft, dict) or draft.get('article_id') != run['article_id'] \
                            or (draft.get('snapshot_id') and draft['snapshot_id'] != run['snapshot_id']):
                        raise RequestError('생성 결과의 기사·고정본이 요청과 다릅니다.', 409)
                    draft.update(snapshot_id=run['snapshot_id'], generation_input=payload,
                                 generation_source=run['source_signature'],
                                 generation_run={'id': run_id, 'article_id': run['article_id'],
                                                 'snapshot_id': run['snapshot_id'], 'platform': target,
                                                 'revision_no': options['revision_no']})
                if target == 'card_news':
                    _update(run_id, status='running', active=target, target=target,
                            entry={'status': 'rendering', 'draft': draft, 'rendered': 0})
                    result = _render_cards(run, target, draft, manager)
                else:
                    result = {'status': 'succeeded', 'draft': draft}
                _update(run_id, status='running', target=target, entry=result)
            except Exception as error:
                _update(run_id, status='running', target=target,
                        entry={'status': 'failed', 'error': str(error)[:500]})
        _update(run_id, status='completed')
    except Exception:
        try:
            _update(run_id, status='failed')
        except Exception:
            pass
    finally:
        with _LOCK:
            _ACTIVE.discard(run_id)
            _THREADS.pop(run_id, None)


def _launch(run_id, manager):
    with _LOCK:
        if run_id in _ACTIVE:
            return
        with vault.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT options_json, status FROM platform_runs WHERE id=? AND workspace_id=?',
                             (run_id, vault.WORKSPACE_ID)).fetchone()
            if not row or row[1] not in ('queued', 'running'):
                return
            options = json.loads(row[0])
            owner = options.get('worker_pid')
            if isinstance(owner, int) and owner != os.getpid():
                try:
                    os.kill(owner, 0)
                    return  # another live app process is finishing this run
                except OSError:
                    pass  # crashed process: reclaim its saved work
            options['worker_pid'] = os.getpid()
            db.execute('UPDATE platform_runs SET options_json=? WHERE id=? AND workspace_id=?',
                       (json.dumps(options, ensure_ascii=False), run_id, vault.WORKSPACE_ID))
        _ACTIVE.add(run_id)
        thread = threading.Thread(target=_work, args=(run_id, manager), daemon=True,
                                  name='platform-run-' + run_id[:8])
        _THREADS[run_id] = thread
        thread.start()


def has_active_runs():
    with _LOCK:
        return bool(_ACTIVE)


def wait_for_active_runs():
    """Keep a desktop process alive after its window closes until its active jobs finish."""
    while True:
        with _LOCK:
            threads = list(_THREADS.values())
        if not threads:
            return
        for thread in threads:
            thread.join()


def resume_runs(manager, article_id=None):
    with vault.connect() as db:
        rows = db.execute("SELECT id FROM platform_runs WHERE workspace_id=? AND status IN ('queued','running')" +
                          (' AND article_id=?' if article_id else ''),
                          (vault.WORKSPACE_ID, article_id) if article_id else (vault.WORKSPACE_ID,)).fetchall()
    for (run_id,) in rows:
        _launch(run_id, manager)
    return len(rows)
