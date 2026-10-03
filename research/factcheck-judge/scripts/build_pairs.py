"""2단계: seed + (Claude 가 쓴) 바꿔 쓴 문장 → (주장, 근거 청크 1개, 라벨) 학습쌍. 표준 라이브러리만 쓴다.

앱은 주장 하나를 검색 상위 청크와 **하나씩** 판정한 뒤 합친다(service._judge_qwen_candidates).
그래서 학습쌍도 청크 1개 단위다.

    주장 = 원문장 그대로 | 바꿔 쓴 문장(data/paraphrases/*.tsv: sid<TAB>문장)
    (주장, 정답 청크)         → SUPPORTED_LOCAL
    (숫자·날짜를 바꾼 주장, 정답 청크) → CONFLICT_LOCAL
    (주장, 검색 상위 오답 청크)  → GAP_LOCAL      (주장의 숫자가 그 청크에도 다 있으면 모호해서 버린다)
    REVIEW_LOCAL / REVIEW_EXTERNAL → data/legacy_review.jsonl (옛 v14 세트에서 뽑은 것)

    python research/factcheck-judge/scripts/build_pairs.py            # data/train.jsonl, data/dev.jsonl
    python research/factcheck-judge/scripts/build_pairs.py --sealed   # data/sealed/test.jsonl 도
"""
import argparse
import json
import random
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DATA = HERE / 'data'
NUMTOK = re.compile(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\d.,])\d+(?:\.\d+)?')
WEEK = '월화수목금토일'


def numbers(text):
    return {m.group().replace(',', '') for m in NUMTOK.finditer(text)}


def _bump(value, rng):
    """숫자 문자열을 그럴듯하게 다른 값으로(자릿수·쉼표 형식 유지)."""
    plain = value.replace(',', '')
    if '.' in plain:  # 소수: 마지막 자리를 바꾼다 (95.9 → 95.4)
        last = int(plain[-1])
        return plain[:-1] + str((last + rng.choice([3, 4, 5, 6, 7])) % 10)
    n = int(plain)
    if n < 10:
        new = n + rng.choice([1, 2, 3])
    elif 1900 <= n <= 2100:  # 연도
        new = n + rng.choice([-1, 1])
    else:
        new = rng.choice([n + max(1, n // 10), max(1, n - max(1, n // 10)), n * 2, n + 1])
    return f'{new:,}' if ',' in value else str(new)


def perturb(claim, evidence, rng):
    """주장 속 값 하나를 근거와 어긋나게 바꾼다. 바꿀 값이 없으면 None."""
    spots = [m for m in NUMTOK.finditer(claim)
             if m.group().replace(',', '') in numbers(evidence)
             and not re.match(r'\s*[.)]\s', claim[m.end():m.end() + 2])  # 목록 번호(1. 2))는 사실이 아니다
             and not (m.start() == 0 and claim[m.end():m.end() + 1] in '.)')]
    weekday = [m for m in re.finditer(f'\\(([{WEEK}])\\)', claim) if m.group() in evidence]
    if not spots and not weekday:
        return None
    if weekday and (not spots or rng.random() < 0.15):
        m = rng.choice(weekday)
        new = rng.choice([d for d in WEEK if d != m.group(1)])
        return claim[:m.start(1)] + new + claim[m.end(1):], 'weekday'
    for _ in range(5):
        m = rng.choice(spots)
        new = _bump(m.group(), rng)
        if new.replace(',', '') not in numbers(evidence):
            return claim[:m.start()] + new + claim[m.end():], 'number'
    return None


# 기관·조직 이름(접미사로 종류를 맞춘다) — 같은 종류의 다른 이름으로 바꾸면 '주체가 다른' 충돌이 된다
SUFFIX = '회계법인|법무법인|증권|은행|자산운용|초등학교|중학교|고등학교|유치원|교육지원청|대학교'
# 앞에 글자가 붙어 있지 않은 이름만(‘지원금오초등학교’ 같은 오인식 방지)
ENTITY = re.compile(f'(?<![가-힣A-Za-z0-9])[가-힣A-Za-z0-9]{{2,12}}(?:{SUFFIX})')


def _unit(claim, m):
    """숫자 바로 뒤 단위 한 글자(%, 원, 명, 월 …) — 없으면 ''."""
    rest = claim[m.end():].lstrip()
    return rest[0] if rest and (rest[0] in '%㎡㎞' or '가' <= rest[0] <= '힣') else ''


def swap_values(claim, evidence):
    """주장 속 같은 단위의 서로 다른 두 값(둘 다 근거에 있음)을 맞바꾼다 — 표면 2.0%/만기 5.0% 같은 관계 충돌."""
    spots = [m for m in NUMTOK.finditer(claim) if m.group().replace(',', '') in numbers(evidence)
             and not (m.start() == 0 and claim[m.end():m.end() + 1] in '.)')]
    for i, a in enumerate(spots):
        for b in spots[i + 1:]:
            if (a.group().replace(',', '') != b.group().replace(',', '') and claim[a.end():b.start()].strip()
                    and _unit(claim, a) and _unit(claim, a) == _unit(claim, b)):
                return claim[:a.start()] + b.group() + claim[a.end():b.start()] + a.group() + claim[b.end():], 'swap'
    return None


def swap_entity(claim, evidence, pool, rng):
    """주장 속 기관명을 같은 문서의 같은 종류 다른 기관명으로(근거에는 없는 것)."""
    for m in ENTITY.finditer(claim):
        if m.group() not in evidence:
            continue
        kind = re.search(f'(?:{SUFFIX})$', m.group()).group()
        others = sorted({e for e in pool if e.endswith(kind) and e != m.group() and e not in evidence})
        if others:
            return claim[:m.start()] + rng.choice(others) + claim[m.end():], 'entity'
    return None


def conflicts(claim, seed, rng, pool):
    """주장 하나에서 만들 수 있는 충돌 문장들(종류마다 하나)."""
    found = [perturb(claim, seed['pos'], rng), swap_values(claim, seed['pos']), swap_entity(claim, seed['pos'], pool, rng)]
    return [f for f in found if f]


def pairs_for(seed, claims, rng, max_negs, written=()):
    out = []
    pool = {m.group() for text in seed['negs'] for m in ENTITY.finditer(text)}
    base0 = {'sid': seed['sid'], 'doc_id': seed['doc_id'], 'split': seed['split']}
    for text in written:  # Claude 가 쓴 의미 충돌(범주·범위·부정·주체 등) — 정답 청크와 짝
        out.append({**base0, 'claim_kind': 'written', 'claim': text, 'evidence': seed['pos'], 'label': 'CONFLICT_LOCAL',
                    'origin': 'written/conflict'})
        if seed['negs']:  # 같은 문장이라도 관련 없는 청크와 짝이면 '근거 없음' — 충돌처럼 보이면 무조건 충돌로 찍는 버릇 방지
            out.append({**base0, 'claim_kind': 'written', 'claim': text, 'evidence': seed['negs'][0], 'label': 'GAP_LOCAL',
                        'origin': 'written/neg'})
    for claim, kind in claims:
        base = {**base0, 'claim_kind': kind}
        out.append({**base, 'claim': claim, 'evidence': seed['pos'], 'label': 'SUPPORTED_LOCAL', 'origin': f'{kind}/pos'})
        made = conflicts(claim, seed, rng, pool)
        rng.shuffle(made)
        for text, how in made[:2]:
            out.append({**base, 'claim': text, 'evidence': seed['pos'], 'label': 'CONFLICT_LOCAL', 'origin': f'{kind}/{how}'})
        bad = made[0] if made else None
        nums = numbers(claim)
        for neg in seed['negs'][:max_negs]:
            if nums and nums <= numbers(neg):
                continue  # 같은 사실이 다른 청크에도 있을 수 있다 — 모호하면 버린다
            out.append({**base, 'claim': claim, 'evidence': neg, 'label': 'GAP_LOCAL', 'origin': f'{kind}/neg'})
            if bad and rng.random() < 0.5:
                out.append({**base, 'claim': bad[0], 'evidence': neg, 'label': 'GAP_LOCAL', 'origin': f'{kind}-{bad[1]}/neg'})
    return out


def load(path):
    return [json.loads(line) for line in open(path, encoding='utf-8') if line.strip()] if path.exists() else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sealed', action='store_true', help='봉인 test 쌍도 만든다(로컬 전용)')
    ap.add_argument('--max-negs', type=int, default=2)
    ap.add_argument('--gap-ratio', type=float, default=1.2, help='GAP 수 ≤ SUPPORTED 수 × 이 값')
    ap.add_argument('--number-ratio', type=float, default=0.5, help='숫자만 바꾼 충돌 ≤ SUPPORTED 수 × 이 값')
    ap.add_argument('--review-ratio', type=float, default=0.25, help='REVIEW 두 클래스 합 ≤ SUPPORTED 수 × 이 값')
    args = ap.parse_args()
    rng = random.Random(20261003)

    seeds = load(DATA / 'seeds.jsonl') + (load(DATA / 'sealed' / 'seeds_test.jsonl') if args.sealed else [])
    para = {}
    tsvs = sorted((DATA / 'paraphrases').glob('*.tsv')) + (sorted((DATA / 'sealed').glob('paraphrases*.tsv')) if args.sealed else [])
    known = {s['sid'] for s in seeds}
    for path in tsvs:
        for line in open(path, encoding='utf-8'):
            sid, _, text = line.rstrip('\n').partition('\t')
            if sid in known and text.strip() and text.strip() not in para.get(sid, []):
                para.setdefault(sid, []).append(text.strip())
    print('paraphrased seeds', len(para), 'of', len(seeds))
    written = {}  # data/conflicts/*.tsv: sid<TAB>근거 청크와 어긋나는 문장(Claude 작성)
    for path in sorted((DATA / 'conflicts').glob('*.tsv')) + (sorted((DATA / 'sealed').glob('conflicts*.tsv')) if args.sealed else []):
        for line in open(path, encoding='utf-8'):
            sid, _, text = line.rstrip('\n').partition('\t')
            if sid in known and text.strip():
                written.setdefault(sid, []).append(text.strip())
    print('written conflicts', sum(map(len, written.values())))
    legacy = load(DATA / 'legacy_review.jsonl')

    by_split = {}
    for seed in seeds:
        # 바꿔 쓴 문장도 없고 바꿀 값도 없으면(제목·빈 항목 등) 사실 문장이 아니라고 보고 뺀다
        if seed['sid'] not in para and seed['sid'] not in written and not conflicts(seed['sentence'], seed, random.Random(0), set()):
            continue
        claims = [(seed['sentence'], 'verbatim')] + [(p, 'paraphrase') for p in para.get(seed['sid'], [])]
        by_split.setdefault(seed['split'], []).extend(pairs_for(seed, claims, rng, args.max_negs, written.get(seed['sid'], [])))

    for split, rows in by_split.items():
        sup = sum(r['label'] == 'SUPPORTED_LOCAL' for r in rows)
        def cap(match, ratio):  # 조건에 맞는 행을 SUPPORTED 수 × ratio 개까지만 남긴다
            hit = [r for r in rows if match(r)]
            rng.shuffle(hit)
            return [r for r in rows if not match(r)] + hit[:int(sup * ratio)]
        rows = cap(lambda r: r['label'] == 'GAP_LOCAL', args.gap_ratio)
        # 숫자만 바꾼 충돌이 의미 충돌보다 압도적으로 많으면 '숫자가 다르면 충돌'만 배운다(v1 실패 원인)
        rows = cap(lambda r: r['label'] == 'CONFLICT_LOCAL' and r['origin'].endswith('/number'), args.number_ratio)
        if split != 'test':
            pool = [r for r in legacy if r['split'] == split]
            rng.shuffle(pool)
            rows += pool[:int(sup * args.review_ratio)]
        rng.shuffle(rows)
        path = DATA / 'sealed' / 'test.jsonl' if split == 'test' else DATA / f'{split}.jsonl'
        with open(path, 'w', encoding='utf-8') as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(split, len(rows), dict(Counter(r['label'] for r in rows)), dict(Counter(r.get('claim_kind', 'legacy') for r in rows)))


if __name__ == '__main__':
    main()
