"""AI Module Manager — single interface over AI features (doc §4, §7, §8).

Dispatches an AI task by ``kind``. Local AI is preferred; external models are
reached only through the backend proxy (see ARCHITECTURE.md — backend-managed keys).

팩트체크·의미 청킹(core/ai/factcheck)은 torch/onnxruntime 을 쓰므로 처음 호출할 때 불러온다.
"""
import importlib.util
from collections import Counter

from .. import factcheck_memo as memo
from ..ai.router import assist as _assist
from ..ai.transcribe import transcribe as _transcribe
from ..errors import RequestError
from ..storage import get_snapshot

FACTCHECK_BATCH = 5  # 한 번에 판정하고 기록하는 문장 수

MAX_NODES, MAX_MATERIALS, MAX_TEXT = 200, 50, 500_000


def _text(value, field, limit=MAX_TEXT):
    if not isinstance(value, str) or len(value) > limit:
        raise RequestError(f'{field}은(는) {limit:,}자 이하의 문자열이어야 합니다.')
    return value


class AIManager:
    def assist(self, payload):
        """Run an AI task. ``payload['kind']`` selects the task
        (metadata / flow / photo_keywords / image / captions)."""
        return _assist(payload)

    def transcribe(self, payload):
        """인터뷰 녹음 전사 → 녹취 스튜디오 대화 목록. payload: {filename, data(base64)}"""
        return _transcribe(payload)

    def factcheck_status(self):
        """팩트체크에 필요한 모델·런타임 준비 상태."""
        from ..ai.factcheck import paths
        deps = {name: importlib.util.find_spec(name) is not None
                for name in paths.embedding_dependencies()}
        embedding_ready = False
        if deps['numpy']:
            from ..ai.factcheck.retrieval import create_encoder
            embedding_ready = create_encoder().available()
        models = {
            'judge': (paths.JUDGE_DIR / 'model.onnx').is_file() and (paths.JUDGE_DIR / 'judge.json').is_file(),
            'embedding': embedding_ready,
            'boundary': (paths.BOUNDARY_DIR / 'model.onnx').is_file(),  # 없으면 규칙만으로 청킹
        }
        return {'ready': all(deps.values()) and models['judge'] and models['embedding'],
                'models': models, 'runtime': deps}

    def factcheck_run(self, payload):
        """원고 문장(nodes)을 등록 자료(materials)에 비춰 판정한다.
        nodes: [{id, type, text, linkedSourceIds?}], materials: [{id, title, content, date?, speaker?}]
        snapshotId(선택): 이 검증이 어느 고정본(ArticleSnapshot)에 대한 것인지. 있으면 고정본이 있는지 확인하고 응답에 그대로 실어 준다.
        판정 기록(memo)은 문장·자료·모델 버전으로만 식별하므로 고정본이 달라도 같은 문장은 판정을 다시 쓴다 — snapshotId 는 출처 표시용이다."""
        snapshot_id = payload.get('snapshotId')
        if snapshot_id is not None:
            get_snapshot(snapshot_id)  # 형식 오류 400, 없으면 404
        result = self._factcheck_run(payload)
        return {**result, 'snapshotId': snapshot_id} if snapshot_id is not None else result

    @staticmethod
    def _memo_part(part, by_id, stored):
        cards = {c.get('nodeId'): c for c in part.get('critiques', [])}
        new = {by_id[r['node_id']]: memo.pack_node(r, part['node_statuses'].get(r['node_id']), cards.get(r['node_id']))
               for r in part['results'] if r['node_id'] in by_id}
        memo.put_many(new)
        stored.update(new)

    def _factcheck_run(self, payload):
        nodes, materials = payload.get('nodes'), payload.get('materials')
        if not isinstance(nodes, list) or not 0 < len(nodes) <= MAX_NODES:
            raise RequestError(f'검증할 문장(nodes)을 1~{MAX_NODES}개 보내 주세요.')
        if not isinstance(materials, list) or len(materials) > MAX_MATERIALS:
            raise RequestError(f'자료(materials)는 {MAX_MATERIALS}개 이하로 보내 주세요.')
        for node in nodes:
            if not isinstance(node, dict):
                raise RequestError('nodes 항목 형식을 확인해 주세요.')
            _text(node.get('text', ''), '문장', 4000)
        for material in materials:
            if not isinstance(material, dict):
                raise RequestError('materials 항목 형식을 확인해 주세요.')
            _text(material.get('content') or material.get('summary') or '', '자료 본문')
        from ..source_index import indexing_ids
        busy = sorted({str(m.get('id')) for m in materials} & indexing_ids())
        if busy:  # 색인이 끝나기 전에 보내면 요청 안에서 다시 색인해 수 분이 걸린다 — 끝난 뒤에 다시 보내 달라고 돌려준다
            raise RequestError('자료를 색인하는 중이에요. 끝난 뒤에 팩트체크가 자동으로 시작됩니다.', 409, code='SOURCE_INDEXING',
                               details={'sourceIds': busy})
        # 이미 판정한 (문장, 자료) 조합은 암호화 저장소의 기록을 쓰고, 처음 보는 문장만 판정한다(memo)
        fingerprint, version = memo.fingerprint(materials), memo.model_version()
        keys = {i: memo.node_key(node, fingerprint, version) for i, node in enumerate(nodes) if memo.judged(node)}
        stored = memo.get_many(keys.values())
        pending = [i for i, key in keys.items() if key not in stored]
        fresh = {'results': [], 'node_statuses': {}, 'critiques': []}
        if pending or not keys:
            status = self.factcheck_status()
            if not status['ready']:
                if status['models']['judge'] and not status['models']['embedding']:
                    raise RequestError('임베딩 서버(백엔드)에 연결할 수 없어요. 인터넷 연결과 로그인을 확인해 주세요.', 503)
                raise RequestError('팩트체크 모델이 아직 설치되지 않았어요. 모델 설치 후 다시 시도해 주세요.', 503)
            from ..ai.factcheck.service import review_workspace
            by_id = {str(nodes[i]['id']): keys[i] for i in pending}
            if keys:
                # 5문장씩 끊어 판정하고 그때마다 기록한다 — 중간에 끊겨도 다음 실행은 이어서 한다
                fresh = {'results': [], 'node_statuses': {}, 'critiques': []}
                for n in range(0, len(pending), FACTCHECK_BATCH):
                    part = review_workspace([nodes[i] for i in pending[n:n + FACTCHECK_BATCH]], materials)
                    self._memo_part(part, by_id, stored)
                    fresh = {**part, 'results': fresh['results'] + part['results'],
                             'node_statuses': {**fresh['node_statuses'], **part['node_statuses']},
                             'critiques': fresh['critiques'] + part['critiques']}
            else:
                fresh = review_workspace(nodes, materials)
        if not keys:
            return fresh
        from ..ai.factcheck.assertion import find_support_spans
        results, statuses, critiques = [], {}, []
        for i, key in keys.items():
            if key in stored:
                result, status, card = memo.unpack_node(stored[key], str(nodes[i]['id']))
                # 표시 위치는 응답 때 계산: 예전 판정 캐시도 재판정 없이 새 표시를 쓴다.
                if result.get('status') == 'SUPPORTED':
                    result['support_spans'] = find_support_spans(nodes[i]['text'], (result.get('evidence') or {}).get('text') or '')
                results.append(result)
                statuses[result['node_id']] = status
                if card:
                    critiques.append(card)
        meta = {k: v for k, v in fresh.items() if k not in ('results', 'node_statuses', 'critiques', 'counts', 'cached')}
        return {**meta, 'success': True, 'cached': len(results) - len(fresh['results']),
                'counts': dict(Counter(r['status'] for r in results)),
                'node_statuses': statuses, 'critiques': critiques, 'results': results}

    def factcheck_external(self, payload):
        """로컬 판정기가 확정 못 한 문장만 OpenAI 로 재판정(임시·시험용). payload: {items: [{id, claim, evidence: [str]}], cachedOnly?}
        cachedOnly 가 참이면 저장된 재판정 결과만 돌려주고 OpenAI 는 부르지 않는다(원고를 다시 열 때 화면 복원용)."""
        from ..ai.factcheck.external import judge
        items = payload.get('items')
        if not isinstance(items, list) or not 0 < len(items) or not all(isinstance(i, dict) for i in items):
            return judge(payload)  # 형식 오류는 judge 가 알린다
        keys = [memo.external_key(i) for i in items]
        stored = memo.get_many(keys)  # 같은 문장·근거는 다시 OpenAI 에 묻지 않는다(비용·시간)
        todo = [i for i, key in zip(items, keys) if key not in stored]
        if todo and not payload.get('cachedOnly'):
            out = judge({'items': todo})
            ids = {str(i.get('id')): memo.external_key(i) for i in todo}
            memo.put_many({ids[str(r.get('id'))]: {k: v for k, v in r.items() if k != 'id'}
                           for r in out.get('results', []) if str(r.get('id')) in ids})
            stored = memo.get_many(keys)
        return {'results': [dict(stored[key], id=item.get('id')) for item, key in zip(items, keys) if key in stored],
                'count': len(items)}

    def semantic_parse(self, payload):
        """자료 본문을 의미 단위(청크)로 나눈다. 경계 모델이 없으면 규칙만 쓴다."""
        text = _text(payload.get('text'), '본문')
        source = payload.get('source') or 'frontend'
        if source not in ('frontend', 'opendart'):
            raise RequestError('source 는 frontend 또는 opendart 여야 합니다.')
        from ..ai.factcheck.chunker import chunk_document
        meta = {'source': source, **{k: payload[k] for k in ('corp_name', 'report_nm', 'date') if payload.get(k)}}
        return {'units': [{'text': u.text, 'kind': u.kind, 'field': u.field} for u in chunk_document(text, meta)]}
