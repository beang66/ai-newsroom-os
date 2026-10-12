"""문제 보고용 진단 정보 — 앱 버전·파이프라인 버전·모델 설치 상태·설정 요약. **원고·자료·이메일·경로의 사용자 이름은 담지 않는다.**"""
import json
import platform
import sys

from app_paths import BUNDLE

from . import auth, config, saved_login


def _build_info():
    try:
        return json.loads((BUNDLE / 'build_info.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def report(models, factcheck_mode, settings):
    """models: ModelManager.status() 결과, factcheck_mode: 'local'|'external', settings: SettingsManager.get() 결과"""
    info = _build_info()
    return {
        'appVersion': info.get('commit') or ('개발 실행' if not getattr(sys, 'frozen', False) else 'unknown'),
        'builtAt': info.get('builtAt') or '',
        'pipelineVersion': config.PIPELINE_VERSION,
        'frozen': bool(getattr(sys, 'frozen', False)),
        'os': platform.platform(),
        'models': [{'id': row['id'], 'installed': row['installed'], 'files': f"{row['filesDone']}/{row['files']}"}
                   for row in (models or {}).get('models', [])],
        'factcheckMode': factcheck_mode,
        'signedIn': bool(auth.status()['signedIn']),
        'keepLogin': saved_login.load() is not None,
        'settings': settings,
        'storageErrorLog': '%LOCALAPPDATA%\AI Newsroom\logs\storage-errors.jsonl',
    }
