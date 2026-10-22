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

    def test_table_view_column_head_from_chunk(self):
        # PDF 표: 연도 줄은 숫자뿐이라 '행'으로 분류된다 → 열 머리로 따로 두고, 이어진 조각(제목만 반복)도 같은 머리를 쓴다
        first = '성장기여도 (%p)\n2025p 2026p\n1/4 2/4 1/4 2/4\n광공업 1.7 1.5 1.9 1.9'
        units = evidence_rank.units_of([{'text': first, 'kind': 'table'}, {'text': '성장기여도 (%p)\n내수 0.6 1.3 2.1 2.2', 'kind': 'table'}])
        self.assertEqual(units[0]['text'], '성장기여도 (%p)\n2025p 2026p', '검색 글은 그대로')
        self.assertEqual(units[-1]['head'], ('2025p 2026p', '1/4 2/4 1/4 2/4'))
        view = evidence_rank.table_view(units[-1]['ctx'], ['2025p 2026p', '내수 0.6 1.3 2.1 2.2'], units[-1]['head'])
        self.assertEqual(view['header'], ['1/4', '2/4', '1/4', '2/4'])
        self.assertEqual(view['caption'], ['성장기여도 (%p)', '2025p 2026p'])
        self.assertEqual([r['label'] for r in view['rows']], ['내수'])

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
