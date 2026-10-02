"""팩트체크·의미 청킹 모듈 (archive-os.v2 backend/app/services 에서 이식, 2026-10-02).

AI Module Manager 만 이 패키지를 부른다. 프론트는 factcheck.run / semantic.parse 계약만 안다.
모델 파일은 ModelManager 매니페스트로 MODELS_DIR 아래에 설치된다(paths.py).
"""
