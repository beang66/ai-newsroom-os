"""Render 서비스 설정을 API로 조회·전환한다 — 대시보드 UI에서 Runtime 을 찾지 않아도 되게.

    # 1) 현재 설정 확인(환경변수는 이름만) + 백업
    python dev/checks/render_service.py --key <KEY> --service <이름|id> --show --save temp/render_backup.json
    # 2) 보낼 내용 미리 보기(키 불필요, 전송 안 함)
    python dev/checks/render_service.py --service <id> --to-proxy --deploy --dry-run
    # 3) 우리 프록시(Python)로 전환 + 배포
    python dev/checks/render_service.py --key <KEY> --service <이름|id> --to-proxy --deploy
    # 4) 되돌리기(백업으로 복구 + 배포)
    python dev/checks/render_service.py --key <KEY> --service <이름|id> --restore temp/render_backup.json --deploy

키는 `RENDER_API_KEY` 환경변수로도 된다(Render → Account Settings → API Keys).
표준 라이브러리만 사용한다. 비밀값(환경변수 값)은 저장·출력하지 않는다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'https://api.render.com/v1'
# 우리 프록시(backend/server.py) 로 전환할 때의 설정
PROXY = {
    'branch': 'feature/app-core',
    'rootDir': 'backend',
    'serviceDetails': {
        'runtime': 'python',
        'healthCheckPath': '/ai/health',
        'envSpecificDetails': {
            'buildCommand': 'pip install -r requirements.txt',
            'startCommand': 'python server.py',
        },
    },
}


def call(key: str, method: str, path: str, body: dict | None = None):
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            'Authorization': 'Bearer ' + key,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            detail = json.loads(raw)
        except ValueError:
            detail = raw.decode('utf-8', 'replace')[:400]
        return error.code, detail
    except Exception as error:
        return 0, str(error)


def find_service(key: str, wanted: str) -> dict:
    status, payload = call(key, 'GET', '/services?limit=100')
    if status != 200:
        print(f'FAIL  서비스 목록 조회 실패({status}): {payload}')
        raise SystemExit(1)
    for row in payload or []:
        service = row.get('service', row)
        if wanted in (service.get('id'), service.get('name')):
            return service
    names = ', '.join((row.get('service', row).get('name') or '?') for row in (payload or []))
    print(f'FAIL  서비스를 찾지 못했습니다: {wanted}\n      있는 서비스: {names}')
    raise SystemExit(1)


def summarize(service: dict) -> None:
    details = service.get('serviceDetails') or {}
    env = details.get('envSpecificDetails') or {}
    print('서비스:', service.get('name'), '|', service.get('id'), '| type:', service.get('type'))
    print('  repo       :', (service.get('repo') or '').replace('https://github.com/', ''))
    print('  branch     :', service.get('branch'))
    print('  rootDir    :', service.get('rootDir') or '(루트)')
    print('  runtime    :', details.get('runtime') or details.get('env'))
    print('  build      :', env.get('buildCommand'))
    print('  start      :', env.get('startCommand'))
    print('  healthPath :', details.get('healthCheckPath') or '(없음)')
    print('  autoDeploy :', service.get('autoDeploy'))
    keys = [item.get('key') for item in (service.get('envVars') or [])]
    print('  env keys   :', ', '.join(keys) if keys else '(없음)')


def backup(service: dict, path: Path) -> None:
    """되돌리기에 필요한 최소 필드만 저장한다(환경변수 값은 저장하지 않는다)."""
    details = service.get('serviceDetails') or {}
    payload = {
        'branch': service.get('branch'),
        'rootDir': service.get('rootDir'),
        'autoDeploy': service.get('autoDeploy'),
        'serviceDetails': {
            'runtime': details.get('runtime') or details.get('env'),
            'healthCheckPath': details.get('healthCheckPath'),
            'envSpecificDetails': details.get('envSpecificDetails'),
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('백업 저장:', path)


def restore_body(path: Path) -> dict:
    data = json.loads(path.read_text(encoding='utf-8'))
    body = {key: data[key] for key in ('branch', 'rootDir', 'autoDeploy') if data.get(key) is not None}
    details = data.get('serviceDetails') or {}
    if details:
        body['serviceDetails'] = {key: value for key, value in details.items() if value is not None}
    return body


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description='Render 서비스 설정 조회/전환(우리 프록시)')
    parser.add_argument('--key', default=os.environ.get('RENDER_API_KEY', ''), help='Render API 키(또는 RENDER_API_KEY)')
    parser.add_argument('--service', default='', help='서비스 이름 또는 id(srv-...)')
    parser.add_argument('--show', action='store_true', help='현재 설정 표시')
    parser.add_argument('--save', default='', help='--show 와 함께: 현재 설정을 파일로 백업')
    parser.add_argument('--to-proxy', action='store_true', help='우리 프록시(Python) 설정으로 전환')
    parser.add_argument('--restore', default='', help='백업 파일로 복구')
    parser.add_argument('--deploy', action='store_true', help='변경 후 배포 트리거(API는 자동 배포하지 않는다)')
    parser.add_argument('--dry-run', action='store_true', help='전송하지 않고 보낼 내용만 표시(키 불필요)')
    args = parser.parse_args(argv)

    if args.dry_run:
        body = PROXY if args.to_proxy else (restore_body(Path(args.restore)) if args.restore else {})
        print('PATCH', BASE + '/services/<id>')
        print(json.dumps(body, ensure_ascii=False, indent=2))
        if args.deploy:
            print('POST ', BASE + '/services/<id>/deploys  ' + json.dumps({'clearCache': 'clear'}))
        print('(dry-run: 전송하지 않았습니다)')
        return 0

    if not args.service:
        print('FAIL  --service <이름|id> 가 필요합니다.')
        return 1
    if not args.key:
        print('FAIL  Render API 키가 필요합니다: --key <KEY> 또는 RENDER_API_KEY 환경변수.')
        print('      Render → Account Settings → API Keys 에서 발급합니다.')
        return 1
    if args.to_proxy and args.restore:
        print('FAIL  --to-proxy 와 --restore 는 함께 쓸 수 없습니다.')
        return 1

    service = find_service(args.key, args.service)
    if args.show or not (args.to_proxy or args.restore):
        summarize(service)
    if args.save:
        backup(service, Path(args.save))

    if args.to_proxy:
        body, label = dict(PROXY), '프록시(Python) 설정으로 전환'
    elif args.restore:
        body, label = restore_body(Path(args.restore)), '백업으로 복구'
    else:
        return 0

    print('--- ' + label + ' ---')
    print(json.dumps(body, ensure_ascii=False, indent=2))
    status, payload = call(args.key, 'PATCH', '/services/' + service['id'], body)
    if status != 200:
        print(f'FAIL  PATCH {status}: {payload}')
        return 1
    print('OK    설정 변경됨')
    if isinstance(payload, dict):
        summarize(payload)

    if args.deploy:
        status, payload = call(args.key, 'POST', '/services/%s/deploys' % service['id'], {'clearCache': 'clear'})
        if status not in (201, 202):
            print(f'FAIL  배포 트리거 {status}: {payload}')
            return 1
        print('OK    배포 시작:', (payload or {}).get('id') if isinstance(payload, dict) else '')
    else:
        print('참고: API 변경은 자동 배포되지 않습니다 — --deploy 를 붙이거나 대시보드에서 Deploy 하세요.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
