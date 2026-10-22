"""표 행 단위 검색 + 가공 표(evidence_rank.py, 기본 kc-band-table-ctx): 같은 표 행은 한 후보로 묶고, 주장 숫자가 맞는 행을 앞으로.
연구 구현과의 동일성(같은 단위 순위면 후보 10개 859/859 일치)은 research/mushroom-body-redesign/scripts/p30_app_parity.py 로 확인했다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))

try:
    import numpy as np
    from core.ai.factcheck import evidence_rank, kc_band, retrieval
    from test_chunk_index import FakeCache, make_chunks
except ImportError:  # 팩트체크 런타임이 없는 환경
    np = None

TABLE = ('< 기업심리지수 >\n구분 8월 9월\n'
         '전산업 92.1 93.4\n제조업 95.0 96.2\n수출기업 97.3 95.7\n내수기업 99.4 99.1')


@unittest.skipIf(np is None, 'numpy 필요')
class EvidenceRankTests(unittest.TestCase):
    def test_value_signatures(self):
        self.assertEqual(kc_band.sig('4,405.6억'), kc_band.sig('4405억6000만'))
        self.assertEqual(kc_band.text_sigs('163,420 13,256'), {'16342', '13256'})  # 띄어 쓴 표 숫자는 따로
        self.assertTrue(kc_band.sig_match('1406', {'14062'}))   # 세 자리 이상은 반올림 허용
        self.assertFalse(kc_band.sig_match('14', {'145'}))      # 짧은 숫자는 정확히만

    def test_table_rows_become_units_with_header(self):
        units = evidence_rank.units_of([{'text': TABLE, 'kind': 'table'}, {'text': '글 문단', 'kind': 'narrative'}])
        self.assertEqual(len(units), 5)
        self.assertTrue(units[0]['text'].startswith('< 기업심리지수 >\n구분 8월 9월\n전산업'))
        self.assertIsNone(units[4]['table'])

    def test_packed_table_gathers_and_fronts_claim_rows(self):
        chunks = [{'text': TABLE, 'kind': 'table', 'material_id': 'a'}] + [dict(c, kind='narrative') for c in make_chunks(30)]
        cache = FakeCache()
        claim = '9월 내수기업 지수는 99.1, 수출기업은 95.7이었다.'
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'kc-band-table-ctx'}):
            rows = retrieval.rank_chunks(claim, chunks, limit=10, cache=cache)
        table = next(r for r in rows if r['text'].startswith('< 기업심리지수 >'))
        lines = table['text'].split('\n')
        self.assertEqual(set(lines[2:4]), {'수출기업 97.3 95.7', '내수기업 99.4 99.1'}, '주장 숫자 행이 머리글 바로 아래')
        self.assertEqual(table['material_id'], 'a')
        self.assertEqual(table['retrieval_engine'], 'qwen3-embedding-0.6b-kc8-table-ctx')
        view = table['table']  # 화면이 표로 그릴 구조: 머리 줄이 값 칸 수+1(구분 8월 9월)이라 열 제목이 된다
        self.assertEqual(view['caption'], ['< 기업심리지수 >'])
        self.assertEqual(view['header'], ['구분', '8월', '9월'])
        self.assertEqual([r['label'] for r in view['rows']][:2], [l.split()[0] for l in lines[2:4]])
        self.assertEqual(view['rows'][0]['cells'], lines[2].split()[1:])
        self.assertTrue(all(r.get('table') is None for r in rows if not r['text'].startswith('< 기업심리지수 >')))
        again = retrieval.rank_chunks(claim, chunks, limit=10, cache=cache, exclude=[table['text']])
        self.assertNotIn(table['text'], [r['text'] for r in again], '재검색은 이미 보낸 후보를 빼고')

    def pdf_table_chunks(self):
        """한국은행 외환보유액 표(2줄 머리글 — 열 제목에 띄어쓰기)를 pdf_layout 이 읽은 모양으로 청킹한다."""
        from core.ai.factcheck.pdf_chunker import pdf_units
        rows = [['', '2022년말', '2023년말', '2024년말', '2025년말', '2026.8월말', '2026.9월말', '전월대비증감'],
                ['', '', '', '', '', '(a)', '(b)', '(b-a)1)'],
                ['외환보유액', '4,231.6', '4,201.5', '4,156.0', '4,280.5', '4,422.8', '4,405.6', '-17.2'],
                ['유가증권2)', '3,696.9', '3,736.7', '3,666.7', '3,711.2', '3,870.7', '3,860.3', '-10.4'],
                ['금', '47.9', '47.9', '47.9', '47.9', '47.9', '47.9', '0.0']]
        pages = [{'page': 1, 'blocks': [{'type': 'caption', 'text': '2026년 9월말 외환보유액'},
                                        {'type': 'unit', 'text': '(억달러, %)'}, {'type': 'table', 'rows': rows}]}]
        return pdf_units(pages)

    def test_pdf_table_header_cells_survive_spaces_in_column_titles(self):
        (chunk,) = self.pdf_table_chunks()
        head_line = '2022년말 2023년말 2024년말 2025년말 2026.8월말 (a) 2026.9월말 (b) 전월대비증감 (b-a)1)'
        self.assertEqual(chunk['text'].split('\n')[:2], ['2026년 9월말 외환보유액 (억달러, %)', head_line])  # 글은 예전과 같다
        self.assertEqual(chunk['table_header']['line'], head_line)
        self.assertEqual(chunk['table_header']['cells'],
                         ['', '2022년말', '2023년말', '2024년말', '2025년말', '2026.8월말 (a)', '2026.9월말 (b)', '전월대비증감 (b-a)1)'])
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'kc-band-table-ctx'}):
            (found,) = [r for r in retrieval.rank_chunks('외환보유액은 4,405.6억달러였다.', [chunk], limit=3, cache=FakeCache())
                        if r.get('table')]
        view = found['table']
        self.assertEqual(view['header'], chunk['table_header']['cells'])  # 예전: 토큰 10개 ≠ 값 칸 7개 → None
        self.assertEqual(view['caption'], ['2026년 9월말 외환보유액 (억달러, %)'])  # 머리글 줄이 회색 글로 남지 않는다
        self.assertEqual(len(view['rows'][0]['cells']), 7)
        self.assertNotIn('table_header', found)  # 내부 값은 검색 결과로 내보내지 않는다

    def test_table_view_uses_header_cells_or_falls_back(self):
        header = {'line': '2022 2023 증감', 'cells': ['구분', '2022', '2023', '증감'], 'note': ''}
        rows = ['2022 2023 증감', '전체 1,234 1,300 66', '남자 600 650 50']  # 연도 머리글이 숫자처럼 보여 행으로 잡힌 경우
        view = evidence_rank.table_view('< 인구 >', rows, header)
        self.assertEqual(view['header'], ['구분', '2022', '2023', '증감'])
        self.assertEqual([r['label'] for r in view['rows']], ['전체', '남자'])  # 머리글 줄은 화면 행에서만 뺀다
        noted = evidence_rank.table_view('< 인구 >\n단위: 명 / 2022 2023 증감', rows[1:],
                                         dict(header, line='단위: 명 / 2022 2023 증감', note='단위: 명'))
        self.assertEqual(noted['caption'], ['< 인구 >', '단위: 명'])  # head_text 는 caption 에 남긴다
        wrong = evidence_rank.table_view('< 인구 >\n구분 8월 9월', rows[1:], dict(header, cells=['구분', '8월']))
        self.assertEqual(wrong, evidence_rank.table_view('< 인구 >\n구분 8월 9월', rows[1:]))  # 칸 수가 안 맞으면 예전 방식

    def test_shared_index_key_includes_table_header(self):
        (chunk,) = self.pdf_table_chunks()
        bare = {k: v for k, v in chunk.items() if k != 'table_header'}
        self.assertNotEqual(retrieval._content_key([chunk]), retrieval._content_key([bare]))

    def test_unit_index_built_once_per_chunk_index(self):
        chunks, cache = [dict(c, kind='narrative') for c in make_chunks()], FakeCache()
        built = []
        real = evidence_rank.UnitIndex
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'kc-band-table-ctx'}), \
                mock.patch.object(evidence_rank, 'UnitIndex', lambda c, v: built.append(1) or real(c, v)):
            index = retrieval.ChunkIndex(chunks, cache)
            for q in ('예산 7억원', '인구', '교통'):
                retrieval.rank_chunks(q, chunks, limit=5, cache=cache, index=index)
        self.assertEqual(len(built), 1)


if __name__ == '__main__':
    unittest.main()
