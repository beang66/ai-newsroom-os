# 콘텐츠 변환 작업 보존 및 main 반영 기록

작성일: 2026-10-14 (Asia/Seoul)

## 반영 결과

- 작업 브랜치: `work/content-transform-main-sync-20261014` (새 로컬 브랜치)
- 기존 로컬 main: `b81d38c1dad50d52055e5a324a610011cb923d33` 그대로 유지
- 작업 보존 커밋: `6c4670d` — 카드뉴스 생성기·검수 화면·상태 테스트, 새 lib/테스트, 검색 실험·연결 계약·팀 기록, 기존 프론트 산출물을 함께 보존
- fetch로 확인한 origin/main: `253da6a9a7d25ab8f37d3266faaf878780519271`
- 병합 커밋: `a6aca2e` — 작업 브랜치에서 origin/main 병합
- 충돌: 없음. 작업 파일과 원격 수정 파일의 직접 교집합 없음
- push, PR 생성/병합, 배포 및 원격 브랜치 변경: 실행하지 않음

## 원격 변경과 보호 범위

원격의 추가 커밋은 `0c899c6`, `5452945` 및 두 병합 커밋 `110e928`, `253da6a`이다. 수정 파일은 아래 네 개다.

| 파일 | 반영 내용 |
|---|---|
| `article_editor/app/core/ai/factcheck/external.py` | 외부 판정에 전달하는 문장별 근거 상한 3개 → 5개 |
| `article_editor/app/core/ai/factcheck/service.py` | 위 상한을 설명하는 문서 문자열 갱신 |
| `article_editor/dev/tests/test_factcheck_external_mode.py` | 근거 5개 제한·프롬프트 검증 추가 |
| `article_editor/docs/SECURITY_MODEL.md` | 이전 마법사·원고 백업 구현 설명 갱신 |

카드뉴스 생성기, draft-validator, 새 lib, 플랫폼 API, PlatformReview, platform-state 테스트에는 원격 변경이 없었다. Core 기능·공통 화면·플랫폼 규칙은 임의 수정하지 않았다. `KEEP — 삭제 금지` 코드는 수정/삭제하지 않았다. 검색·임베딩 기능도 새로 구현하지 않았다. 기존 2026-10-14 조사 문서의 '외부 근거 3개' 설명은 병합 이전 조사 시점의 기록이며, 병합 이후 실제 Core의 상한은 5개다.

## 보존 전 검토 및 빌드

추가/삭제 파일 목록과 변경 내용을 검토했다. 삭제는 구형 프론트 빌드 자산에 한정되며 대응 새 산출물을 보존했다. 커밋 후보 파일의 개인키/OpenAI/Google/GitHub/AWS 키 패턴 검사에서 일치 항목이 없었다. 사용자 DB, 로그인 세션, .env, 임시 출력은 커밋에 포함하지 않았다. 패턴 검사가 모든 형태의 비밀값 부재를 증명하는 것은 아니다.

프론트 산출물은 병합 후 저장소 루트의 `npm run build`로 다시 생성했다. 산출물은 손으로 병합/수정하지 않았다. 줄바꿈 정규화 이후 자산 해시 이름이 바뀌었으며 새 빌드가 참조하는 자산을 함께 보존했다. 최초 보존본도 `6c4670d`에서 조회할 수 있다. Markdown 줄바꿈과 생성된 JS 문자열의 공백은 원본 그대로 보존했다.

## 병합 후 검증

| 확인 | 결과 |
|---|---|
| `npm test` | API 경계 검사 및 47개 테스트 통과 |
| quote-context + writing-rules + platform-state | 19개 통과 (위 47개와 platform-state 범위 중복 있음) |
| Core 외부 판정 Python 테스트 | 6개 통과, 새 근거 5개 테스트 포함 |
| 실제 Core→Node 플랫폼 입력 계약 | 3개 통과 |
| 플랫폼 관리자 Python 테스트 | 11개 통과 |
| `npm run build` | 통과. 기존 `editorial.js` 정적/동적 import 혼용 경고 있음 |
| 카드뉴스 전용 UI 스모크 | 통과 (실제 격리 Core + 모의 플랫폼/AI 응답) |
| 기존 전체 UI 스모크 | 실패: `ui-smoke.mjs:310`의 구형 textarea placeholder 선택자로 현재 contentEditable 본문을 찾지 못함 |
| 추가 스모크 파일 구문 및 변경분 공백 검사 | 통과 |

전체 UI 스모크는 카드뉴스 단계 이전에 멈췄다. 해당 실패를 이유로 공통 편집기를 수정하지 않았다. 기존 전체 시나리오는 그대로 두고, 동일한 임시 Core·모의 API 하네스를 사용하는 `UI_SMOKE_FOCUS=card-news` 분기와 `card-news-ui-smoke.mjs`를 추가했다.

전용 스모크 확인 범위: 저장 기사 적용 → 카드뉴스 생성 → 결합된 새 검수 재사용(추가 검수 API 0회) → 편집 후 검수 필요 → 검수 → 명시적 재검수 → 검수 중 편집/늦은 응답 거부 → Core MediaAsset 이미지 표시 → 수동 저장 및 복원 → 저장 복원한 이전 런타임 검수의 자동 재사용 거부. 화면 테스트의 생성 검수 결합은 모의 응답에 실제 공유 결합 함수를 적용했다. 실제 생성기 네 번의 호출 및 최종 결과 결합은 별도 Node 회귀 테스트에서 확인했다.

## 테스트 환경과 한계

필요한 의존성이 없어 초기 Python/UI 및 실제 플랫폼 연결 테스트가 실패했다. 저장소 요구사항에 따른 SQLCipher/keyring 및 ONNX Runtime/tokenizers를 Git 제외 `article_editor/.runtime`에 설치하고, 플랫폼 Node 의존성은 기존 잠금 파일 기준 `npm --prefix platform-generator ci --ignore-scripts`로 설치한 뒤 관련 실패 범위만 다시 실행했다. 시스템 Python 패키지나 잠금 파일을 변경하지 않았다. 설치 패키지가 샌드박스에서 접근 거부되어 Python/UI는 승인된 실행으로 확인했다.

로컬 경계 모델 파일이 없어 외부 판정 end-to-end 테스트는 경계 모델 대신 기존 규칙 경로를 사용했다. `.runtime` 설치 시 시스템에 있던 구형 transformers와 새 tokenizers/huggingface-hub의 호환 경고가 출력됐다. 이번 원격 임베딩·외부 판정/모의 UI 범위는 통과했으나 개발용 torch/transformers 로컬 모델 경로는 검증하지 않았다.

실제 유료 AI 호출, 실제 모델의 품질/오류 누락률/토큰/실행시간 비교는 이번 병합 검증에 포함하지 않았다. 기존 전체 UI 스모크의 편집기 계약 갱신은 남아 있다. 테스트 스크린샷·임시 DB·설치 의존성은 커밋 대상에서 제외했다.

### 카드뉴스 UI 재실행 (PowerShell)

```powershell
# playwright가 별도 설치되어 있으면 그 모듈 경로를 지정한다.
$env:PLAYWRIGHT_MODULE = 'C:\Users\504-24\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:UI_SMOKE_FOCUS = 'card-news'
npm run test:ui
```

`UI_SMOKE_FOCUS`를 설정하지 않으면 기존 전체 시나리오가 실행된다. 검증된 동일 범위는 추가 소스 변경 없이 반복하지 않았다.
