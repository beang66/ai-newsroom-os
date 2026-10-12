"""테스트는 개발자의 .env(실제 API 키, 공용 테스트 계정, 토큰)를 읽지 않는다.

core.config 는 import 할 때 .env 를 읽으므로 테스트 파일에서 core 보다 먼저 import 해야 한다.
이게 없으면 .env 에 테스트 계정이 있을 때 코어가 실제로 자동 로그인하고, 키가 있으면 실제 API 를 호출한다.
"""
import atexit
import os
import shutil
import tempfile

os.environ['AI_NEWSROOM_SKIP_DOTENV'] = '1'
# 실제 vault.db 와 기기 키를 쓰지 않는다: 팩트체크 기록·임베딩 캐시 같은 부수 저장이 실제 DB 에 남지 않게
# (모델 폴더 등 APP_DATA 의 나머지는 그대로 — 모델이 설치된 PC 에서도 팩트체크 테스트가 돈다)
_VAULT_DIR = tempfile.mkdtemp(prefix='ainews-test-vault-')
atexit.register(shutil.rmtree, _VAULT_DIR, True)
os.environ['AI_NEWSROOM_VAULT'] = os.path.join(_VAULT_DIR, 'vault.db')
os.environ['AI_NEWSROOM_KEY_SERVICE'] = 'AI Newsroom (test)'
for name in ('OPENAI_API_KEY', 'GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY', 'UNSPLASH_APPLICATION_ID', 'UNSPLASH_SECRET_KEY',
             'APP_TOKEN', 'TEST_ACCOUNT_EMAIL', 'TEST_ACCOUNT_PASSWORD'):
    os.environ.pop(name, None)
