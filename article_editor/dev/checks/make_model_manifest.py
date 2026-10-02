"""모델 폴더 → `models_manifest.json` 생성기(개발 도구).

    python dev/checks/make_model_manifest.py --dir "<모델 폴더>" --id factcheck-qwen3-0.6b-v10 \
        --out app/models_manifest.json [--base https://<호스트>/models/<폴더>]

- 폴더 안 모든 파일의 상대경로·크기·SHA-256 을 기록한다(앱이 무결성 검증에 사용).
- `base`(원본 주소)는 호스팅 위치를 모르므로 비워 두고 나중에 채워도 된다.
  비어 있으면 앱이 `--from <폴더|URL>` 로 설치하거나, 배포 시 매니페스트에 채운다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

CHUNK = 1 << 20


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(CHUNK), b''):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description='모델 매니페스트 생성')
    parser.add_argument('--dir', required=True, help='모델 폴더(예: backend/models/base/Qwen3-0.6B 상위)')
    parser.add_argument('--id', default='model', help='모델 id (예: factcheck-qwen3-0.6b-v10)')
    parser.add_argument('--label', default='', help='사람이 읽는 이름')
    parser.add_argument('--kind', default='', help='용도(예: factcheck / headline / subtitle)')
    parser.add_argument('--subdir', default='', help='앱에 저장할 하위 폴더명(기본: id)')
    parser.add_argument('--base', default='', help='원본 주소(URL 또는 공유 폴더). 비워도 됨')
    parser.add_argument('--out', default='', help='출력 파일(기본: 표준출력)')
    args = parser.parse_args()

    root = Path(args.dir).expanduser().resolve()
    if not root.is_dir():
        print('폴더를 찾지 못했습니다: ' + str(root), file=sys.stderr)
        return 1

    files = []
    total = 0
    for path in sorted(p for p in root.rglob('*') if p.is_file()):
        relative = path.relative_to(root).as_posix()
        if any(part.startswith('.') for part in Path(relative).parts):
            continue
        size = path.stat().st_size
        total += size
        files.append({'path': relative, 'size': size, 'sha256': sha256(path)})
        print(f'  {relative}  {size / 1e6:.1f} MB', file=sys.stderr)

    entry = {
        'id': args.id,
        'label': args.label or args.id,
        'kind': args.kind or 'model',
        'dir': args.subdir or args.id,
        'base': args.base,
        'files': files,
    }
    manifest = {
        'version': 1,
        'note': 'dev/checks/make_model_manifest.py 로 생성. base 를 호스팅 주소로 채우면 앱이 자동 다운로드한다.',
        'models': [entry],
    }
    text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding='utf-8')
        print(
            f'\n{out} 에 기록했습니다 — 파일 {len(files)}개, 합계 {total / 1e9:.2f} GB',
            file=sys.stderr,
        )
    else:
        print(text)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
