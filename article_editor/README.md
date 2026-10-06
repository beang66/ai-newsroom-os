# 기사 작성 워크스페이스 v30 — GitHub 공유용

기사 작성·동아일보 미리보기·제목/부제 추천·요약·사진 검색/편집·로컬 저장/버전 기록 기능. 변경 기록과 캡처는 별도 기록 ZIP으로 분리.

## 최초 설치 — Windows

1. 이 코드 ZIP을 새 폴더에 모두 풀기.
2. 별도 제공한 모델 ZIP **6개를 모두** 풀어서, 각 ZIP 안 `models` 폴더를 `index.html`이 있는 폴더에 합치기.
3. `install_onnx_windows.bat` 실행. Python 3.10~3.12 권장, 3.12에서 검증.
4. `.env.example` 복사 → `.env`로 이름 변경 → `OPENAI_API_KEY=` 오른쪽에 본인 키 입력.
5. `start_windows.bat` 실행. 실행 창을 열어 둔 채 사용.

처음 한 번의 패키지 설치에는 인터넷 필요. **이 앱이 모델을 자동으로 다운로드하는 것은 아님.** 모델 파일 6개를 준비해야 함. 설치 후에는 재다운로드 없이 실행 가능.

## 모델 파일을 넣는 위치

| 파일 | 올바른 위치 |
|---|---|
| 앱 시작 파일 | `article_workspace_v30/index.html` |
| 제목 모델 | `article_workspace_v30/models/onnx/headline/encoder_model.onnx` 등 |
| 부제·요약 모델 | `article_workspace_v30/models/onnx/subtitle/encoder_model.onnx` 등 |

예를 들어 `article_workspace_v30/headline_onnx_encoder/models/...`처럼 압축파일 이름의 폴더가 중간에 끼면 앱이 찾지 못함. `models`가 `index.html` 옆에 있어야 함.

필요한 ZIP:
- `headline_onnx_encoder.zip`, `headline_onnx_decoder.zip`, `headline_onnx_cache.zip`
- `subtitle_onnx_encoder.zip`, `subtitle_onnx_decoder.zip`, `subtitle_onnx_cache.zip`

각 모델의 tokenizer·config·manifest 파일도 함께 유지. ONNX 파일만 골라 옮기지 말 것.

## API 키

ONNX 설정은 `.env.example`에 미리 적용되어 있어 팀원이 바꿀 필요 없음. OpenAI 키만 입력하면 제목·부제·요약의 최종 편집 사용 가능. **사진 검색에는 `UNSPLASH_ACCESS_KEY`도 필요.** 공개 저장소에 팀 공용 키를 넣지 말 것.

처음 설치가 끝나고 모델이 해당 폴더에 있을 때부터 `start_windows.bat` 실행만으로 사용 가능. `index.html` 더블클릭으로 실행하지 않음.

## Mac/Linux

```bash
python3 -m venv .onnx-env
.onnx-env/bin/python -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
.onnx-env/bin/python -m pip install -r requirements-onnx.txt
.onnx-env/bin/python scripts/verify_onnx.py
.onnx-env/bin/python launcher.py
```

## 원고와 GitHub

기존 원고를 이어 쓰려면 기존 `.article-workspace` 폴더를 새 실행 폴더로 복사. 원본은 보관. 원고 DB·사진·API 키는 공유 ZIP에 없음.

GitHub에는 이 ZIP 안 `article_workspace_v30`의 **내용물**을 기존 작업 폴더 `article_editor`에 반영. 공용 앱 루트는 덮어쓰지 말 것. 이 앱의 기능 코드·필수 실행 설정·통합 문서·개발 테스트만 포함. 변경 로그·과거 수정 안내·캡처·모델 가중치는 제외.

**기존 GitHub에 이미 올라간 기록 파일은 새 파일을 덮어 올려도 자동으로 삭제되지 않음.** 이번 ZIP에서 제외된 기록 파일만 별도 삭제하거나 기록 폴더로 이동. `.gitignore`도 이미 추적 중인 파일을 자동 삭제하지 않음.

팀 통합: `CORE_HANDOFF_V30.md` 참고. 공통 Core와 실제 DB 연결은 별도 통합 작업이며 기존 로컬 SQLite는 유지.
