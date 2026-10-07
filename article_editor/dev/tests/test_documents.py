"""자료 파일 텍스트 추출(core/documents.py): DOCX·HWPX·HWP·PDF·텍스트와 오류 처리."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import base64
import io
import struct
import sys
import tempfile
import types
import unittest
import zipfile
import zlib
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core import documents as doc  # noqa: E402
from core import storage  # noqa: E402
from core import vault  # noqa: E402
from core.errors import RequestError  # noqa: E402
from vault_fixture import use_temp_vault  # noqa: E402


def payload(name, raw):
    return {'filename': name, 'data': 'data:application/octet-stream;base64,' + base64.b64encode(raw).decode()}


def zipped(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for name, text in files.items():
            z.writestr(name, text)
    return buf.getvalue()


def hwp_record(tag, body):
    return struct.pack('<I', tag | (len(body) << 20)) + body


def hwp_text(*parts):
    """parts: 문자열 또는 제어 코드(int). 8글자짜리 제어는 뒤에 7글자를 채운다."""
    units = []
    for p in parts:
        if isinstance(p, str):
            units += list(struct.unpack(f'<{len(p.encode("utf-16-le")) // 2}H', p.encode('utf-16-le')))
        else:
            units += [p] + ([0] * 7 if p not in doc._HWP_CHAR_CTRL else [])
    return struct.pack(f'<{len(units)}H', *units)


def minimal_pdf(text):
    stream = f'BT /F1 12 Tf 72 720 Td ({text}) Tj ET'.encode()
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>',
            b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R '
            b'/Resources << /Font << /F1 5 0 R >> >> >>',
            b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream',
            b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    out, offsets = b'%PDF-1.4\n', []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % i + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)
    out += b''.join(b'%010d 00000 n \n' % o for o in offsets)
    return out + b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)


class FakeOle:
    def __init__(self, streams):
        self.streams = streams

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def listdir(self):
        return [name.split('/') for name in self.streams]

    def openstream(self, entry):
        return io.BytesIO(self.streams['/'.join(entry) if isinstance(entry, list) else entry])


class DocumentTests(unittest.TestCase):
    def setUp(self):  # 추출 결과 보관(암호화 저장소)은 임시 DB 로 — 실제 APP_DATA 에 쓰지 않는다
        use_temp_vault(self)

    def test_source_is_kept_once_with_original_name(self):
        out = doc.extract_text(payload('C:/x/보도자료 1.txt', '본문'.encode()))
        again = doc.extract_text(payload('보도자료 1.txt', '본문'.encode()))
        self.assertEqual(out['sourceId'], again['sourceId'])
        self.assertEqual(Path(out['path']).name, '보도자료 1.txt')
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT text FROM sources WHERE id = ?', (out['sourceId'],)).fetchone()[0], '본문')

    def test_docx_paragraphs_and_tables(self):
        w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
        xml = (f'<w:document {w}><w:body><w:p><w:r><w:t>예산은 </w:t></w:r><w:r><w:t>10억원이다.</w:t></w:r></w:p>'
               '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>항목</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')
        out = doc.extract_text(payload('a.docx', zipped({'word/document.xml': xml})))
        self.assertEqual(out['text'], '예산은 10억원이다.\n항목')
        self.assertEqual(out['format'], 'docx')

    def test_hwpx_sections_in_order(self):
        hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
        sec = lambda t: f'<hs:sec xmlns:hs="x" {hp}><hp:p><hp:run><hp:t>{t}</hp:t></hp:run></hp:p></hs:sec>'  # noqa: E731
        raw = zipped({'Contents/section10.xml': sec('셋째'), 'Contents/section0.xml': sec('첫째'),
                      'Contents/section2.xml': sec('둘째'), 'Contents/header.xml': '<h/>'})
        self.assertEqual(doc.extract_text(payload('b.hwpx', raw))['text'], '첫째\n둘째\n셋째')

    def test_hwp_record_text_skips_controls(self):
        body = hwp_text('가나 ', 9, '다', 11, '라', 13)  # 탭(인라인)·표(확장) 제어·문단 끝
        data = hwp_record(0x10 + 50, b'\0' * 8) + hwp_record(doc.HWPTAG_PARA_TEXT, body)
        self.assertEqual(doc.hwp_section_text(data), '가나 \t다라')

    def test_hwp_compressed_sections_via_ole(self):
        header = b'HWP Document File'.ljust(32, b'\0') + b'\0\0\0\0' + struct.pack('<I', 1)  # 압축
        sec = lambda t: zlib.compress(hwp_record(doc.HWPTAG_PARA_TEXT, hwp_text(t, 13)))[2:-4]  # noqa: E731  raw deflate
        fake = types.SimpleNamespace(OleFileIO=lambda f: FakeOle({
            'FileHeader': header, 'BodyText/Section1': sec('둘째 문단'), 'BodyText/Section0': sec('첫 문단')}))
        with mock.patch.dict(sys.modules, {'olefile': fake}):
            self.assertEqual(doc.extract_text(payload('c.hwp', b'OLE'))['text'], '첫 문단\n둘째 문단')

    def test_hwp_distribution_document_is_rejected(self):
        header = b'\0' * 36 + struct.pack('<I', 0x4)
        fake = types.SimpleNamespace(OleFileIO=lambda f: FakeOle({'FileHeader': header}))
        with mock.patch.dict(sys.modules, {'olefile': fake}):
            with self.assertRaises(RequestError) as ctx:
                doc.extract_text(payload('d.hwp', b'OLE'))
        self.assertIn('배포용', ctx.exception.message)

    def test_pdf_text(self):
        try:
            import pypdf  # noqa: F401
        except ImportError:
            self.skipTest('pypdf 미설치')
        self.assertEqual(doc.extract_text(payload('e.pdf', minimal_pdf('Budget 10 billion')))['text'], 'Budget 10 billion')

    def test_html_body_text_only(self):
        page = ("<html><head><title>공시</title><style>td{width:89px}</style></head><body>"
                "<p>예산은&nbsp;20억원</p><table><tr><td width=\"89\"><span>국비</span></td>\n<td>13억</td></tr>"
                "<tr><td>군비</td><td>7억</td></tr></table><script>alert(1)</script></body></html>")
        self.assertEqual(doc.extract_text(payload("g.html", page.encode()))["text"], "예산은 20억원\n\n국비 13억\n\n군비 7억")

    def test_plain_text_cp949(self):
        self.assertEqual(doc.extract_text(payload('f.txt', '보도자료'.encode('cp949')))['text'], '보도자료')

    def test_errors(self):
        for body, status in ((payload('g.exe', b'x'), 415), (payload('h.docx', b'not a zip'), 422),
                             (payload('i.txt', b'   '), 422), ({'filename': 'j.pdf'}, 400)):
            with self.assertRaises(RequestError) as ctx:
                doc.extract_text(body)
            self.assertEqual(ctx.exception.status, status, body.get('filename'))


if __name__ == '__main__':
    unittest.main()
