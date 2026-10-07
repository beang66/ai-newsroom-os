"""테스트는 개발자의 .env(실제 API 키, 공용 테스트 계정, 토큰)를 읽지 않는다.

core.config 는 import 할 때 .env 를 읽으므로 테스트 파일에서 core 보다 먼저 import 해야 한다.
이게 없으면 .env 에 테스트 계정이 있을 때 코어가 실제로 자동 로그인하고, 키가 있으면 실제 API 를 호출한다.
"""
import os

os.environ['AI_NEWSROOM_SKIP_DOTENV'] = '1'
for name in ('OPENAI_API_KEY', 'GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY', 'UNSPLASH_APPLICATION_ID', 'UNSPLASH_SECRET_KEY',
             'APP_TOKEN', 'TEST_ACCOUNT_EMAIL', 'TEST_ACCOUNT_PASSWORD'):
    os.environ.pop(name, None)
