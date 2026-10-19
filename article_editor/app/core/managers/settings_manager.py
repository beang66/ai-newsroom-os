"""Settings Manager — 이 PC 의 환경 설정(settings.json). 모델 설치와는 별개 기능이다.

지금 항목: cloudBackup(작성 중 기사를 클라우드에 백업) — 기본 켜짐, 사용자가 끌 수 있다.
localAi(로컬 AI 사용) — 기본 꺼짐 = OpenAI(백엔드 경유). 켜면 팩트체크 판정·제목/부제 초안(KeT5·KoBART)·흐름 요약 초안을
이 PC 의 로컬 모델이 만든다(모델 설치 필요). 예전 키 local_factcheck 는 읽지 않는다(2026-10-18 기본값을 OpenAI 로 바꿈).
같은 settings.json 을 로그인 설정(session_manager)도 쓰므로 항상 읽고-합쳐서-쓴다.
"""
from __future__ import annotations

import json

from app_paths import APP_DATA

from ..errors import RequestError
from .session_manager import SETTINGS, _settings

FIELDS = {'cloudBackup': ('cloud_backup', True), 'localAi': ('local_ai', False),
          'utMeasurement': ('ut_measurement', False)}  # 화면 이름 → (파일 키, 기본값)


class SettingsManager:
    def get(self):
        saved = _settings()
        return {name: bool(saved.get(key, default)) for name, (key, default) in FIELDS.items()}

    def update(self, payload):
        """payload: {cloudBackup?: bool, localAi?: bool, utMeasurement?: bool} — 준 항목만 바꾼다."""
        data = payload or {}
        changes = {}
        for name, (key, _) in FIELDS.items():
            if name in data:
                if not isinstance(data[name], bool):
                    raise RequestError(f'{name} 은 true/false 여야 합니다.')
                changes[key] = data[name]
        if changes:
            APP_DATA.mkdir(parents=True, exist_ok=True)
            SETTINGS.write_text(json.dumps({**_settings(), **changes}, ensure_ascii=False), encoding='utf-8')
        return self.get()


def local_ai() -> bool:
    """로컬 AI 를 쓰는가(기본 아니오 = OpenAI)."""
    return SettingsManager().get()['localAi']
