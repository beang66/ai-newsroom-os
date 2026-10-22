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
        self.assertEqual(chunk['text'].split('\n')[:2], ['2026년 9월말 외환보유액 (억달러, %)', head_line])
        meta = chunk['table_meta']
        self.assertEqual(meta['line'], head_line)
        self.assertEqual(meta['cells'],
                         ['', '2022년말', '2023년말', '2024년말', '2025년말', '2026.8월말 (a)', '2026.9월말 (b)', '전월대비증감 (b-a)1)'])
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'kc-band-table-ctx'}):
            (found,) = [r for r in retrieval.rank_chunks('외환보유액은 4,405.6억달러였다.', [chunk], limit=3, cache=FakeCache())
                        if r.get('table')]
        view = found['table']
        self.assertEqual(view['header'], meta['cells'])  # 예전: 토큰 10개 ≠ 값 칸 7개 → None
        self.assertEqual(view['caption'], ['2026년 9월말 외환보유액 (억달러, %)'])  # 머리글 줄이 회색 글로 남지 않는다
        self.assertEqual(view['rows'][0]['cells'], ['4,231.6', '4,201.5', '4,156.0', '4,280.5', '4,422.8', '4,405.6', '-17.2'])
        self.assertNotIn('table_meta', found)  # 내부 값은 검색 결과로 내보내지 않는다

    def employment_chunks(self):
        """국가데이터처 2026년 8월 고용동향 15쪽 '연령계층별 취업자 및 고용률' 표(pdf_layout 이 읽은 그대로, 일부 행)."""
        from core.ai.factcheck.pdf_chunker import pdf_units
        rows = [['', '', '2025. 8', '', '', '2026. 8', '', '', '증감', ''],
                ['', '인구', '취업자', '고용률', '인구', '취업자', '고용률', '인구', '취업자', '고용률'],
                ['< 전 체 >', '45,779', '28,967', '63.3', '46,036', '29,151', '63.3', '257', '184', '0.0'],
                ['15～29세', '7,920', '3,571', '45.1', '7,776', '3,428', '44.1', '-144', '-143', '-1.0'],
                ['․20～29세', '5,679', '3,434', '60.5', '5,484', '3,270', '59.6', '-195', '-164', '-0.9'],
                ['‥25～29세', '3,365', '2,412', '71.7', '3,279', '2,336', '71.2', '-86', '-76', '-0.5'],
                ['< 남 자 >', '22,580', '16,023', '71.0', '22,734', '16,130', '71.0', '154', '107', '0.0'],
                ['20～29세', '2,828', '1,640', '58.0', '2,737', '1,554', '56.8', '-91', '-87', '-1.2'],
                ['< 여 자 >', '23,199', '12,944', '55.8', '23,302', '13,021', '55.9', '103', '77', '0.1'],
                ['20～29세', '2,851', '1,794', '62.9', '2,747', '1,717', '62.5', '-104', '-77', '-0.4']]
        pages = [{'page': 15, 'blocks': [{'type': 'caption', 'text': '< 연령계층별 취업자 및 고용률 >'},
                                         {'type': 'unit', 'text': '(단위: 천명, %, %p, 전년동월대비)'}, {'type': 'table', 'rows': rows}]}]
        return [c for c in pdf_units(pages) if c['kind'] == 'table']

    def test_numeric_looking_multirow_header_is_spread_over_its_columns(self):
        (chunk,) = self.employment_chunks()
        meta = chunk['table_meta']
        # 예전: '2025. 8 … 증감' 줄이 숫자처럼 보여 데이터 행으로 잡혀 머리글이 없었다
        self.assertEqual(meta['cells'][1:4], ['2025. 8 인구', '2025. 8 취업자', '2025. 8 고용률'])
        self.assertEqual(meta['cells'][7:], ['증감 인구', '증감 취업자', '증감 고용률'])
        self.assertEqual([(c['text'], c['span']) for c in meta['rows'][0]], [('', 1), ('2025. 8', 3), ('2026. 8', 3), ('증감', 3)])
        self.assertEqual(chunk['text'].split('\n')[1], meta['line'])  # 글의 머리글 줄도 칸마다 펼친 열 제목
        paths = {b['line'].split()[1]: b['path'] for b in meta['body']}
        self.assertEqual(paths['5,679'], ['전체', '15～29세'])  # '․' 들여쓰기 = 바로 위 얕은 행의 하위
        self.assertEqual(paths['3,365'], ['전체', '15～29세', '20～29세'])
        self.assertEqual(paths['2,828'], ['남자'])  # '< 남 자 >' 소제목
        self.assertEqual(paths['2,851'], ['여자'])

    def test_summary_table_marks_and_unlabelled_level_columns(self):
        """고용동향 10쪽 요약표: 'w'(기호 글꼴의 ◆ 글머리표)·◦·▣ 기호 단계, 제목 없는 인원 열(2025. 8 아래 증감·증감률만 있음)."""
        from core.ai.factcheck.pdf_chunker import pdf_units
        rows = [['', '', '2025. 8', '', '', '2026. 8', ''], ['', '', '증 감', '증감률', '', '증 감', '증감률'],
                ['◉ 15세이상인구', '45,779', '203', '0.4', '46,036', '257', '0.6'],
                ['▣ 경제활동인구', '29,559', '194', '0.7', '29,739', '180', '0.6'],
                ['w 남 자', '16,365', '44', '0.3', '16,464', '99', '0.6'],
                ['◦ 취 업 자', '28,967', '166', '0.6', '29,151', '184', '0.6'],
                ['w 광공업', '4,372', '-59', '-1.3', '4,336', '-37', '-0.8'],
                ['․제조업', '4,364', '-61', '-1.4', '4,325', '-38', '-0.9'],
                ['w 건설업', '1,910', '-132', '-6.5', '1,878', '-32', '-1.7'],
                ['◦ 실 업 자', '592', '28', '4.9', '588', '-4', '-0.6'],
                ['실 업 률', '2.0', '0.1', '', '2.0', '0.0', '']]
        (c,) = [x for x in pdf_units([{'page': 10, 'blocks': [{'type': 'table', 'rows': rows}]}]) if x['kind'] == 'table']
        meta = c['table_meta']
        self.assertEqual(meta['cells'][1:4], ['2025. 8', '2025. 8 증감', '2025. 8 증감률'])
        self.assertEqual([(x['text'], x['span']) for x in meta['rows'][0]], [('', 1), ('2025. 8', 3), ('2026. 8', 3)])
        paths = {b['label']: b['path'] for b in meta['body']}
        self.assertEqual(paths['남자'], ['15세이상인구', '경제활동인구'])
        self.assertEqual(paths['건설업'], ['15세이상인구', '경제활동인구', '취업자'])  # w 가 ◦ 보다 먼저 나와도 ◦ 아래
        self.assertEqual(paths['제조업'], ['15세이상인구', '경제활동인구', '취업자', '광공업'])
        self.assertEqual(paths['실업률'], ['15세이상인구', '경제활동인구', '실업자'])  # 기호 없는 행은 바로 위 기호 행의 하위

    def test_same_named_rows_carry_their_section_to_screen_and_judge(self):
        chunks = self.employment_chunks() + [dict(c, kind='narrative') for c in make_chunks(20)]
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'kc-band-table-ctx'}):
            rows = retrieval.rank_chunks('20～29세 남자 취업자는 155만4천명, 여자는 171만7천명이었다.', chunks, limit=10, cache=FakeCache())
        table = next(r for r in rows if r.get('table'))
        view = table['table']
        self.assertEqual(len(view['header_rows']), 2)
        labelled = {(tuple(r['path']), r['label']) for r in view['rows']}
        self.assertIn((('남자',), '20～29세'), labelled)
        self.assertIn((('여자',), '20～29세'), labelled)
        self.assertIn('남자 › 20～29세 2,828', table['text'])  # 판정기에도 어느 소제목의 행인지 보인다
        self.assertIn('2025. 8 취업자', table['text'])

    def test_table_view_without_structure_guesses_as_before(self):
        rows = ['전체 1,234 1,300', '남자 600 650']
        view = evidence_rank.table_view('< 인구 >\n구분 8월 9월', rows)
        self.assertEqual(view['header'], ['구분', '8월', '9월'])
        self.assertNotIn('header_rows', view)
        meta = {'line': '구분 8월 9월', 'cells': ['구분', '8월', '9월'], 'rows': [], 'note': ''}
        partial = evidence_rank.table_view('< 인구 >\n구분 8월 9월', rows, meta, {rows[0]: {'label': '전체', 'cells': ['1,234', '1,300'], 'path': []}})
        self.assertEqual(partial, view)  # 행 구조가 하나라도 없으면 추측(섞지 않는다)

    def test_shared_index_key_includes_table_meta(self):
        (chunk,) = self.pdf_table_chunks()
        bare = {k: v for k, v in chunk.items() if k != 'table_meta'}
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
