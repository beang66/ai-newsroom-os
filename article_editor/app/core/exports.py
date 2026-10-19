"""내보내기 — 사용자가 누른 경우에만 평문 파일을 만든다(docs/STORAGE_DESIGN.md §4, 2026-10-18 결정 D2: 고정 폴더 + 폴더 열기).

위치: 내 문서\\AI Newsroom\\내보내기\\<종류>\\
이름: YYYYMMDD[-HHMM]_<기사 제목 앞 30자>_<무엇>.<확장자>, 같은 이름이 있으면 덮어쓰지 않고 ' (2)' 를 붙인다.
카드뉴스는 기사마다 하위 폴더에 01.jpg 부터. 백업 파일 이름에는 기사 제목을 넣지 않는다(이름으로 내용이 새지 않게).
"""
import base64
import datetime
import re
import subprocess
import sys
from pathlib import Path

from . import config  # noqa: F401  — sys.path 에 app/ 를 올린다(app_paths)
from app_paths import DOCUMENTS  # noqa: E402

from .errors import RequestError

EXPORT_DIR = DOCUMENTS / '내보내기'
KINDS = {'backup': '백업', 'cards': '카드뉴스', 'photos': '사진', 'transcripts': '녹취', 'diagnostics': '진단'}
# diagnostics: 사용자 테스트 기록은 Core 가 직접 쓴다(ut_event_manager) — 화면에서 보낸 파일로는 저장할 수 없다
EXTENSIONS = {'backup': {'db'}, 'cards': {'jpg'}, 'photos': {'jpg', 'png', 'webp'}, 'transcripts': {'txt'}, 'diagnostics': set()}
MAX_FILES = 20
_BAD = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def _slug(text, limit):
    """파일 이름 조각: 금지 문자를 빼고 공백은 '-'. 경로 구분자가 없어 폴더 밖으로 나갈 수 없다."""
    text = re.sub(r'\s+', '-', _BAD.sub('', text if isinstance(text, str) else '').strip())
    return text[:limit].strip('-.')


def _unique(path):
    if not path.exists():
        return path
    for number in range(2, 1000):
        candidate = path.with_name(f'{path.stem} ({number}){path.suffix}')
        if not candidate.exists():
            return candidate
    raise RequestError('같은 이름의 내보내기 파일이 너무 많습니다. 내보내기 폴더를 정리해 주세요.', 409)


def _kind(payload):
    kind = (payload or {}).get('kind')
    if kind not in KINDS:
        raise RequestError(f"kind 는 {', '.join(KINDS)} 중 하나입니다.")
    return kind


def folder(kind):
    return EXPORT_DIR / KINDS[kind]


def save(payload, now=None):
    """payload: {kind, title?, label?, files: [{data(base64 또는 data URL), ext}]} → {folder, files:[경로]}"""
    kind = _kind(payload)
    files = payload.get('files')
    if not isinstance(files, list) or not 0 < len(files) <= MAX_FILES:
        raise RequestError(f'내보낼 파일을 1~{MAX_FILES}개 보내 주세요.')
    raws = []
    for item in files:
        ext = (item or {}).get('ext') if isinstance(item, dict) else None
        if ext not in EXTENSIONS[kind]:
            raise RequestError(f"{KINDS[kind]} 내보내기는 {', '.join(sorted(EXTENSIONS[kind]))} 형식만 됩니다.")
        try:
            raw = base64.b64decode(str(item.get('data', '')).split(',', 1)[-1], validate=True)
        except ValueError:
            raise RequestError('내보낼 파일 내용(base64)을 읽지 못했습니다.') from None
        if not raw:
            raise RequestError('내보낼 파일 내용이 비어 있습니다.')
        raws.append((raw, ext))
    now = now or datetime.datetime.now()
    day, minute = now.strftime('%Y%m%d'), now.strftime('%Y%m%d-%H%M')
    title, label = _slug(payload.get('title'), 30), _slug(payload.get('label'), 40)
    target = folder(kind)
    if kind == 'cards':
        target = _unique(target / '_'.join(p for p in (day, title or '카드뉴스') if p))
        names = [f'{index:02d}.{ext}' for index, (_, ext) in enumerate(raws, 1)]
    elif kind == 'backup':
        names = [f'AI-Newsroom-백업_{minute}.{ext}' for _, ext in raws]
    else:
        base = '_'.join(p for p in (day, title, label) if p) or day
        names = [f'{base}.{ext}' if len(raws) == 1 else f'{base}_{index}.{ext}' for index, (_, ext) in enumerate(raws, 1)]
    target.mkdir(parents=True, exist_ok=True)
    written = []
    for (raw, _), name in zip(raws, names):
        path = _unique(target / name)
        path.write_bytes(raw)
        written.append(str(path))
    return {'folder': str(target), 'files': written}


def open_folder(payload):
    """내보내기 폴더(종류별, kind 없으면 전체)를 파일 탐색기로 연다 → {opened, folder}"""
    target = folder(_kind(payload)) if (payload or {}).get('kind') else EXPORT_DIR
    target.mkdir(parents=True, exist_ok=True)
    # os.startfile 은 폴더 연결이 바뀐 PC에서 오류 없이 아무 창도 안 열 때가 있어 explorer 를 직접 부른다
    opener = {'win32': 'explorer', 'darwin': 'open'}.get(sys.platform, 'xdg-open')
    subprocess.Popen([opener, str(target)])  # noqa: S603 — 앱이 정한 내보내기 폴더만
    return {'opened': True, 'folder': str(Path(target))}
