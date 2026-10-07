# 로컬 모델 — 앱 동봉/다운로드 설계 (초안)

> **모델 호스팅 완료(2026-10-07):** 사용자 업로드 완료, `app/models_manifest.json`의 5개 모델 `base`가 Hugging Face 주소로 연결되어 있다. 아래 옛 호스팅 미정 설명은 과거 기록이다. 실제 다운로드 검증은 EXE 빌드 후로 유예한다.

> **2026-10-07 현재:** 임베딩도 ONNX FP32로 연결했다. 제품 추론은 ONNX Runtime + tokenizers + NumPy를 사용한다. 아래 과거 크기·torch 의존성 표는 당시 기록이며 현재 임베딩은 [EMBEDDING_ONNX.md](./EMBEDDING_ONNX.md)를 따른다. 사용자 요청으로 추가 검증은 후속 작업이다.

- 상태: **확정(2026-10-02) — B안 구현 완료** (§3·§7). 남은 결정은 §6
- 관련: `../packaging/README.md`, `docs/IPC_MIGRATION.md`, `../ARCHITECTURE.md`(model_versions·Update Manager)
- **2026-10-05 변경:** 팩트체크 판정기를 `Qwen3-0.6B + v10 LoRA(torch·peft)`에서 **`factcheck-judge-0.6b-v2`(ONNX, LoRA 병합본 2.4 GB)**로 교체.
  런타임은 onnxruntime + tokenizers(torch·transformers 는 임베딩용으로만 남음, peft 불필요). 학습·평가·패키징은
  `../../research/factcheck-judge`(README). 아래 §1·§3 의 v10 수치는 교체 전 기록이다.
- **2026-10-06:** `factcheck-judge-0.6b-v3` 로 교체(같은 형식·크기). 실무형 평가(정책브리핑·KLUE) 정답 크게 증가, research README 'v3 결과'.

## 1. 실측 (이 PC 기준)

| 모델 | 용도 | 실측 크기 | 위치 |
|---|---|---|---|
| `Qwen3-0.6B` (base) | 팩트체크 베이스 | **2,054 MB** (6 files) | `ai-newsroom-os/backend/models/base` |
| `v10-paraphrase` (LoRA adapter) | 팩트체크 어댑터 | **28.5 MB** (8 files) | 같은 `models/adapters` |
| 매니페스트 | 활성 모델 지정 | 1 KB | `models/active_model.json` (`model_id`, base, adapter, chunker, retrieval) |
| KeT5 / KoBART (제목·부제) | 로컬 추론(선택) — ONNX 변환본(2026-10-02, torch 불필요) | 0.39 GB + 0.68 GB | `models/headline-ket5-onnx`, `models/subtitle-kobart-onnx` |

**팩트체크 모델만 약 2.08 GB.** 여기에 런타임이 붙는다: torch(CPU) ≈ 250 MB, transformers/peft/numpy ≈ 80 MB.

→ 모델+런타임을 함께 넣으면 **설치 크기 2.5~3 GB**, 창+코어+모델 RAM ≈ 2 GB 이상(제목·부제 모델까지 올리면 3 GB+).

## 2. 이 사실이 바꾸는 것 (지금 코드/문서 기준)

| 항목 | 지금 | 바뀌어야 할 것 |
|---|---|---|
| `packaging/AINewsroom.spec` | `torch`/`transformers` **제외**, 28 MB 유지 | 모델 동봉이면 포함, 별도 다운로드면 제외 유지 |
| `packaging/README.md` | "로컬 AI 모델은 배포본에 넣지 않는다" | 정책에 맞게 수정 |
| 팩트체크 실행 | 별도 FastAPI(uvicorn, `FACTCHECK_BACKEND_URL=127.0.0.1:54321`) | 배포본에서는 **별도 프로세스/포트를 없애는 방향**이 안전(아래 §4) |
| 첫 실행 경험 | 없음 | 모델이 없을 때 **다운로드·진행률·재개·해시 검증** 필요 |

주의: PyInstaller **onefile 은 사실상 불가**(압축 해제 4 GB+, 시작 지연). **onedir 전제**이며, torch 를 묶으면 빌드가 무거워진다(`--collect-all torch` 수준, .pyd/.dll 대량).

## 3. 선택지 (모델 전달 방식)

| 안 | 설치 파일 | 첫 실행 | 장점 | 단점 |
|---|---|---|---|---|
| **A. 설치 파일에 포함** | ~2.5 GB | 즉시 사용 | 오프라인 설치, 네트워크 불필요 | 배포·업데이트가 무겁고, 모델만 바뀌어도 전체 재배포 |
| **B. 첫 실행 시 다운로드(권장)** | ~30 MB | 1회 다운로드(+진행률/재개) | 가볍게 배포, 모델만 갱신 가능 | 최초 1회 네트워크 필요 |
| **C. 하이브리드** | ~30 MB + 오프라인 팩 zip | 기본은 B, 사내망은 zip 수동 설치 | 조직 배포에 유연 | 두 경로 유지 |

### 런타임 경량화(별개 결정, 강력 권장)
`torch+transformers+peft` 대신 **ONNX Runtime(int8)** 또는 **llama.cpp GGUF(int4)** 로 변환하면
런타임 5~20 MB, 모델 0.4~0.6 GB 수준이 된다(0.6B 분류/생성엔 충분). 변환·검증 스크립트가 추가로 필요하지만
설치 크기가 5분의 1로 줄어든다.

> 참고: 모델 폴더에 이미 `Qwen3-0.6B-Q8_0.gguf`(**639 MB**)가 있다. 즉 런타임만 GGUF 로 정하면
> 다운로드가 **2.18 GB → 0.64 GB** 로 줄어든다(사프텐서 1.5 GB 제외). §6-2 참고.

**결정: B안** — 설치 파일은 가볍게(30 MB), 첫 사용 때 앱이 모델을 내려받는다(진행률·이어받기·해시 검증).

## 4. 팩트체크 실행 방식 (배포본)

| 안 | 구조 | 비고 |
|---|---|---|
| **인프로세스(권장)** | 코어 스레드에서 모델 추론 (FastAPI/uvicorn 제거) | 포트·프로세스 관리가 사라짐. 지연 로딩 + 유휴 시 해제 |
| 같은 exe 재실행 | `AINewsroom.exe --factcheck-server` 로 자기 자신을 자식 프로세스로 | 격리는 되지만 프로세스/포트 추가, 크래시 처리 필요 |
| 현재 유지 | 로컬 uvicorn(54321) | 개발엔 편함. 배포본에는 포트가 하나 더 생김 |

인터페이스는 `core/ai/providers/` 와 같은 **seam** 으로 두는 것을 권장한다:
개발은 `FACTCHECK_BACKEND_URL`(FastAPI) ↔ 배포는 인프로세스. 코어 계약은 동일.

## 5. 함께 정할 것

1. **모델 저장 위치**: 포터블이면 `APP_ROOT/models/`, 공유 캐시면 `%LOCALAPPDATA%` (우리 `.article-workspace` 규칙과 맞추기)
2. **매니페스트**: 기존 `active_model.json` 패턴을 그대로 사용(모델 id·버전·해시·다운로드 URL) + `model_versions` 테이블과 연결
3. **무결성**: SHA-256 검증, 실패 시 롤백, 부분 다운로드 재개
4. **라이선스**: `Qwen3-0.6B`(Apache-2.0) 확인됨. **KeT5(onebeans)·KoBART(gogamza)는 배포 전 라이선스 확인 필요**
5. **UI/로그**: `--check` 와 창에 "모델 다운로드/버전/준비 상태" 표시
6. **업데이트**: `Update Manager`(미구현)와 모델 버전 교체 흐름

## 6. 남은 결정·작업

1. **호스팅(창고 주소 `base`)**: 매니페스트에는 파일 16개·크기·SHA-256 이 이미 적혀 있고, **어디서 받을지(주소의 앞부분)** 만 비어 있다.
   `base` + `/` + `path` 가 실제 다운로드 주소가 된다(`core/managers/model_manager.py`).

   ```
   base   https://huggingface.co/<계정>/<repo>/resolve/main
   path   base/Qwen3-0.6B/model.safetensors
   실제   https://huggingface.co/<계정>/<repo>/resolve/main/base/Qwen3-0.6B/model.safetensors
   ```

   | 창고(호스팅) | 준비 | 비용 | 비고 |
   |---|---|---|---|
   | 사내 서버·공유 폴더(SMB·USB) | 없음(이미 동작) | 0 | 외부망 불필요. `--from "\\서버\경로"` |
   | Hugging Face Hub | repo 생성 + 업로드 | 0 | CDN·이어받기, LFS 지문 = SHA-256(매니페스트 그대로 검증). 비공개면 토큰 필요 |
   | GitHub Releases | 태그 + 자산 업로드 | 0 | 파일당 2 GB 까지(1.5 GB 사프텐서 OK). 비공개면 토큰 |
   | Cloudflare R2 / S3 | 버킷 | GB당 소액 | 운영용. R2 는 egress 무료 |
   | Render | 유료 디스크 | — | **부적합**: 디스크가 휘발성 + git 에 2 GB 커밋 필요 |
   | Supabase Storage | — | 유료 필요 | **부적합**: 무료 1 GB 총량·파일 크기 제한 |

   참고: `base/Qwen3-0.6B/*`(1.5 GB)는 원래 허깅페이스에서 받은 파일이라 공개 모델이면 HF 주소를 그대로 쓸 수 있다.
   `Qwen3-0.6B-Q8_0.gguf`(639 MB)는 이쪽에서 만든 변환본이라 **직접 올려야 한다**.
   파일마다 다른 주소를 쓰고 싶으면 매니페스트에 파일별 `url` 을 지원하도록 확장한다.
2. **런타임**: torch 유지 vs **GGUF(Q8_0, 639 MB)** 기반 — 모델 폴더에 gguf 가 이미 있으므로, 런타임만 정하면
   다운로드를 **2.18 GB → 0.64 GB** 로 줄일 수 있다(사프텐서 제외).
3. **팩트체크 실행 방식**: 인프로세스(권장) / 자식 프로세스 / uvicorn 유지 — §4.
4. **앱 자체 모델(KeT5·KoBART)**: 지금은 HF 캐시로 직접 받는다(**해시 검증 없음**) → 같은 매니페스트로 옮기는 것이 일관적이다.
5. **라이선스**: `Qwen3-0.6B`(Apache-2.0) 확인됨. **KeT5(onebeans)·KoBART(gogamza)는 배포 전 확인 필요**.
6. **UI**: 모델 설치 화면(진행률·재시도·오프라인 안내) — 계약은 이미 준비됨(§7).

## 7. 구현 현황 (2026-10-02, B안)

| 구성 | 파일 | 상태 |
|---|---|---|
| 매니페스트 | `app/models_manifest.json` — 실제 모델 폴더에서 생성(16파일, 2.18 GB, 크기·SHA-256) | ✅ |
| 설치 관리자 | `app/core/managers/model_manager.py` — 다운로드 · **이어받기(Range 206)** · SHA-256 검증 · 진행률 · 취소 · **로컬/UNC 설치** | ✅ |
| 코어 계약 | `GET /api/models` · `POST /api/models/install` · `POST /api/models/cancel` (백그라운드 스레드 + 폴링, 동기 검증) | ✅ |
| 프론트 계약 | `models()` · `installModels()` · `cancelModelInstall()` | ✅ (화면은 다음 작업) |
| CLI | `python app/launcher.py --models [install [--from <폴더\|URL>]]`, `--check` 에 모델 상태 표시 | ✅ |
| 배포본 | `models_manifest.json` 동봉, 모델 폴더 = exe 옆 `models/`(포터블) | ✅ |
| 생성 도구 | `dev/checks/make_model_manifest.py --dir <모델폴더> --id <id> --out app/models_manifest.json` | ✅ |
| 테스트 | `dev/tests/test_models.py` 7개 + API 3개 | ✅ 전부 통과 |

```
# 온라인(매니페스트 base 를 채운 뒤)
python app/launcher.py --models install

# 사내망/오프라인(공유 폴더·USB 에서)
python app/launcher.py --models install --from "\\서버\배포\models\factcheck-judge-0.6b-v3"

# 상태만
python app/launcher.py --models
```

### 저장 위치

> **2026-10-06 변경:** 아래 '설치 경로 안' 설계를 바꿨다. 모델·캐시·로그는 `%LOCALAPPDATA%\AI Newsroom\`,
> 기사·취재자료 원본은 `내 문서\AI Newsroom\`(app/app_paths.py). 예전 `article_editor/models/`·`.article-workspace/` 는
> 첫 실행 때 자동으로 옮긴다(같은 드라이브면 즉시, 못 옮기면 예전 모델 폴더를 그대로 사용). `MODELS_DIR` 로 바꿀 수 있는 것은 같다.
> 아래 표는 변경 전 기록이다.

| 대상 | 기본 위치 | 바꾸는 방법 |
|---|---|---|
| 모델 파일(팩트체크 2.18 GB) | **`<설치 폴더>/models/`** (배포본은 exe 옆, 개발은 `article_editor/models/`) | `.env` 의 `MODELS_DIR` |
| 매니페스트(읽기 전용, 앱에 동봉) | `_internal/models_manifest.json` | `MODELS_MANIFEST`(테스트용) |
| 제목·부제 모델 캐시(허깅페이스) | **`<설치 폴더>/models/hf/`** | `.env` 의 `HF_HOME` |

- 폴더째 복사하면 모델도 따라온다(포터블). `%LOCALAPPDATA%` 나 사용자 프로필(`.cache\huggingface`)에는 쓰지 않는다.
- Program Files 처럼 쓰기 권한이 없는 곳에 두면 설치를 시작할 때 **2 GB 를 받기 전에** 안내하고 멈춘다(503):
  "설치 폴더에 쓰기 권한이 없으면 관리자 권한으로 실행하거나 `.env` 에 `MODELS_DIR` 를 지정해 주세요."
- 필요한 여유 공간: 모델 2.18 GB + 받는 중 임시 파일 1개분(`.part`).

검증 기록: 로컬 폴더 설치 2/2 파일 설치됨 · 이어받기(`Range: bytes=N-` → 206) 확인 · 해시 불일치 시 파일 삭제 후 502 ·
취소 시 `cancelled=true` · **배포 exe 에서 `--models` 동작(매니페스트 동봉 확인)**.
