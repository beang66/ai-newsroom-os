"""내보내기(2026-10-18 D2): 내 문서\\AI Newsroom\\내보내기\\<종류>\\ 에 이름 규칙대로 쓰고, 덮어쓰지 않으며, 폴더 밖으로 못 나간다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import base64
import datetime
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import vault_fixture  # noqa: E402,F401  — app/ 를 sys.path 에 올린다
from core import exports  # noqa: E402
from core.errors import RequestError  # noqa: E402

NOW = datetime.datetime(2026, 10, 18, 20, 10)
B64 = base64.b64encode(b'bytes').decode()


class ExportTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name) / '내보내기'
        patcher = mock.patch.object(exports, 'EXPORT_DIR', self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def names(self, result):
        return [Path(path).relative_to(self.root).as_posix() for path in result['files']]

    def test_names_follow_the_rule_per_kind(self):
        title = '폭염 대응: 취약계층/쪽방촌 "집중" 분석'
        self.assertEqual(self.names(exports.save({'kind': 'cards', 'title': title, 'files': [{'data': B64, 'ext': 'jpg'}] * 2}, NOW)),
                         ['카드뉴스/20261018_폭염-대응-취약계층쪽방촌-집중-분석/01.jpg', '카드뉴스/20261018_폭염-대응-취약계층쪽방촌-집중-분석/02.jpg'])
        self.assertEqual(self.names(exports.save({'kind': 'backup', 'title': '비밀 제목', 'files': [{'data': B64, 'ext': 'db'}]}, NOW)),
                         ['백업/AI-Newsroom-백업_20261018-2010.db'], '백업 이름에는 제목을 넣지 않는다')
        self.assertEqual(self.names(exports.save({'kind': 'transcripts', 'label': '인터뷰 1_전사', 'files': [{'data': B64, 'ext': 'txt'}]}, NOW)),
                         ['녹취/20261018_인터뷰-1_전사.txt'])
        photo = exports.save({'kind': 'photos', 'label': '원본사진', 'files': [{'data': 'data:image/png;base64,' + B64, 'ext': 'png'}]}, NOW)
        self.assertEqual(Path(photo['files'][0]).read_bytes(), b'bytes')

    def test_same_name_is_not_overwritten(self):
        first = exports.save({'kind': 'photos', 'label': 'a', 'files': [{'data': B64, 'ext': 'jpg'}]}, NOW)
        second = exports.save({'kind': 'photos', 'label': 'a', 'files': [{'data': B64, 'ext': 'jpg'}]}, NOW)
        self.assertEqual(self.names(first) + self.names(second), ['사진/20261018_a.jpg', '사진/20261018_a (2).jpg'])

    def test_rejects_bad_kind_extension_and_path_tricks(self):
        for payload in ({'kind': '../x', 'files': [{'data': B64, 'ext': 'jpg'}]},
                        {'kind': 'photos', 'files': [{'data': B64, 'ext': 'exe'}]},
                        {'kind': 'photos', 'files': []},
                        {'kind': 'photos', 'files': [{'data': '@@@', 'ext': 'jpg'}]}):
            with self.assertRaises(RequestError):
                exports.save(payload, NOW)
        result = exports.save({'kind': 'photos', 'title': '../../밖', 'label': '..\\..', 'files': [{'data': B64, 'ext': 'jpg'}]}, NOW)
        self.assertTrue(Path(result['files'][0]).resolve().is_relative_to(self.root.resolve()))

    def test_rejects_empty_decoded_file_before_writing(self):
        with self.assertRaises(RequestError):
            exports.save({'kind': 'backup', 'files': [{'data': '', 'ext': 'db'}]}, NOW)
        self.assertFalse(self.root.exists())

    def test_open_folder_creates_and_opens_kind_folder(self):
        with mock.patch.object(exports.sys, 'platform', 'win32'), mock.patch.object(exports.os, 'startfile', create=True) as start:
            result = exports.open_folder({'kind': 'cards'})
        start.assert_called_once_with(self.root / '카드뉴스')
        self.assertTrue((self.root / '카드뉴스').is_dir())
        self.assertEqual(result['opened'], True)


if __name__ == '__main__':
    unittest.main()
