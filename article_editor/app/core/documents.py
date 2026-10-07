"""자료 파일 → 텍스트 (팩트체크 서랍 업로드). PDF·DOCX·HWPX·HWP·텍스트.

추출에 성공한 파일은 원본과 텍스트를 내 문서/AI Newsroom/sources 에 보관한다(storage.save_source).

PDF 는 pypdf, 옛 HWP(한글 5.x 바이너리)는 olefile 로 열고 본문 레코드를 직접 읽는다.
DOCX·HWPX 는 zip 안의 XML 이라 표준 라이브러리로 충분하다. 스캔 PDF(이미지)는 글자가 없어 OCR 이 필요하다.
"""
import base64
import io
import re
import struct
import zipfile
import zlib
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

from . import storage
from .errors import RequestError

MAX_FILE = 30_000_000
HWPTAG_PARA_TEXT = 0x10 + 51
# HWP 본문 제어 문자: 이 값들은 1글자, 나머지 32 미만은 8글자(16바이트)짜리 인라인·확장 제어
_HWP_CHAR_CTRL = {0, 10, 13} | set(range(24, 32))


def _xml_text(xml, para, text):
    """XML 에서 문단(para)마다 글자(text) 요소를 이어 붙인다(네임스페이스 무시, 표 안 문단 포함)."""
    out, line = [], []
    for _, el in ET.iterparse(io.BytesIO(xml), events=('end',)):
        tag = el.tag.rsplit('}', 1)[-1]
        if tag == text:
            line.append(''.join(el.itertext()))
        elif tag == para:
            out.append(''.join(line))
            line = []
    return '\n'.join(out)


def _docx(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        return _xml_text(z.read('word/document.xml'), 'p', 't')


def _hwpx(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        sections = sorted((n for n in z.namelist() if re.fullmatch(r'Contents/section\d+\.xml', n)),
                          key=lambda n: int(re.search(r'\d+', n.rsplit('/', 1)[-1]).group()))
        return '\n'.join(_xml_text(z.read(n), 'p', 't') for n in sections)


def _pdf(raw):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RequestError('PDF 를 읽으려면 pypdf 가 필요합니다(pip install -r requirements-factcheck.txt).', 503)
    reader = PdfReader(io.BytesIO(raw))
    if reader.is_encrypted and not reader.decrypt(''):
        raise RequestError('암호가 걸린 PDF 는 읽을 수 없습니다.', 422)
    return '\n\n'.join((page.extract_text() or '').strip() for page in reader.pages)


def hwp_section_text(data):
    """HWP 본문 섹션(압축 해제된 레코드 열) → 텍스트. 문단 글자 레코드(PARA_TEXT)만 읽는다."""
    out, pos = [], 0
    while pos + 4 <= len(data):
        head, = struct.unpack_from('<I', data, pos)
        tag, size = head & 0x3FF, head >> 20
        pos += 4
        if size == 0xFFF:
            size, = struct.unpack_from('<I', data, pos)
            pos += 4
        if tag == HWPTAG_PARA_TEXT:
            out.append(_hwp_para(data[pos:pos + size]))
        pos += size
    return '\n'.join(out)


def _hwp_para(raw):
    units = struct.unpack(f'<{len(raw) // 2}H', raw[:len(raw) // 2 * 2])
    keep, i = [], 0
    while i < len(units):
        c = units[i]
        if c >= 32:
            keep.append(c)
        elif c == 9:
            keep.append(9)  # 탭(인라인 제어, 8글자)
        elif c == 10:
            keep.append(10)
        i += 1 if c >= 32 or c in _HWP_CHAR_CTRL else 8
    return struct.pack(f'<{len(keep)}H', *keep).decode('utf-16-le', 'ignore')


def _hwp(raw):
    try:
        import olefile
    except ImportError:
        raise RequestError('HWP 를 읽으려면 olefile 이 필요합니다(pip install -r requirements-factcheck.txt).', 503)
    with olefile.OleFileIO(io.BytesIO(raw)) as ole:
        flags, = struct.unpack_from('<I', ole.openstream('FileHeader').read(), 36)
        if flags & 0x2:
            raise RequestError('암호가 걸린 HWP 는 읽을 수 없습니다.', 422)
        if flags & 0x4:
            raise RequestError('배포용 HWP 는 읽을 수 없습니다. 한글에서 일반 문서로 저장해 올려 주세요.', 422)
        sections = sorted((e for e in ole.listdir() if len(e) == 2 and e[0] == 'BodyText' and e[1].startswith('Section')),
                          key=lambda e: int(e[1][7:]))
        texts = []
        for entry in sections:
            data = ole.openstream(entry).read()
            texts.append(hwp_section_text(zlib.decompress(data, -15) if flags & 0x1 else data))
        return '\n'.join(texts)


def _plain(raw):
    for enc in ('utf-8-sig', 'cp949'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode('utf-8', 'replace')


class _HtmlText(HTMLParser):
    """HTML → 본문 글자. 블록·표 행은 줄바꿈, 표 칸은 공백 둘, script·style·head 는 버린다(문자 참조는 HTMLParser 가 푼다)."""
    BLOCK = {'p', 'div', 'br', 'tr', 'li', 'table', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'title'}
    SKIP = {'script', 'style', 'head', 'noscript'}

    def __init__(self):
        super().__init__()
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.parts.append('\n')
        elif tag in ('td', 'th'):
            self.parts.append('  ')

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCK:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(re.sub(r'\s+', ' ', data))  # 소스의 줄바꿈은 공백 — 줄은 블록·표 행에서만 바뀐다


def _html(raw):
    parser = _HtmlText()
    parser.feed(_plain(raw))
    parser.close()
    text = re.sub(r'[ \t ]+', ' ', ''.join(parser.parts))
    return re.sub(r'\n\s*\n+', '\n\n', re.sub(r' *\n *', '\n', text)).strip()


READERS = {'pdf': _pdf, 'docx': _docx, 'hwpx': _hwpx, 'hwp': _hwp,
           'txt': _plain, 'md': _plain, 'csv': _plain, 'json': _plain, 'html': _html, 'htm': _html}


def extract_text(payload):
    """payload: {filename, data(base64 또는 data URL)} → {text, chars, format, sourceId, path}"""
    name = payload.get('filename')
    data = payload.get('data')
    if not isinstance(name, str) or not isinstance(data, str) or not data:
        raise RequestError('파일 이름(filename)과 내용(data)을 보내 주세요.')
    fmt = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    reader = READERS.get(fmt)
    if reader is None:
        raise RequestError(f'지원하지 않는 형식입니다: .{fmt} (PDF·DOCX·HWP·HWPX·TXT 등)', 415)
    try:
        raw = base64.b64decode(data.split(',', 1)[-1], validate=True)
    except ValueError:
        raise RequestError('파일 내용(base64)을 읽지 못했습니다.')
    if len(raw) > MAX_FILE:
        raise RequestError('파일이 너무 큽니다(30MB 이하).', 413)
    try:
        text = reader(raw)
    except RequestError:
        raise
    except Exception:
        raise RequestError(f'{name} 을(를) 읽지 못했습니다. 파일이 손상됐거나 형식이 다릅니다.', 422)
    text = re.sub(r'[ \t ]+\n', '\n', text).strip()
    if not text:
        raise RequestError('글자를 찾지 못했습니다. 스캔한 이미지 PDF 는 OCR 이 필요합니다.', 422)
    source_id, path = storage.save_source(name, raw, text)
    from .source_index import start_indexing
    # TODO(debt: DEBT-003): 원본/추출 텍스트 저장 후 색인 시작이 실패해도 업로드 전체가 오류 응답한다.
    # 이미 저장된 자료를 실패로 오인해 재업로드할 수 있다. 색인 시작 실패는 pending으로 분리할 것.
    index = start_indexing(source_id)
    return {'text': text, 'chars': len(text), 'format': fmt, 'sourceId': source_id, 'path': path, **index}
