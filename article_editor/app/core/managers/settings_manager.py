"""Settings Manager — 이 PC 의 환경 설정(settings.json). 모델 설치와는 별개 기능이다.

지금 항목: cloudBackup(작성 중 기사를 클라우드에 백업) — 기본 켜짐, 사용자가 끌 수 있다.
localFactcheck(팩트체크에 로컬 판정 모델 사용) — 기본 켜짐. 끄면 모든 문장을 외부 모델(API)이 판정한다(성능 우선, 토큰 사용↑).
ponytail: 아직 선호값만 저장한다(실제 업로드는 서버 저장 기능이 생길 때 이 값을 읽어 동작).
같은 settings.json 을 로그인 설정(session_manager)도 쓰므로 항상 읽고-합쳐서-쓴다.
"""
from __future__ import annotations

import json

from app_paths import APP_DATA

from ..errors import RequestError
from .session_manager import SETTINGS, _settings

DEFAULTS = {'cloud_backup': True, 'local_factcheck': True}


class SettingsManager:
    def get(self):
        saved = _settings()
        return {'cloudBackup': bool(saved.get('cloud_backup', DEFAULTS['cloud_backup'])),
                'localFactcheck': bool(saved.get('local_factcheck', DEFAULTS['local_factcheck']))}

    def update(self, payload):
        """payload: {cloudBackup?: bool, localFactcheck?: bool} — 준 항목만 바꾼다."""
        data = payload or {}
        changes = {}
        if 'cloudBackup' in data:
            if not isinstance(data['cloudBackup'], bool):
                raise RequestError('cloudBackup 은 true/false 여야 합니다.')
            changes['cloud_backup'] = data['cloudBackup']
        if 'localFactcheck' in data:
            if not isinstance(data['localFactcheck'], bool):
                raise RequestError('localFactcheck 는 true/false 여야 합니다.')
            changes['local_factcheck'] = data['localFactcheck']
        if changes:
            APP_DATA.mkdir(parents=True, exist_ok=True)
            SETTINGS.write_text(json.dumps({**_settings(), **changes}, ensure_ascii=False), encoding='utf-8')
        return self.get()


def local_factcheck() -> bool:
    """팩트체크에 로컬 판정 모델을 쓰는가(기본 예). 아니면 모든 문장을 외부 모델에 맡긴다."""
    return SettingsManager().get()['localFactcheck']
