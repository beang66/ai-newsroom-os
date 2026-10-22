"""팩트체크 기록 — 이미 판정한 (문장, 등록 자료) 조합은 다시 돌리지 않고 암호화 저장소의 기록을 쓴다.

키는 판정에 영향을 주는 것만 담는다: 문장·연결 자료·등록 자료 전체(내용 해시)·판정 모델 버전.
자료가 바뀌거나 모델이 바뀌면 키가 달라져 자연히 다시 판정한다. 문장을 고쳐도 그 문장만 다시 판정한다.
"""
import datetime
import hashlib
import json

from . import vault

MEMO_MAX = 5000  # ponytail: 최근 5000건만 둔다. 더 오래 남기려면 기사별로 묶어 정리
PIPELINE = 'factcheck-memo-v3-table'  # v3: 근거에 표 구조(table)가 붙는다. 예전 기록에는 없어 다시 판정한다.


def _digest(*parts):
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def model_version():
    """판정을 한 모델. 로컬 판정을 끄고 외부 모델로 판정하면 따로 취급한다(서로의 기록을 쓰지 않는다).
    외부는 모델 이름·판정 지시 버전까지 붙여, 둘 중 하나가 바뀌면 예전 판정 기록을 쓰지 않는다."""
    from .managers.settings_manager import local_ai
    suffix = '' if local_ai() else '+external' + _external_version()
    try:
        from .ai.factcheck.paths import settings
        return settings.model_id + suffix
    except Exception:
        return 'unknown' + suffix


def fingerprint(materials):
    """등록 자료 전체의 지문 — 검색 범위가 곧 판정 근거이므로 한 건만 바뀌어도 달라진다."""
    return _digest([(m.get('id'), m.get('title'), m.get('date'), m.get('speaker') or m.get('outletOrSpeaker'),
                     hashlib.sha256((m.get('content') or m.get('summary') or '').encode()).hexdigest())
                    for m in sorted(materials, key=lambda m: str(m.get('id')))])


def judged(node):
    """review_workspace 가 판정하는 문장인가(id·글자가 있고 IMAGE 가 아님)."""
    return bool(node.get('id') and str(node.get('text') or '').strip() and node.get('type') != 'IMAGE')


def node_key(node, materials_fp, version):
    return _digest(PIPELINE, version, materials_fp, node.get('type'), str(node.get('text') or '').strip(),
                   sorted(node.get('linkedSourceIds') or []))


def _external_version():
    from .config import FACTCHECK_MODEL
    from .ai.factcheck import external
    return f":{FACTCHECK_MODEL}:{getattr(external, 'JUDGE_VERSION', '')}"


def external_key(item):
    return _digest('external-v1' + _external_version(), item.get('claim'), item.get('evidence'), item.get('titles'))


def get_many(keys):
    keys = list(dict.fromkeys(keys))
    if not keys:
        return {}
    with vault.connect() as db:
        rows = db.execute(f'SELECT key, entry_json FROM factcheck_memo WHERE key IN ({",".join("?" * len(keys))})', keys).fetchall()
    return {key: json.loads(entry) for key, entry in rows}


def put_many(entries):
    if not entries:
        return
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with vault.connect() as db:
        db.executemany('INSERT OR REPLACE INTO factcheck_memo VALUES (?, ?, ?, ?)',
                       [(key, vault.WORKSPACE_ID, json.dumps(entry, ensure_ascii=False), now) for key, entry in entries.items()])
        db.execute('DELETE FROM factcheck_memo WHERE key NOT IN (SELECT key FROM factcheck_memo ORDER BY created_at DESC LIMIT ?)',
                   (MEMO_MAX,))


# 판정 결과 ↔ 기록 항목: 문장 id(s1, s2 …)는 요청마다 달라지므로 기록에는 빼고 꺼낼 때 다시 붙인다.
def pack_node(result, node_status, critique):
    node_id = result['node_id']
    card = None
    if critique:
        card = {k: v for k, v in critique.items() if k not in ('id', 'nodeId')}
        card['idPrefix'] = critique['id'][:-len(node_id)] if critique['id'].endswith(node_id) else critique['id']
    return {'result': {k: v for k, v in result.items() if k != 'node_id'}, 'node_status': node_status, 'critique': card}


def unpack_node(entry, node_id):
    result = dict(entry['result'], node_id=node_id)
    card = entry.get('critique')
    if card:
        card = {k: v for k, v in card.items() if k != 'idPrefix'}
        card.update(id=entry['critique']['idPrefix'] + node_id, nodeId=node_id)
    return result, entry.get('node_status'), card
