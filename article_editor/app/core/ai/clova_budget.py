"""CLOVA Speech 비용 방어 — 무료 구간을 넘겨 요금이 나가지 않게 녹음 길이를 센다.

CLOVA 는 호출 횟수가 아니라 **오디오 길이(분)**로 요금이 나간다. 그래서 두 가지를 지킨다.
- 한 번에 변환하는 녹음의 길이 상한(기본 20분)
- 이번 달(이 계정·이 PC)에 변환한 길이의 합 상한(기본 20분)

설정(.env): CLOVA_MAX_FILE_MINUTES, CLOVA_MONTHLY_MINUTES — 0 이면 그 제한을 끈다.
한계: 합계는 이 PC 의 계정 저장소 기준이다(같은 키를 다른 PC 가 쓰면 합쳐지지 않는다). 녹음 길이는 브라우저가 알려 준 값을 쓴다
(없으면 한 번 상한은 건너뛰고 월 합계만 본다). 가장 확실한 안전장치는 NAVER Cloud 콘솔의 사용량·요금 알림이다.
"""
import datetime
import json
import os
import threading

from .. import vault
from ..errors import RequestError

_LOCK = threading.Lock()


def _minutes(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.environ.get(name) or default))
    except ValueError:
        return default


def _key() -> str:
    return 'clova_seconds:' + datetime.date.today().strftime('%Y-%m')


def used_seconds() -> float:
    with vault.connect() as db:
        row = db.execute('SELECT value FROM app_meta WHERE key = ?', (_key(),)).fetchone()
    try:
        return float(json.loads(row[0])) if row else 0.0
    except (ValueError, TypeError):
        return 0.0


def _number(value):
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 else None


def check(duration_seconds=None) -> None:
    """변환을 시작하기 전에 부른다. 한도를 넘으면 RequestError(요금이 나가기 전에 막는다)."""
    hint = _number(duration_seconds)
    max_file = _minutes('CLOVA_MAX_FILE_MINUTES', 20) * 60
    monthly = _minutes('CLOVA_MONTHLY_MINUTES', 20) * 60
    if max_file and hint and hint > max_file:
        raise RequestError('녹음이 %.1f분이에요. 음성 변환 요금을 지키려고 한 번에 %g분까지만 변환할 수 있어요. 나눠서 올려 주세요.'
                           % (hint / 60, max_file / 60), 413)
    if monthly:
        used = used_seconds()
        if used >= monthly or (hint and used + hint > monthly):
            raise RequestError('이번 달 음성 변환 한도(%g분)에 도달했어요(사용 %.1f분%s). 다음 달에 다시 시도하거나 한도 설정을 확인해 주세요.'
                               % (monthly / 60, used / 60, ', 이 녹음 %.1f분 추가 시 초과' % (hint / 60) if hint else ''), 429)


def record(duration_seconds) -> None:
    """변환이 끝난 뒤 실제 길이를 이번 달 합계에 더한다."""
    seconds = _number(duration_seconds)
    if not seconds:
        return
    with _LOCK, vault.connect() as db:
        row = db.execute('SELECT value FROM app_meta WHERE key = ?', (_key(),)).fetchone()
        try:
            total = float(json.loads(row[0])) if row else 0.0
        except (ValueError, TypeError):
            total = 0.0
        db.execute('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', (_key(), json.dumps(round(total + seconds, 2))))
