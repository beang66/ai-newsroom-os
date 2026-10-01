"""Seven-category regression examples plus abstention cases. No model calls."""
import unittest
from app import critique


def inspect(body,title='',sources=(),glossary=None):
    candidates=[]
    for i,text in enumerate(sources):
        candidates.append({'document_id':f'd{i}','document_version':f'd{i}','block_id':f'd{i}:0','title':f'source{i}',
            'locator':{'kind':'line','line':1},'excerpt':text,'start':0,'end':len(text),'retrieval_score':1,
            'assessment':{'state':'unavailable','relation':'unassessed'}})
    # Full body is one span for unit-check isolation; integration covers actual sentence splitting.
    claims=[{'text':body,'start':0,'end':len(body),'candidates':candidates}]
    return critique.run(body,title,claims,glossary,len(sources))


def codes(result):return {f['rule_id'] for f in result['findings']}


class CritiqueTests(unittest.TestCase):
    def test_all_seven_check_families_have_explicit_scope(self):
        result=inspect('자료를 정리했다.')
        self.assertEqual(len(result['checks']),7)
        self.assertFalse(result['publication_blocked'])
        self.assertTrue(all(c['status']=='limited_rules' for c in result['checks']))
        self.assertEqual(result['summary']['priority'],0)

    def test_title_certainty_and_unrelated_paragraph_abstention(self):
        self.assertIn('facts.title_certainty',codes(inspect('새빛시 버스 요금 인하를 검토 중이다.','새빛시 버스 요금 인하 확정')))
        self.assertNotIn('facts.title_certainty',codes(inspect('공원 조성을 검토 중이다.','새빛시 버스 요금 인하 확정')))

    def test_source_certainty_and_negation(self):
        self.assertIn('facts.source_certainty',codes(inspect('새빛시 버스 요금 인하가 확정됐다.',sources=['새빛시 버스 요금 인하를 검토 중이다.'])))
        self.assertIn('facts.negation',codes(inspect('새빛시 버스 요금 인하를 실시했다.',sources=['새빛시 버스 요금 인하를 실시하지 않았다.'])))

    def test_source_dates(self):
        result=inspect('새빛시 버스 행사는 2026년 8월 1일 열린다.',sources=['새빛시 버스 행사는 2026년 8월 2일 열린다.'])
        self.assertIn('facts.date',codes(result))

    def test_numeric_source_mismatch_and_unit_equivalence(self):
        self.assertIn('numbers.source_difference',codes(inspect('새빛시 버스 이용자는 120만 명이다.',sources=['새빛시 버스 이용자는 130만 명이다.'])))
        self.assertNotIn('numbers.source_difference',codes(inspect('새빛시 버스 예산은 1억원이다.',sources=['새빛시 버스 예산은 10000만원이다.'])))

    def test_different_years_do_not_become_numeric_mismatch(self):
        result=inspect('새빛시 버스 이용자는 2026년 120만 명이다.',sources=['새빛시 버스 이용자는 2025년 100만 명이다.'])
        self.assertNotIn('numbers.source_difference',codes(result))

    def test_growth_calculation_and_correct_case(self):
        self.assertIn('numbers.change_rate',codes(inspect('100명에서 120명으로 30% 증가했다.')))
        self.assertNotIn('numbers.change_rate',codes(inspect('100명에서 120명으로 20% 증가했다.')))
        self.assertIn('numbers.change_rate',codes(inspect('100명에서 120명으로 20% 감소했다.')))

    def test_percentage_points_and_zero_denominator(self):
        self.assertNotIn('numbers.change_rate',codes(inspect('10%에서 12%로 2%p 상승했다.')))
        self.assertIn('numbers.change_rate',codes(inspect('10%에서 12%로 2% 상승했다.')))
        self.assertIn('numbers.zero_base',codes(inspect('0명에서 10명으로 100% 증가했다.')))

    def test_total(self):
        self.assertIn('numbers.total',codes(inspect('남성 30명과 여성 20명으로 총 60명이다.')))
        self.assertNotIn('numbers.total',codes(inspect('남성 30명과 여성 20명으로 총 50명이다.')))

    def test_quote_difference_and_exact_quote(self):
        source='김가람 대표는 “사업을 추진하지 않겠습니다”라고 말했다.'
        self.assertIn('quotes.text_difference',codes(inspect('김가람 대표는 “사업을 추진하겠습니다”라고 말했다.',sources=[source])))
        self.assertNotIn('quotes.text_difference',codes(inspect(source,sources=[source])))

    def test_quotes_without_sources_are_scope_gap_not_error(self):
        result=inspect('그는 “사업을 추진하겠습니다”라고 말했다.')
        self.assertFalse(any(c.startswith('quotes.') for c in codes(result)))
        self.assertEqual(next(c for c in result['checks'] if c['category']=='quotes')['source_comparison'],'not_requested')

    def test_causal_overstatement_requires_explicit_counter_context(self):
        self.assertIn('logic.cause',codes(inspect('새빛시 버스 이용자 증가가 요금 인하 때문에 발생했다.',sources=['새빛시 버스 이용자 증가의 원인은 분석하지 않았다.'])))
        self.assertNotIn('logic.cause',codes(inspect('새빛시 버스 이용자 증가가 요금 인하 때문에 발생했다.')))

    def test_generalization(self):
        self.assertIn('logic.generalization',codes(inspect('새빛시 버스 정책을 전체 시민이 지지한다.',sources=['일부 설문 응답자가 새빛시 버스 정책을 지지한다.'])))

    def test_spelling_and_exact_offsets(self):
        body='😀 몇일 뒤에 할수있다. 해야 되요. 결과는 됬다.'
        result=inspect(body)
        self.assertTrue({'spell.days','spell.su','spell.dwaeyo','spell.dwaet'}<=codes(result))
        for f in result['findings']:
            a=f['anchor'];self.assertEqual(body[a['start']:a['end']],a['text'])

    def test_quote_spelling_and_protected_name_have_no_auto_replace(self):
        quoted=inspect('그는 “몇일 뒤에 하겠다”라고 말했다.')
        miss=next(f for f in quoted['findings'] if f['rule_id']=='spell.days')
        self.assertIsNone(miss['replacement'])
        protected=inspect('몇일브랜드를 출시했다.',glossary=[{'canonical':'몇일브랜드','variants':[]}])
        self.assertNotIn('spell.days',codes(protected))

    def test_correct_spelling_no_spurious_flags(self):
        self.assertEqual(critique.proofreading('며칠 뒤에 할 수 있다. 해야 돼요. 왠지 어이없다.'),[])

    def test_personal_data_patterns(self):
        result=inspect('연락처는 010-0000-0000이며 문의는 sample@example.com으로 한다. 식별번호 형태: 000000-1000000.')
        self.assertTrue({'legal.phone','legal.email','legal.id_pattern'}<=codes(result))
        self.assertFalse(any(f['blocking'] for f in result['findings']))

    def test_allegation_and_denial(self):
        self.assertIn('legal.allegation',codes(inspect('피의자는 범인이다.')))
        self.assertNotIn('legal.allegation',codes(inspect('피의자는 범인이 아니라고 부인했다.')))
        self.assertNotIn('legal.allegation',codes(inspect('유죄 확정 판결을 받은 피의자는 범행을 저질렀다.')))

    def test_response_question_not_claim_of_no_reporting(self):
        result=inspect('해당 기업의 비리 의혹이 제기됐다.')
        item=next(f for f in result['findings'] if f['rule_id']=='legal.response_question')
        self.assertEqual(item['group'],'additional');self.assertIn('취재 여부를 묻는',item['action'])
        self.assertNotIn('legal.response_question',codes(inspect('비리 의혹에 대해 기업은 답변하지 않았다.')))

    def test_name_glossary_and_role_comparison(self):
        result=inspect('김가람 대표는 국립국어언에 방문했다.',sources=['김가람 교수는 연구에 참여했다.'],glossary=[{'canonical':'국립국어원','variants':['국립국어언']}])
        self.assertIn('names.glossary',codes(result));self.assertIn('names.role',codes(result))
        self.assertTrue(all(f['replacement'] is None for f in result['findings'] if 'names' in f['categories']))

    def test_same_name_multiple_roles_and_no_guessing_similar_names(self):
        self.assertIn('names.internal_role',codes(inspect('김가람 대표가 말했다. 김가람 교수도 말했다.')))
        self.assertNotIn('names.role',codes(inspect('김가람 대표가 말했다.',sources=['김나람 교수가 말했다.'])))

    def test_source_subslice_is_exact(self):
        source='다른 문장이다. 새빛시 버스 이용자는 130만 명이다.'
        result=inspect('새빛시 버스 이용자는 120만 명이다.',sources=[source])
        for item in result['findings']:
            for evidence in item['evidence']:
                self.assertEqual(source[evidence['start']:evidence['end']],evidence['excerpt'])

    def test_matching_quote_with_different_speaker(self):
        self.assertIn('quotes.speaker_difference',codes(inspect('김가람 대표는 “사업을 추진하겠습니다”라고 말했다.',sources=['이나래 대표는 “사업을 추진하겠습니다”라고 말했다.'])))

    def test_negated_title_is_not_a_certainty_warning(self):
        self.assertNotIn('facts.title_certainty',codes(inspect('새빛시 버스 요금 인하를 검토 중이다.','새빛시 버스 요금 인하 확정 아니다')))

    def test_internal_quantity_comparison(self):
        from app.review import sentence_spans
        body='새빛시 버스 이용자는 120만 명이다. 새빛시 버스 이용자는 130만 명이다.'
        claims=[{**span,'candidates':[]} for span in sentence_spans(body)]
        result=critique.run(body,'',claims)
        self.assertIn('facts.internal_quantity',codes(result))

    def test_glossary_validation(self):
        for glossary in [None,'bad',[{'canonical':''}],[{'canonical':'x','variants':[123]}]]:
            if glossary is None:continue
            with self.assertRaises(ValueError):critique.validate_options('',glossary)


if __name__=='__main__':unittest.main()
