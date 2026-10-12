# -*- mode: python ; coding: utf-8 -*-
"""기사 작업실 데스크톱 배포본 빌드 명세 (PyInstaller 6.x).

    python -m PyInstaller --noconfirm --clean packaging/AINewsroom.spec

산출물
- 기본(폴더형): ``dist/AINewsroom/`` 안에
  ``AINewsroom.exe``(창 모드, 콘솔 없음) + ``AINewsroom-debug.exe``(콘솔 진단용).
  두 실행 파일은 같은 ``_internal/`` 폴더를 공유한다.
- ``AINEWSROOM_ONEFILE=1``: ``dist/AINewsroom.exe`` 단일 파일(포터블, 시작이 조금 느림)
- ``AINEWSROOM_NAME=이름``: 실행 파일 이름 변경
- ``packaging/app.ico`` 가 있으면 아이콘으로 쓴다.

설계 메모
- 진입점은 ``launcher.py`` 하나다(개발 실행과 배포본의 CLI/코드 경로가 같다).
- 앱이 읽는 UI·모델 매니페스트·선택적 Node 어댑터를 동봉한다. ``app_paths.py`` 가 배포본에서
  ``BUNDLE=_internal/`` · ``APP_ROOT=exe 폴더`` 로 해석해 준다.
- WebView2 .NET DLL 은 pywebview 의 PyInstaller 훅이 자동 수집한다
  (``webview/lib/**`` → ``Util.dll_path()`` 가 번들 안에서 같은 상대경로로 찾는다).
"""
import os
import runpy
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

APP_DIR = Path(SPECPATH).parent  # article_editor/ (프로젝트 루트)
SRC = APP_DIR / 'app'  # 실행 코드(진입점·core·desktop·frontend)
NAME = os.environ.get('AINEWSROOM_NAME') or 'AINewsroom'
ONEFILE = os.environ.get('AINEWSROOM_ONEFILE', '').lower() not in ('', '0', 'false')
ICON = APP_DIR / 'packaging' / 'app.ico'

# 읽기 전용 리소스만 동봉한다. vault·모델 가중치·.env 는 사용자 데이터다.
datas = [
    (str(SRC / 'frontend'), 'frontend'),
    # 모델 매니페스트(파일 목록·해시) — 실제 모델 파일은 첫 사용 때 models/ 로 내려받는다
    (str(SRC / 'models_manifest.json'), '.'),
]

# pywebview 는 네이티브 백엔드를 런타임에 고르므로 직접 지목한다.
hiddenimports = [
    'webview.platforms.winforms',
    'desktop',
    'desktop.runtime',
    'desktop.shell',
    'desktop.smoke',
    'keyring.backends.Windows',
    'win32ctypes.pywin32.win32cred',
    'win32ctypes.pywin32.pywintypes',
    'sqlcipher3._sqlite3',
]

# Include lazy AI imports without importing core/config (or reading .env) at build time.
hiddenimports += [
    '.'.join(path.relative_to(SRC).with_suffix('').parts)
    for path in (SRC / 'core' / 'ai').rglob('*.py')
    if path.name != '__init__.py'
]
binaries = []
for package in ('sqlcipher3', 'keyring', 'win32ctypes', 'onnxruntime', 'tokenizers', 'numpy'):
    package_datas, package_binaries, package_imports = collect_all(
        package,
        include_py_files=False,
        filter_submodules=lambda name: not any(part in ('tests', 'testing', 'tools', 'quantization')
                                                for part in name.split('.')),
        exclude_datas=['**/tests/**', '**/testing/**', '**/__pycache__/**'],
    )
    datas += package_datas
    # collect_all includes collect_dynamic_libs; Analysis also resolves .pyd DLL dependencies.
    binaries += package_binaries
    hiddenimports += package_imports

# Required prepared runtime: the teammate PC does not need Node/npm.
# Preparation is a separate step; the EXE build never downloads dependencies.
platform_tools = runpy.run_path(str(APP_DIR / 'packaging' / 'prepare_platform.py'))
vendor, platform_info = platform_tools['prepared_bundle']()
node = vendor / 'node' / 'node.exe'
binaries.append((str(node), 'node'))
datas.append((str(vendor / 'node' / 'LICENSE'), 'node'))
datas.append((str(vendor / 'bundle.json'), '.'))
generator = vendor / 'platform-generator'
generator_files = [path for path in generator.rglob('*') if path.is_file()]
datas += [(str(path), str(Path('platform-generator') / path.relative_to(generator).parent))
          for path in generator_files]
print(f"[packaging] Node {platform_info['version']} x64: {node.stat().st_size:,} bytes")
print(f"[packaging] Platform generator: {len(generator_files):,} files, {sum(p.stat().st_size for p in generator_files):,} bytes")

# ONNX inference libraries are included; model weights and training stacks are not.
excludes = [
    'torch',
    'transformers',
    'sentencepiece',
    'safetensors',
    'scipy',
    'pandas',
    'matplotlib',
    'PIL',
    'IPython',
    'pytest',
    'tests',
    'tkinter',
]

exe_options = dict(
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    disable_windowed_traceback=False,  # 창 모드에서 미처리 예외를 대화상자로 보여 준다
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ICON) if ICON.is_file() else None,
)

a = Analysis(
    [str(SRC / 'launcher.py')],
    pathex=[str(SRC)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

if ONEFILE:
    exe = EXE(pyz, a.scripts, a.binaries, a.datas, name=NAME, console=False, **exe_options)
    debug_exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        name=f'{NAME}-debug',
        console=True,
        **exe_options,
    )
else:
    exe = EXE(pyz, a.scripts, exclude_binaries=True, name=NAME, console=False, **exe_options)
    debug_exe = EXE(
        pyz,
        a.scripts,
        exclude_binaries=True,
        name=f'{NAME}-debug',
        console=True,
        **exe_options,
    )
    coll = COLLECT(
        exe,
        debug_exe,
        a.binaries,
        a.datas,
        strip=False,
        upx=False,
        upx_exclude=[],
        name=NAME,
    )
