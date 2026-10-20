"""사용자 테스트(UT) 기록 JSONL 여러 개를 합쳐 참여자별·작업별 지표를 낸다 (개발 도구, 표준 라이브러리만 사용).

입력은 앱의 환경 설정 > 사용자 테스트 기록 > 내보내기로 만든 `AI-Newsroom-UT기록_*.jsonl` 파일이나 그 폴더다.
같은 기록을 여러 번 내보내도 event_id 로 한 번만 센다. schema_version 1(저장·다시 열기·내보내기)과
2(작업 성공/실패·플랫폼별 변환·화면 이동·화면에서 막힌 시도)를 모두 읽는다.

    py -3 dev/tools/ut_metrics.py                                   (기본: 문서\\AI Newsroom\\내보내기\\진단)
    py -3 dev/tools/ut_metrics.py 폴더1 파일2.jsonl --out report.md --csv out/

결과 지표
- 참여자별: 세션 수·활동 시간·기사 수·저장(수동/자동)·작업 시도/성공/실패/막힘·성공률
- 작업별: 시도·성공·부분 성공·실패·화면에서 막힘·성공률·실패 뒤 회복률·처리 시간(p50/p90)·주요 오류 코드
- 화면별: 방문·체류 시간, 자주 쓴 화면 이동 경로 (v2)
- 변환 흐름: 변환 화면 진입 → 변환 시작 요청 → 시작 성공 → 플랫폼 결과 성공 (v2)
"""
import argparse
import collections
import csv
import datetime
import json
import os
import sys
from pathlib import Path

DEFAULT_DIR = Path(os.environ.get('USERPROFILE', '~')).expanduser() / 'Documents' / 'AI Newsroom' / '내보내기' / '진단'
# 화면에서 막힌 시도(ui_blocked.task)를 같은 일을 하는 코어 작업 이름에 붙인다 — 시도 수에 함께 센다
UI_TASK = {'platform_run': 'platform_run_start', 'factcheck': 'factcheck_run', 'export': 'output_export'}
OUTCOMES = ('ok', 'partial', 'failed', 'blocked')


def load(paths):
    """→ (중복 없는 이벤트 목록(시간순), 읽은 파일 수, 깨진 줄 수)."""
    files = []
    for path in paths:
        path = Path(path)
        files += sorted(path.glob('*.jsonl')) if path.is_dir() else [path]
    events, broken = {}, 0
    for file in files:
        for line in file.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
                event['_at'] = datetime.datetime.fromisoformat(event['occurred_at'])
                events.setdefault(event['event_id'], event)
            except (ValueError, KeyError, TypeError):
                broken += 1
    return sorted(events.values(), key=lambda e: e['_at']), len(files), broken


def session_key(event):
    """세션은 (참여자, 세션 ID)로 묶는다 — 옛 기록은 한 앱 실행에서 계정을 바꿔도 세션 ID가 같았다."""
    return event.get('participant_id'), event.get('session_id')


def attempts(events):
    """이벤트 → 작업 시도 한 줄씩 {participant, session, article, task, outcome, error, duration, at}."""
    rows = []
    for e in events:
        name, base = e['event_name'], {'participant': e.get('participant_id'), 'session': session_key(e),
                                       'article': e.get('article_id'), 'at': e['_at'], 'error': None,
                                       'duration': e.get('duration_ms')}
        if name == 'article_persisted':
            row = dict(base, task='article_save' if e.get('save_kind') == 'manual' else 'article_autosave', outcome='ok')
        elif name == 'article_save_failed':
            row = dict(base, task='article_save', outcome='failed', error=e.get('error_code'))
        elif name == 'article_reopened':
            row = dict(base, task='article_reopen', outcome='ok')
        elif name == 'output_export_completed':
            row = dict(base, task='output_export', outcome='ok')
        elif name == 'task_completed':
            row = dict(base, task=e.get('task'), outcome='ok')
        elif name == 'task_failed':
            row = dict(base, task=e.get('task'), outcome='failed', error=e.get('error_code'))
        elif name == 'platform_target_finished':
            outcome = {'succeeded': 'ok', 'jpg_failed': 'partial'}.get(e.get('status'), 'failed')
            row = dict(base, task='platform:' + str(e.get('platform')), outcome=outcome,
                       error=e.get('error_code') or ('JPG_FAILED' if outcome == 'partial' else None))
        elif name == 'ui_blocked':
            row = dict(base, task=UI_TASK.get(e.get('task'), e.get('task')), outcome='blocked', error=e.get('reason_code'))
        else:
            continue
        rows.append(row)
    return rows


def pct(values, q):
    values = sorted(v for v in values if isinstance(v, (int, float)))
    return values[min(len(values) - 1, int(q * len(values)))] if values else None


def rate(ok, total):
    return f'{ok / total:.0%}' if total else '-'


def minutes(seconds):
    return f'{seconds / 60:.1f}분'


def session_spans(events):
    spans = collections.defaultdict(list)
    for e in events:
        spans[session_key(e)].append(e['_at'])
    return {sid: (min(times), max(times)) for sid, times in spans.items()}


def participant_table(events, rows):
    spans = session_spans(events)
    by = collections.defaultdict(lambda: {'sessions': set(), 'articles': set(), 'events': 0})
    for e in events:
        p = by[e.get('participant_id')]
        p['sessions'].add(session_key(e))
        p['events'] += 1
        if e.get('article_id'):
            p['articles'].add(e['article_id'])
    table = []
    for pid, p in sorted(by.items(), key=lambda item: str(item[0])):
        mine = [r for r in rows if r['participant'] == pid]
        work = [r for r in mine if r['task'] != 'article_autosave']  # 자동 저장은 사용자가 한 일이 아니다
        count = collections.Counter(r['outcome'] for r in work)
        active = sum((spans[s][1] - spans[s][0]).total_seconds() for s in p['sessions'])
        table.append({
            'participant': pid, 'sessions': len(p['sessions']), 'active_min': round(active / 60, 1),
            'events': p['events'], 'articles': len(p['articles']),
            'manual_saves': sum(r['task'] == 'article_save' and r['outcome'] == 'ok' for r in mine),
            'auto_saves': sum(r['task'] == 'article_autosave' for r in mine),
            'reopens': sum(r['task'] == 'article_reopen' for r in mine),
            'attempts': len(work), **{o: count[o] for o in OUTCOMES},
            'success_rate': rate(count['ok'], len(work)),
        })
    return table


def task_table(rows):
    table = []
    for task in sorted({r['task'] for r in rows}, key=str):
        mine = [r for r in rows if r['task'] == task]
        count = collections.Counter(r['outcome'] for r in mine)
        # 회복: 같은 세션에서 실패·막힘 뒤에 같은 작업이 성공한 경우
        failed_sessions, recovered = set(), set()
        for r in mine:
            if r['outcome'] in ('failed', 'blocked'):
                failed_sessions.add(r['session'])
            elif r['outcome'] == 'ok' and r['session'] in failed_sessions:
                recovered.add(r['session'])
        durations = [r['duration'] for r in mine if r['outcome'] == 'ok']
        errors = collections.Counter(r['error'] for r in mine if r['error'])
        table.append({
            'task': task, 'participants': len({r['participant'] for r in mine}), 'attempts': len(mine),
            **{o: count[o] for o in OUTCOMES}, 'success_rate': rate(count['ok'], len(mine)),
            'recovery_rate': rate(len(recovered), len(failed_sessions)),
            'p50_ms': pct(durations, 0.5), 'p90_ms': pct(durations, 0.9),
            'top_errors': ', '.join(f'{code}×{n}' for code, n in errors.most_common(3)),
        })
    return table


def screen_tables(events):
    """screen_viewed 를 세션별로 이어 체류 시간을 낸다. 마지막 화면은 세션의 마지막 이벤트까지로 본다."""
    spans = session_spans(events)
    views = collections.defaultdict(list)
    for e in events:
        if e['event_name'] == 'screen_viewed':
            views[session_key(e)].append(e)
    dwell, visitors, paths = collections.defaultdict(list), collections.defaultdict(set), collections.Counter()
    for sid, seen in views.items():
        for here, after in zip(seen, seen[1:] + [None]):
            end = after['_at'] if after else spans[sid][1]
            dwell[here['screen']].append((end - here['_at']).total_seconds())
            visitors[here['screen']].add(here.get('participant_id'))
            if here.get('from_screen'):
                paths[(here['from_screen'], here['screen'])] += 1
    screens = [{'screen': s, 'visits': len(d), 'participants': len(visitors[s]), 'total_min': round(sum(d) / 60, 1),
                'median_sec': round(pct(d, 0.5))} for s, d in sorted(dwell.items(), key=lambda item: -sum(item[1]))]
    return screens, paths.most_common(10)


def conversion_funnel(events, rows):
    """참여자 단위: 변환 화면 진입 → 변환 시작 요청(막힘 포함) → 시작 성공 → 플랫폼 결과 하나 이상 성공."""
    stages = [
        ('변환 화면 진입', lambda p: any(e['event_name'] == 'screen_viewed' and e.get('screen') == 'convert'
                                        and e.get('participant_id') == p for e in events)),
        ('변환 시작 시도', lambda p: any(r['participant'] == p and r['task'] == 'platform_run_start' for r in rows)),
        ('변환 시작 성공', lambda p: any(r['participant'] == p and r['task'] == 'platform_run_start'
                                        and r['outcome'] == 'ok' for r in rows)),
        ('플랫폼 결과 성공(부분 포함)', lambda p: any(r['participant'] == p and r['task'].startswith('platform:')
                                          and r['outcome'] in ('ok', 'partial') for r in rows)),
    ]
    people = sorted({e.get('participant_id') for e in events}, key=str)
    return [(label, sum(1 for p in people if check(p)), len(people)) for label, check in stages]


def markdown(table, columns=None):
    if not table:
        return '_기록 없음_\n'
    columns = columns or list(table[0])
    lines = ['| ' + ' | '.join(columns) + ' |', '|' + '---|' * len(columns)]
    lines += ['| ' + ' | '.join('' if row[c] is None else str(row[c]) for c in columns) + ' |' for row in table]
    return '\n'.join(lines) + '\n'


def write_csv(folder, name, table):
    if not table:
        return
    folder.mkdir(parents=True, exist_ok=True)
    with open(folder / name, 'w', encoding='utf-8-sig', newline='') as handle:  # BOM: 엑셀에서 한글이 깨지지 않게
        writer = csv.DictWriter(handle, fieldnames=list(table[0]))
        writer.writeheader()
        writer.writerows(table)


def report(events, files, broken):
    rows = attempts(events)
    people, tasks = participant_table(events, rows), task_table(rows)
    screens, paths = screen_tables(events)
    schema = sorted({e.get('schema_version') for e in events}, key=str)
    builds = sorted({str(e.get('build')) for e in events})
    out = ['# 사용자 테스트 지표', '',
           f'- 파일 {files}개 · 이벤트 {len(events)}건(중복 제외){f" · 읽지 못한 줄 {broken}건" if broken else ""}',
           f'- 기간 {events[0]["_at"]:%Y-%m-%d %H:%M} ~ {events[-1]["_at"]:%Y-%m-%d %H:%M} (UTC)',
           f'- 참여자 {len(people)}명 · 세션 {len(session_spans(events))}개 · schema {schema} · build {builds}', '']
    if 2 not in schema:
        out += ['> schema 1 기록만 있습니다. 저장·다시 열기·내보내기 성공만 담겨 있어 팩트체크·변환 실패와 화면 이동은 집계되지 않습니다.', '']
    out += ['## 참여자별', '', markdown(people),
            '`attempts`는 자동 저장을 뺀 사용자 작업 수입니다. `blocked`는 코어에 닿기 전에 화면에서 막힌 시도입니다.', '',
            '## 작업별', '', markdown(tasks),
            '`partial`은 카드뉴스 원고는 만들었지만 JPG 일부가 실패한 경우입니다. '
            '`recovery_rate`는 실패·막힘이 있었던 세션 중 같은 작업이 결국 성공한 비율입니다.', '']
    if screens:
        out += ['## 화면별 체류', '', markdown(screens), '## 자주 쓴 화면 이동', '',
                markdown([{'from': a, 'to': b, 'count': n} for (a, b), n in paths])]
    funnel = conversion_funnel(events, rows)
    if any(n for _, n, _ in funnel):
        out += ['## 변환 흐름 (참여자 수)', '', markdown([{'stage': label, 'participants': n, 'rate': rate(n, total)}
                                                       for label, n, total in funnel])]
    return '\n'.join(out), {'participants.csv': people, 'tasks.csv': tasks, 'screens.csv': screens,
                            'attempts.csv': [dict(r, at=r['at'].isoformat()) for r in rows]}


def main(argv=None):
    parser = argparse.ArgumentParser(description='UT 기록 JSONL을 합쳐 참여자별·작업별 지표를 만든다.')
    parser.add_argument('paths', nargs='*', default=[DEFAULT_DIR], help='JSONL 파일 또는 폴더(여러 개 가능)')
    parser.add_argument('--out', help='마크다운 보고서를 저장할 파일(없으면 화면에 출력)')
    parser.add_argument('--csv', help='표를 CSV로 저장할 폴더(participants/tasks/screens/attempts.csv)')
    args = parser.parse_args(argv)
    events, files, broken = load(args.paths)
    if not events:
        sys.exit(f'읽을 UT 기록이 없습니다: {", ".join(map(str, args.paths))}')
    text, tables = report(events, files, broken)
    if args.out:
        Path(args.out).write_text(text, encoding='utf-8')
    else:
        sys.stdout.reconfigure(encoding='utf-8')
        print(text)
    if args.csv:
        for name, table in tables.items():
            write_csv(Path(args.csv), name, table)


if __name__ == '__main__':
    main()
