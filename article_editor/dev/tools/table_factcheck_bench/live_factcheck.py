"""표 근거 팩트체크 시험(실제 앱) — 켜 둔 코어에 PDF 를 자료로 올려 색인 시간을 재고, 주장마다 실제 판정(설정에 따라 OpenAI
또는 로컬 판정기)을 돌려 정확도·소요 시간을 잰다. 로그인한 코어가 필요하다(임베딩·판정이 백엔드를 쓴다).

  1) 비교할 브랜치로 코어를 켠다:  py -3 article_editor\\app\\server.py   (기본 포트 8765)
  2) py -3 article_editor\\dev\\tools\\table_factcheck_bench\\live_factcheck.py --report 보도자료.pdf --annex 통계표.pdf --out main.json
  3) 다른 브랜치로 코어를 다시 켜고 같은 명령(--out branch.json)
  4) py -3 article_editor\\dev\\tools\\table_factcheck_bench\\live_factcheck.py --compare main.json branch.json

- 올린 자료는 끝나면 지운다(--keep 이면 남긴다). 판정 기록(memo)을 재사용하지 않도록 자료 날짜 칸에 실행 표시를 넣는다
  (자료 내용·문장은 그대로). 외부 판정 모드면 주장 수만큼 OpenAI 를 부른다(35건 ≈ 판정 35~70회).
- 정답: S → SUPPORTED, C → CONFLICT, N → SUPPORTED·CONFLICT 가 아닌 것(근거 부족·검토 필요).
"""
import argparse
import base64
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

CLAIMS = Path(__file__).with_name('claims_2026_08_employment.json')


def call(port, path, payload=None, timeout=600):
    base = f'http://127.0.0.1:{port}'
    req = urllib.request.Request(base + path, data=None if payload is None else json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json', 'Origin': base}, method='GET' if payload is None else 'POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        raise SystemExit(f'{path} → {e.code}: {body[:300]}') from None


def upload(port, path):
    raw = Path(path).read_bytes()
    t = time.perf_counter()
    d = call(port, '/api/materials/extract', {'filename': Path(path).name, 'data': base64.b64encode(raw).decode()})
    sid = d['sourceId']
    while True:  # 색인(청킹 + 임베딩)이 끝날 때까지
        state = call(port, f'/api/sources/{sid}')['index']['state']
        if state in ('ready', 'failed'):
            break
        time.sleep(1)
    return {'id': sid, 'name': Path(path).name, 'text': d['text'], 'index_state': state, 'index_s': round(time.perf_counter() - t, 1)}


def expected(label, status):
    return status == 'SUPPORTED' if label == 'S' else status == 'CONFLICT' if label == 'C' else status not in ('SUPPORTED', 'CONFLICT')


def run(args):
    spec = json.loads(Path(args.claims).read_text(encoding='utf-8'))
    tag = 'bench-' + uuid.uuid4().hex[:8]
    status = call(args.port, '/api/factcheck/status')
    docs = {'report': upload(args.port, args.report), 'annex': upload(args.port, args.annex)}
    materials = [{'id': d['id'], 'title': d['name'], 'content': d['text'], 'date': tag} for d in docs.values()]
    rows = []
    try:
        for c in spec['claims']:
            t = time.perf_counter()
            out = call(args.port, '/api/factcheck/run', {'nodes': [{'id': 's1', 'type': 'TEXT', 'text': c['text']}], 'materials': materials})
            took = time.perf_counter() - t
            r = (out.get('results') or [{}])[0]
            ev = r.get('evidence') or {}
            rows.append({'id': c['id'], 'label': c['label'], 'status': r.get('status'), 'ok': expected(c['label'], r.get('status')),
                         'seconds': round(took, 2), 'reason': r.get('reason'), 'evidence': (ev.get('text') or '')[:600]})
            print(f"{c['id']} {c['label']} → {r.get('status')} {'✓' if rows[-1]['ok'] else '✗'} {took:.1f}s", flush=True)
    finally:
        if not args.keep:
            for d in docs.values():
                call(args.port, f"/api/sources/{d['id']}/delete", {'force': True})
    secs = [r['seconds'] for r in rows]
    summary = {'mode': status.get('mode'), 'claims': len(rows), 'accuracy': round(sum(r['ok'] for r in rows) / len(rows), 3),
               **{f'acc_{l}': round(sum(r['ok'] for r in rows if r['label'] == l) / max(1, sum(r['label'] == l for r in rows)), 3) for l in 'SCN'},
               'false_supported': sum(1 for r in rows if r['label'] != 'S' and r['status'] == 'SUPPORTED'),
               'seconds_median': round(statistics.median(secs), 2), 'seconds_p90': round(sorted(secs)[int(0.9 * (len(secs) - 1))], 2),
               'seconds_total': round(sum(secs), 1), 'index_s': {k: d['index_s'] for k, d in docs.items()}}
    Path(args.out).write_text(json.dumps({'summary': summary, 'claims': rows}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=1))


def compare(a_path, b_path):
    a, b = (json.loads(Path(p).read_text(encoding='utf-8')) for p in (a_path, b_path))
    print(f"{'':16}{Path(a_path).stem:>12}{Path(b_path).stem:>12}")
    for k, v in a['summary'].items():
        print(f'{k:16}{json.dumps(v, ensure_ascii=False):>12}{json.dumps(b["summary"].get(k), ensure_ascii=False):>12}')
    print('\n달라진 주장:')
    for x, y in zip(a['claims'], b['claims']):
        if x['status'] != y['status']:
            print(f"  {x['id']} ({x['label']}) {x['status']} {'✓' if x['ok'] else '✗'} → {y['status']} {'✓' if y['ok'] else '✗'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--report')
    ap.add_argument('--annex')
    ap.add_argument('--claims', default=str(CLAIMS))
    ap.add_argument('--out')
    ap.add_argument('--keep', action='store_true')
    ap.add_argument('--compare', nargs=2)
    args = ap.parse_args()
    if args.compare:
        return compare(*args.compare)
    if not (args.report and args.annex and args.out):
        sys.exit('--report, --annex, --out 를 주세요(비교는 --compare a.json b.json).')
    run(args)


if __name__ == '__main__':
    main()
