"""Create a ready-to-extract team ZIP from a fresh PyInstaller onedir build."""
from __future__ import annotations
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

START_CMD = r"""@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1"
"""
BROWSER_CMD = r"""@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1" -Browser
"""
START_PS = r"""param([switch]$Browser, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'AINewsroom.exe'
if ($Stop) {
    Get-Process -Name 'AINewsroom' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | ForEach-Object {
        if (-not $_.CloseMainWindow()) { Stop-Process -Id $_.Id }
    }
    exit 0
}
$env:AI_NEWSROOM_SKIP_DOTENV = '1'
$hasWebView = $false
$roots = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\EdgeWebView\Application'),
    (Join-Path $env:ProgramFiles 'Microsoft\EdgeWebView\Application'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\EdgeWebView\Application')
)
foreach ($root in $roots) {
    if (Test-Path -LiteralPath $root -PathType Container) {
        foreach ($version in (Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue)) {
            if (Test-Path -LiteralPath (Join-Path $version.FullName 'msedgewebview2.exe') -PathType Leaf) {
                $hasWebView = $true
            }
        }
    }
}
if ($Browser -or -not $hasWebView) {
    Start-Process -FilePath $exe -ArgumentList '--browser' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
} else {
    Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--label', default='2026-10-07 팀 테스트')
    args = parser.parse_args()
    root = args.dist.resolve()
    required = ['AINewsroom.exe', 'AINewsroom-debug.exe', '_internal/python313.dll',
                '_internal/models_manifest.json', '_internal/frontend/index.html',
                '_internal/node/node.exe', '_internal/node/LICENSE',
                '_internal/platform-generator/core-adapter.js',
                '_internal/platform-generator/node_modules/dotenv/dist/index.cjs']
    missing = [name for name in required if not (root / name).is_file()]
    if missing:
        raise RuntimeError('Incomplete EXE build: ' + ', '.join(missing))
    payload = [p for p in root.rglob('*') if p.is_file()]
    forbidden = [p.relative_to(root).as_posix() for p in payload if
        p.name == '.env' or p.name.startswith('.env.') or p.suffix.lower() == '.db'
        or any(part in ('local_data', '.article-workspace', 'logs') for part in p.relative_to(root).parts)]
    if forbidden:
        raise RuntimeError('User/config data found in distribution: ' + ', '.join(forbidden))
    manifest = json.loads((root / '_internal/models_manifest.json').read_text(encoding='utf-8'))
    total_models = sum(file['size'] for item in manifest['models'] for file in item['files'])
    readme = f"""AI Newsroom — {args.label}

1. ZIP 파일을 폴더에 전부 압축 해제합니다. ZIP 안에서 직접 실행하지 마세요.
2. '시작하기.cmd'를 더블클릭합니다. Python이나 Node 설치는 필요하지 않습니다.
   WebView2가 있는 PC는 앱 창으로, 없는 PC는 기본 브라우저로 열립니다.
   창이 열리지 않으면 '브라우저로 실행.cmd'를 사용하세요.
3. 앱 안에서 공유받은 팀 계정으로 로그인합니다. 계정/비밀번호는 이 압축에 포함하지 않았습니다.
4. 상단 모델 설치 메뉴에서 필요한 모델을 설치합니다. 모델은 Hugging Face에서 다운로드합니다.
   팩트체크에는 판정기와 자료 검색 임베딩이 필요합니다. 경계 모델은 의미 청킹을 보완하며,
   제목/부제 추천에는 해당 모델도 설치합니다. 전체 모델은 약 {total_models / 1e9:.2f} GB입니다.
   첫 모델 설치와 외부 AI 기능에는 인터넷이 필요합니다.
5. 기사 작성 → 자동 저장 → 자료 등록 → 팩트체크 → 플랫폼 변환을 사용합니다.

실행 환경: Windows 10/11 x64. 폴더 안의 _internal과 파일들을 함께 보관하세요.
AINewsroom.exe는 앱 창 직접 실행용, AINewsroom-debug.exe는 오류 진단용입니다.

저장 위치: %LOCALAPPDATA%\AI Newsroom
기사는 로컬 암호화 저장소에 저장됩니다. 다른 PC로 vault.db만 복사해도 열리지 않습니다.
앱에서 '자동 저장됨'을 확인한 뒤 종료하세요.
브라우저로 사용했다면 '종료하기.cmd'를 실행해 백그라운드 앱도 종료합니다.

오류 보고: 발생한 화면/메시지, 직전 작업, 이 배포본 날짜를 팀에 전달합니다.
필요하면 %LOCALAPPDATA%\AI Newsroom\logs\app.log를 확인합니다.
로그를 공유할 때는 개인 정보가 없는지 먼저 확인하세요. vault.db나 계정 비밀번호는 보내지 마세요.

이 배포본은 팀 테스트용이며 기록된 기술 부채는 남아 있습니다.
생성된 결과는 사용자가 검토하며, 자동 발행 기능은 없습니다.
"""
    (root / '시작하기.cmd').write_text(START_CMD.replace('\n', '\r\n'), encoding='ascii')
    (root / '브라우저로 실행.cmd').write_text(BROWSER_CMD.replace('\n', '\r\n'), encoding='ascii')
    stop_cmd = BROWSER_CMD.replace('-Browser', '-Stop')
    (root / '종료하기.cmd').write_text(stop_cmd.replace('\n', '\r\n'), encoding='ascii')
    (root / 'start-app.ps1').write_text(START_PS, encoding='ascii')
    (root / '먼저 읽어주세요.txt').write_text(readme, encoding='utf-8-sig')
    (root / 'BUILD_INFO.txt').write_text(args.label + '\n', encoding='utf-8-sig')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists():
        raise FileExistsError('Refusing to overwrite an existing release ZIP')
    with zipfile.ZipFile(args.out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(p for p in root.rglob('*') if p.is_file()):
            archive.write(path, (Path('AI Newsroom') / path.relative_to(root)).as_posix())
    checksum = hashlib.sha256()
    with args.out.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            checksum.update(block)
    args.out.with_suffix('.zip.sha256').write_text(checksum.hexdigest() + '  ' + args.out.name + '\n', encoding='ascii')
    print(json.dumps({'zip': str(args.out.resolve()), 'bytes': args.out.stat().st_size,
        'sha256': checksum.hexdigest(), 'models_download_bytes': total_models}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
