"""su4228 v30 시험이 쓰는 `server` 이름 공간을 우리 코어 모듈로 이어 주는 얇은 층.

그쪽 시험은 `import server` 후 `patch.object(server, 'structured_call', ...)` 처럼 한 곳에서 이름을 바꿔 끼운다.
우리 코어는 같은 함수가 headline/router/subtitle_editorial 로 나뉘어 각자 이름을 들고 있으므로,
이름을 바꿔 끼우면 그 이름을 쓰는 모든 모듈에 함께 적용하고, 되돌릴 때(delattr)도 함께 되돌린다.
시험 본문은 그쪽 것을 그대로 두기 위한 장치다(시험 코드는 `import server` 한 줄만 `import su_server as server` 로 바뀜).
"""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core import config, errors  # noqa: E402
from core.ai import client, headline, router, subtitle_editorial  # noqa: E402

_HOMES = {  # 이름 → 그 이름을 들고 있는 모듈들(첫 번째가 읽을 때의 기준)
    'structured_call': (client, headline, subtitle_editorial, router),
    'openai_call': (client, router),
    'generate_subtitle_drafts': (headline, router),
    'generate_headline_drafts': (headline,),
    'metadata_assist': (headline, router),
    'polish_subtitle_lines': (subtitle_editorial, headline),
    'subtitle_style_violations': (subtitle_editorial, headline),
    'confirm_subtitle_facts': (subtitle_editorial, headline),
    'finalize_openai_subtitles': (subtitle_editorial, router),
}
_READ_ONLY = (router, headline, subtitle_editorial, client, config, errors)
_originals = {name: {m.__name__: getattr(m, name) for m in mods} for name, mods in _HOMES.items()}


class _Server:
    def __getattr__(self, name):
        for module in _HOMES.get(name, ()) or _READ_ONLY:
            if hasattr(module, name):
                return getattr(module, name)
        raise AttributeError(name)

    def __setattr__(self, name, value):
        if name not in _HOMES:
            raise AttributeError('su_server 는 %s 를 바꿔 끼울 수 없습니다' % name)
        for module in _HOMES[name]:
            setattr(module, name, value)

    def __delattr__(self, name):  # patch.object 가 되돌릴 때
        for module in _HOMES[name]:
            setattr(module, name, _originals[name][module.__name__])


sys.modules[__name__] = _Server()
