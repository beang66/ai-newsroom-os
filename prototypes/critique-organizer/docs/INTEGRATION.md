# 팀 통합 가이드 — API 2.4

자동 정리·3D Explore의 새 엔드포인트, 자료 모델과 제한은 [ORGANIZER-v0.4.md](ORGANIZER-v0.4.md)를 확인하세요. 기존 Critique 계약은 아래와 같이 유지합니다.

## 책임과 연결 지점

- `critique.py`: 7개 영역의 순수 규칙 검사. 네트워크/저장소 접근 없이 Finding과 검사 한계를 반환합니다.
- `review.py`: 규칙 기반 문장 유형 추정 + 검색/판정 조정. SQLite와 HTTP를 import하지 않습니다.
- `contracts.py`: `Retriever`, `Judge`, `ReviewRepository` 세 Protocol 및 Candidate/Assessment 데이터 계약.
- `retrieval.py`: 기본 키워드 검색 어댑터. 팀 RAG 구현으로 교체하는 위치입니다.
- `openai_adapter.py`: OpenAI Responses API 어댑터. 키와 호출은 서버에만 있습니다.
- `model_proofread.py`: `use_openai` 요청 때 맞춤법 제안의 정확한 원문 위치·겹침·인용을 검증합니다.
- `config.py`: 로컬 실행 시 `.env`를 읽습니다. 프로세스 환경 변수가 우선합니다.
- `store.py`: 원본 파일, 추출 블록, 이름 후보, 검토 결과 저장과 삭제 정책.
- `server.py`: 로컬 미리보기용 HTTP 및 의존성 조립. 팀 API에 통합할 때 인증/권한이 있는 라우터로 교체합니다.
- `web/`: 독립 데모 UI. 전역 DOM/CSS를 사용하는 페이지이므로 기존 React 페이지에 파일 그대로 섞지 말고 `docs/contracts.d.ts`를 이용해 팀의 컴포넌트에서 API를 호출하세요.

## RAG 교체 예시

```python
from app.contracts import Candidate
from app.review import analyze

class TeamRetriever:
    def retrieve(self, query: str, limit: int = 4) -> list[Candidate]:
        # 팀 RAG 결과를 Candidate로 변환해 반환합니다.
        # excerpt는 원문 일부 그대로, start/end는 원문 블록의 코드포인트 위치입니다.
        # 원본과 블록을 공통 저장소에 먼저 등록해야 합니다.
        # 검색 점수는 사실 확률이 아닙니다.
        raise NotImplementedError('팀 RAG 연결 지점')
```

기본 SQLite 저장소는 후보의 document_version, block_id, locator, start/end 및 excerpt가 실제 원문과 일치하지 않으면 검토 결과 저장을 거부합니다. 자체 저장소로 교체할 때도 같은 검증과 트랜잭션 정책을 구현해야 합니다.

외부 URL·팀 STT 결과를 그대로 Candidate에 꾸며 넣지 마세요. 수집 시각·원출처·원본 사본·블록 위치를 등록하는 어댑터를 먼저 구현하세요. 현재 번들에는 웹 검색과 STT 연결은 없습니다.

## 요청

`POST /api/reviews`

```json
{"article_id":"news-42","article_version":3,"article":"기사 본문","title":"제목","source_document_ids":[],"glossary":[{"canonical":"국립국어원","variants":["국립국어언"]}],"use_openai":false}
```

`source_document_ids`에 등록 자료 ID를 명시합니다. 생략하거나 빈 배열이면 기사 내부만 점검합니다. 제목은 500자, 표기 기준은 100개, 비교 자료는 200개 이내입니다.

본문·제목·표기 기준·자료 선택·모델 설정이 바뀔 때마다 버전을 올립니다. 응답이 도착했을 때 요청 당시 버전·현재 본문·자료 revision을 확인하고, 바뀌었으면 결과를 표시하지 않습니다. 데모는 원고 입력과 자료 변경에서 결과를 비우고 이전 요청을 취소합니다. 서버가 이미 받은 요청은 계속 처리될 수 있으나, 자료 변경이 일어나면 commit 시점에 거부합니다.

문장/후보 offsets는 Unicode 코드포인트 기준입니다. JavaScript의 문자열 `.slice()`는 UTF-16 기준이므로 `Array.from(text)`를 사용하세요.

## 출처 관계와 상태

- `retrieval_candidate`: 검색에 걸린 문서 발췌. 아직 근거로 확정하지 않았습니다.
- `assessment.relation`: 해당 발췌와 문장 사이의 모델 판단입니다. 웹에서 사실임을 검증했다는 뜻이 아닙니다.
- `claims[].status`는 하위 호환용 `review_required` 메타데이터입니다. 이것을 UI 필수 확인 목록으로 사용하지 마세요. 새 UI는 `findings[]`만 표시합니다.
- `findings[].status`는 `open/acknowledged/later`입니다. `summary`는 원래 발견 건수이며, 남은 수는 acknowledged를 제외해 계산합니다.
- `completion=check_finished`는 제한 규칙 실행 종료입니다. `publication_blocked=false`이며 전체 사실 검증 통과를 의미하지 않습니다.
- `checks[]`의 검사 한계와 후보 비교 범위를 반드시 표시하세요. 후보 비교 성공은 자료 전체 검증이 아닙니다.
- 문장당 검색 후보 최대 4개, 모델 평가 최대 12쌍/요청. 초과 및 시간 제한은 `skipped`로 남기고 `coverage`에서 합산합니다.
- OpenAI 요청은 기본 8초 timeout, 시작 후 30초 예산 검사입니다. 이미 시작된 1회의 전송/응답 읽기가 끝나는 시간까지 추가 지연될 수 있으며, 엄격한 전체 요청 마감 시간 보장은 아닙니다.
- `contradicts`는 모델 판단으로 표시한 비교 후보를 만듭니다. 관계 판단 충돌은 `claims[].flags`에도 남습니다. 출처의 독립성·신뢰성 판단은 포함하지 않습니다.

## 맞춤법과 항목 상태 API

`POST /api/organization/suggest`: `{document_id}` → 적용 전 제안 `{document_type,tags,summary,base_revision,scope}`. 기자가 버튼을 누를 때 해당 문서의 처음 12블록, 블록당 500자, 합계 최대 6,000자만 전송합니다. 원문을 이동하거나 자동 승인하지 않습니다. 적용은 `POST /api/organization`의 `revision`으로 경쟁 갱신을 막고 발췌 위치를 서버에서 재검증합니다. 팀의 권한 라우터에 통합할 때 두 엔드포인트 모두 문서 접근 권한을 검사해야 합니다.

`POST /api/proofread`: `{article, title?, glossary?}` → `{findings, scope:"eight_rules_only"}`. 저장이나 외부 호출 없이 8개 규칙을 실행합니다. 빈 본문도 허용합니다. 데모는 750ms debounce와 버전 검사로 오래된 밑줄을 폐기합니다.

`POST /api/openai/check`: `{}` → `{status,reason}`. 기자가 누르는 연결 확인 버튼으로 실제 최소 요청을 보내며 API 사용량이 발생할 수 있습니다. `GET /api/health`의 `openai_connection`은 서버 실행 이후 요청의 마지막 상태로, 시작 시 `not_tested`입니다. 키 설정과 성공을 구분합니다. 오류 사유는 안전한 분류값만 노출합니다.

`POST /api/reviews`의 `use_openai=true`는 제목·본문 전체의 맞춤법 제안도 명시적으로 요청합니다. 후보가 없어도 요청합니다. 제안은 최대 30건이고 원문과 Unicode 위치가 정확히 일치해야 하며, 인용·인명·표준명·기존 규칙과 겹치면 제외합니다. `model_proofreading.state`가 `unavailable`이면 기본 8개 규칙만 완료된 것이므로 UI에서 실패를 숨기지 마세요. 자동 입력 중 `/api/proofread`는 로컬 규칙만 유지합니다.

`POST /api/finding-status`: `{review_id, finding_id, status, input_hash}` → `{review_id, finding_id, status}`. 저장된 결과와 입력 해시 및 자료 revision이 일치해야 합니다. 사유 입력은 없으며, 새 점검에는 확인 상태를 이월하지 않습니다. 원고 변경 여부 자체는 호출자가 버전으로 검증해야 합니다. 해시는 인증 토큰이 아닙니다.

`Finding.replacement=null`이면 수정 버튼을 만들지 마세요. 값이 있을 때도 적용 전 현재 입력 버전과 anchor의 텍스트를 비교합니다. `related_anchors`는 기사 안 비교 위치, `evidence`는 저장 자료의 정확한 발췌입니다. 인용 안의 맞춤법 후보와 인명·직책은 일괄 교정하지 않습니다.

## 원본과 삭제

`GET /api/documents/:id`는 모든 추출 블록과 처리 범위를 반환합니다. `GET /api/documents/:id/original`은 업로드 원본 사본을 다운로드합니다.

`DELETE /api/documents/:id`는 원본·블록·관계·그 자료를 선택했거나 후보로 포함한 검토 결과 전체를 하나의 트랜잭션으로 삭제합니다. 동일 검토에 포함된 다른 출처의 발췌도 해당 검토 기록과 함께 삭제됩니다. 아직 저장하지 않은 검토는 corpus revision 검사로 저장을 막습니다. 이미 내려받은 사본, 사용자가 붙여넣은 기사 초안, DB 외부 백업은 이 삭제의 대상이 아닙니다.

## 기존 v0.1 자료

기존 `data/newsroom.sqlite3`는 읽거나 수정하지 않습니다. v0.2/v0.3은 `data/newsroom-v2.sqlite3`를 사용하며 스키마 2를 유지합니다. v0.2의 기존 자료는 그대로 사용할 수 있지만 새 검사 항목은 다시 점검해 생성해야 합니다. v0.1에는 원본과 페이지 위치가 없으므로 검증되지 않은 위치를 생성하는 자동 마이그레이션을 하지 않습니다. 기존 원본을 다시 업로드하세요. 환경 변수로 구 DB를 지정하면 명시적으로 실행을 거부합니다.

## 서비스 배포 전에 필요한 별도 작업

이 번들은 단일 사용자 로컬 개발용입니다. 인증·workspace_id 기반 자료 접근·다운로드 권한·작업 큐·배포 환경 보안과 보관 정책이 없는 상태로 팀 서버에 공개하지 마세요. 현재 HTTP 서버는 127.0.0.1에만 바인딩하며 외부 Origin과 잘못된 Host를 거부합니다. DB에는 취재자료 원본이 평문으로 저장됩니다.
