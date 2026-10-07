"""Prepare the Node/generator bundle without changing the development checkout.

Run from article_editor: python packaging/prepare_platform.py
Artifacts stay in ignored packaging/vendor and survive build/dist cleanup.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parent / 'platform-generator'
VENDOR = APP / 'packaging/vendor'


def source_files(root=SOURCE):
    files = [p for p in root.glob('*.js') if not p.name.startswith('test-')]
    files += [root / 'package.json', root / 'package-lock.json']
    files += list((root / 'public').rglob('*'))
    files += list(root.glob('LICENSE*')) + list(root.glob('NOTICE*'))
    return sorted({p for p in files if p.is_file() and p.resolve().is_relative_to(root.resolve())
        and not any(part.startswith('.') or part in ('node_modules', 'output', 'local_data')
                    for part in p.relative_to(root).parts)})


def source_digest(root=SOURCE):
    digest = hashlib.sha256()
    for path in source_files(root):
        digest.update(path.relative_to(root).as_posix().encode('utf-8') + b'\0')
        digest.update(path.read_bytes())
    return digest.hexdigest()


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def prepared_bundle():
    """Fail visibly instead of silently shipping an EXE without conversion."""
    try:
        info = json.loads((VENDOR / 'bundle.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise RuntimeError('Run python packaging/prepare_platform.py before building the EXE.')
    if info.get('source_sha256') != source_digest() or info.get('source_sha256') != source_digest(VENDOR / 'platform-generator'):
        raise RuntimeError('Platform source changed: rerun packaging/prepare_platform.py.')
    required = ['node/node.exe', 'node/LICENSE', 'platform-generator/core-adapter.js',
                'platform-generator/node_modules/.package-lock.json']
    if not all((VENDOR / name).is_file() for name in required):
        raise RuntimeError('Platform bundle incomplete: rerun packaging/prepare_platform.py.')
    return VENDOR, info


def prepare():
    try:
        _, info = prepared_bundle()
        print('Platform bundle already prepared:', json.dumps(info, ensure_ascii=False))
        return
    except RuntimeError:
        pass
    if os.name != 'nt':
        raise RuntimeError('Prepare on Windows x64 with a local Node/npm installation.')
    node = shutil.which('node')
    npm = shutil.which('npm.cmd')
    if not node or not npm:
        raise RuntimeError('Node.js and npm are required on the build PC.')
    node_info = json.loads(subprocess.check_output([node, '-p',
        'JSON.stringify({version:process.version,arch:process.arch,platform:process.platform})'],
        text=True, timeout=10))
    if node_info['arch'] != 'x64' or node_info['platform'] != 'win32':
        raise RuntimeError('The packaged runtime must be Windows x64 Node.')
    staging_parent = APP / 'build'
    staging_parent.mkdir(exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='platform-bundle-', dir=staging_parent))
    generator = staging / 'platform-generator'
    generator.mkdir()
    expected_source = source_digest()
    for path in source_files():
        dest = generator / path.relative_to(SOURCE)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest)
    subprocess.run([npm, 'ci', '--omit=dev', '--no-audit', '--no-fund'], cwd=generator,
        env={**os.environ, 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD': '1'}, check=True, timeout=180)
    if expected_source != source_digest() or expected_source != source_digest(generator):
        raise RuntimeError('Source changed during preparation; rerun before publishing the bundle.')
    node_dir = staging / 'node'
    node_dir.mkdir()
    shutil.copyfile(node, node_dir / 'node.exe')
    license_url = f"https://raw.githubusercontent.com/nodejs/node/{node_info['version']}/LICENSE"
    with urllib.request.urlopen(license_url, timeout=30) as response:
        license_text = response.read()
    if b'Node.js' not in license_text or b'Permission' not in license_text:
        raise RuntimeError('The Node license response is invalid.')
    (node_dir / 'LICENSE').write_bytes(license_text)
    # Include existing package licenses; no developer .env, tests or work data.
    all_files = [p for p in staging.rglob('*') if p.is_file()]
    info = {**node_info, 'source_sha256': expected_source,
            'node_sha256': file_sha256(node_dir / 'node.exe'), 'node_license_url': license_url,
            'generator_files': sum(p.is_relative_to(generator) for p in all_files),
            'generator_bytes': sum(p.stat().st_size for p in all_files if p.is_relative_to(generator)),
            'node_bytes': (node_dir / 'node.exe').stat().st_size,
            'format': 1}
    (staging / 'bundle.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Only rotate task-owned generated artifacts, never recursively delete.
    if not staging.resolve().is_relative_to(staging_parent.resolve()) or not VENDOR.resolve().is_relative_to(APP.resolve()):
        raise RuntimeError('Unexpected bundle destination')
    if VENDOR.exists():
        if not (VENDOR / 'bundle.json').is_file():
            raise RuntimeError('Refusing to replace an unmanaged vendor directory')
        previous = VENDOR.with_name('vendor-previous-' + str(time.time_ns()))
        if not previous.resolve().is_relative_to(APP.resolve()):
            raise RuntimeError('Unexpected previous-bundle destination')
        VENDOR.rename(previous)
    staging.rename(VENDOR)
    print('Prepared platform bundle:', json.dumps(info, ensure_ascii=False), flush=True)
    print('Bundle path:', VENDOR, flush=True)


if __name__ == '__main__':
    prepare()
