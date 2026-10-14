# 콘텐츠 변환 고정본 근거 보조: 연결 계약 제안

> **현재 코드 기준 적용 순서:** [개정 실행 계획](CONTENT_TRANSFORM_SEARCH_EXECUTION_PLAN_CURRENT_2026-10-14.md)을 먼저 본다. 본문의 `locateSnapshotQuotes` 등은 아직 팀 Core의 합의된 API가 아니다. 현재 B0는 플랫폼 영역에서 원문 위치를 UTF-16 좌표로 계산해 `evidence_context`로 두 검수에 전달한다. Core 고정본 색인·의미 검색(B1), 제안된 `evidence_assist` 전달 계약은 구현되지 않았다.

작성일: 2026-10-14 (Asia/Seoul)  
상태: **미구현·미합의 계약 초안**

[비교 실험안](CONTENT_TRANSFORM_SEARCH_EXPERIMENT_2026-10-14.md)을 위한 별도 문서다. 아래 이름은 논의용 작업명이며 현재 Core 메서드·HTTP 라우트·IPC 도구·DB 테이블로 존재하지 않는다. 기존 `/api/platform/*`, 고정본·UUID·해시·저장·세션·자료 색인 계약을 바꾸지 않는다. 이번 작업은 문서 작성만 수행한다.

## 1. 기존 경계와 추가가 필요한 경계

| 영역 | 현재 존재 | 제안/미정 |
| --- | --- | --- |
| 기사 고정본 | `create_snapshot`, `get_snapshot`, `PlatformManager._from_snapshot` | 같은 고정본의 검색용 자료 표현을 읽는 어댑터 |
| 구절 검사 | 원문 부분문자열 확인, 배분표 본문 인용 확인 | 정규화 문자열에서 원문 위치로 역매핑하고 인접 문맥 반환 |
| 근거 검색 | 호출자가 제공하는 청크의 `rank_chunks`, Qwen 벡터 캐시, DenseFly/BM25/RRF | 고정본→청크/위치/버전 매핑, 준비 상태·소유권·재사용 관리 |
| 플랫폼 검수 | 전체 article/draft/rules로 사실→편집 검수 | 별도 보조 입력을 태그하여 전달하는 실험 어댑터 |
| 호출/토큰 계측 | AI 원본 응답·프록시 호출 경로 | 격리 실험 trace와 사용량 수집; 제품 UI 응답을 임의 확장하지 않음 |

담당 경계 제안: 팀 Core는 고정본 조회·격리·색인 수명·HTTP/IPC 연결, 플랫폼 영역은 대상 필드 선택·보조 입력 해석·기존 출력/검수 유지, 실험 담당은 정답·계측·평가를 맡는다. 사람이나 팀에 실제 업무를 배정·통보한 것은 아니다.

## 2. 반드시 유지할 불변 조건

- 검색 대상은 `resource_type=article_snapshot`과 실제 `snapshot_id`다. 임의의 현재 본문을 같은 ID에 덮어쓰지 않는다.
- 요청의 기사·고정본·사용자/워크스페이스 소유권을 기존 Core 경계에서 확인한다. 다른 자료/기사·다른 세션을 검색 결과에 섞지 않는다.
- 고정본을 Source로 변환해 `sources`에 몰래 등록하거나 `source_id` 필드를 고정본용으로 재사용하지 않는다.
- 기존 `content_hash(title, body_html)` 레시피와 UUID, UPDATE/DELETE 방지 트리거를 유지한다. 검색용 텍스트 해시는 별도 필드다.
- 원문은 현재 플랫폼 입력과 같은 `title`/`body_text`다. title/body를 별도 필드로 보존한다. 부제·URL은 검색 사실 근거에 포함하지 않는 초기 정책으로 고정하고 필요하면 별도 정책 버전으로 논의한다.
- 검색 후보는 자동 판정·자동 수정·새 `source_evidence`가 아니다. 잘못된 인용·누락 오류를 검색 결과로 덮지 않는다.
- 전체 원문·전체 생성 결과·전체 해당 플랫폼 규칙·사용자 조건·카드 배분표는 최종 검수에서 유지한다.
- 외부 서비스에는 Core/백엔드가 호출하며 UI나 Node에 제공사 운영 키를 전달하지 않는다.

## 3. 제안 작업 A: 원문 구절 위치·문맥 조회

논의용 이름: `locateSnapshotQuotes` — 코드 검사/문맥 조립이며 의미 검색이나 LLM 판정이 아니다.

입력 필드:

| 필드 | 의미 |
| --- | --- |
| `contract_version` | 제안 `snapshot-evidence-v1` |
| `snapshot_id`, `article_id` | 실제 고정본 및 예상 기사 ID. 기사 ID는 Core가 고정본과 대조 |
| `expected_content_hash` | 기존 고정본 해시 일치 확인 |
| `items[]` | `item_id`, `platform`, `draft_field_path`, `claim_text`, `quote_texts[]` |
| `context_policy` | 해당 문단 + 앞/뒤 문단 수; 개발용 시험 후 버전 고정 |

출력 필드:

- 검증된 `snapshot_id`, `article_id`, `snapshot_content_hash`, 별도 `search_text_hash`, `normalization_version`.
- 각 `item_id`와 구절별 `match_state=matched|not_found|ambiguous`, 모든 발생 위치 또는 생략이 명시된 목록.
- `source_field=title|body_text`, 원문 `start/end`, 원문 그대로의 `quote_text`, 주변 문맥의 별도 `context_start/end/text`.
- `candidate_truncated`, `context_complete`와 부족 이유. 제목에서만 찾았으면 `body_match=false`를 명시.

공백 정규화는 현재 존재 검사와 맞추되 정규화 문자열 offset을 원문 offset인 것처럼 반환하지 않는다. 원문 기준 좌표는 **Unicode code point, start 포함/end 제외**를 제안한다. Python과 JS의 UTF-16 차이를 어댑터에서 변환하고 이모지·줄바꿈·반복 문장으로 검증한다. 원문 위치를 증명할 수 없으면 `span_unavailable`을 반환하며 유사 문구를 정확한 인용으로 표시하지 않는다.

주변 문맥은 복수 문단을 반환해도 근거 문자열 하나로 이어 붙이지 않는다. 각 구절이 원문 연속 부분임을 검증할 수 있게 별도 span으로 유지한다. 모든 일치 위치를 찾는 내부 목록과 AI에 넣는 예산 제한 목록을 구분한다.

## 4. 제안 작업 B: 고정본 의미 색인 준비

논의용 이름: `prepareSnapshotEvidenceIndex` — 새 상태 조회/색인 준비 경계이며 기존 Source 색인 호출을 대체하지 않는다.

입력: 작업 A와 같은 고정본 참조 + `index_profile` + 실험용 `trace_id`. Core가 원문을 읽고 검증하며 호출자가 다른 텍스트를 섞지 않는다.

출력 제안:

```json
{
  "contract_version": "snapshot-evidence-v1",
  "resource_type": "article_snapshot",
  "snapshot_id": "<existing snapshot UUID>",
  "article_id": "<existing article ID>",
  "snapshot_content_hash": "<existing hash>",
  "search_text_hash": "<separate hash>",
  "index_ref": "<opaque reference>",
  "state": "ready",
  "chunk_count": 0,
  "index_profile_version": "<agreed version>",
  "embedding_space_id": "<model/role/normalization identity>",
  "document_cache_hits": 0,
  "document_cache_misses": 0,
  "job_ref": null
}
```

JSON는 형식 예시이며 값은 실제 실행 결과가 아니다. 상태 제안은 `absent|preparing|ready|failed|cancelled|unsupported`. 요청이 즉시 끝나지 않으면 진행 조회·취소 계약을 별도로 정한다. 검색 색인 실패를 기사 저장 실패로 바꾸지 않는다. `ready`는 내용/버전/벡터 검증이 완료됐다는 뜻이며 모델 가용성 검사만으로 반환하지 않는다.

### 캐시 식별과 텍스트 정책

- `search_text_hash` 제안 레시피: UTF-8의 공백 없는 정렬 키 JSON `{"body_text":<원문>,"title":<원문>}`의 SHA-256. 원문을 재정리하기 전 값으로 계산하고 레시피를 버전 관리한다.
- 매핑 식별은 소유 범위 + 고정본 참조 + 검색 텍스트 해시 + 청킹/정규화/원문 위치 버전 + 임베딩 공간 ID로 한다. 기존 고정본 해시만으로 검색 준비 완료를 판단하지 않는다.
- 벡터 재사용은 현재 모델·역할·정확한 청크/질의 text 키와 호환할 때 검토한다. 원문 좌표·소유권은 별도 매핑으로 확인한다.
- 본문 근거와 제목·메타데이터 후보를 구분한다. 직접 인용의 발언 근거를 제목만으로 충족시키지 않는다.
- 현행 청킹은 텍스트 정리/합성 메타데이터를 포함할 수 있으므로 검색 text와 원문 span을 분리한다. body 근거는 원문에 대응하는 span이 확인된 후보만 인용으로 쓴다.
- 청크 ordinal/이웃 조회에 본문 순서를 보존한다. 중복 문장을 제거해 원래 발생 위치를 잃지 않는다.
- 서로 다른 임베딩 공간 벡터를 혼합하지 않는다. 원격 모델의 실제 버전 식별 범위는 팀 Core/백엔드가 확인한다.

저장 테이블/마이그레이션, 기존 `embedding_vectors` 재사용 여부, 고정본과 벡터의 참조 수·삭제·계정 전환·백업/복원 정책은 팀 Core 검토 항목이다. 기존 자료 삭제가 공유 벡터를 정리하는 경우 새 고정본 매핑의 참조를 어떻게 보호할지도 논의한다. 이번 문서는 DB 변경을 정하지 않는다. 최초 실험은 운영 저장소와 분리된 폐기 가능한 색인/캐시를 사용한다.

## 5. 제안 작업 C: 고정본 근거 후보 검색

논의용 이름: `searchSnapshotEvidence`. 준비되지 않은 색인을 몰래 생성하며 시간을 숨기지 않는다. 호출자는 준비 여부를 알고 최초 사용 비용을 기록한다.

입력 필드:

| 필드 | 의미 |
| --- | --- |
| 고정본 참조·해시·`index_ref` | 작업 B와 동일 원문·버전 확인 |
| `queries[]` | `item_id`, `platform`, `draft_field_path`, `claim_text`, `existing_quote_spans[]`, `trigger_reason` |
| `retrieval_profile` | 기존 `densefly-bm25-rrf`, k·본문 후보 정책·주변 문맥·입력 예산·버전 |
| `trace_id`, 제한 시간 | 실험 추적·전체 대기 시간 상한 |

질의 목록은 같은 후보 인덱스로 묶고 질의 벡터를 배치 생성한다. 원고당 최대 대상 수와 길이 한도를 계약에서 확정한다. 긴 항목을 조용히 자르지 않고 분할/제외를 명시한다. 모든 조회는 지정 고정본으로 한정한다.

응답 제안:

- 요청과 같은 고정본·검색 텍스트·버전 참조.
- item별 `status=ok|no_candidates|partial|index_not_ready|unavailable`.
- 후보의 `chunk_id`, 본문 ordinal, `source_field`, 원문 span/인용, 앞뒤 문맥 span, `rank`, `cosine_score`, `ranking_engine`.
- `cosine_score`는 의미 유사도이며 확률·팩트 일치율·RRF 점수로 표시하지 않는다. 검색 결과는 지지 또는 반대 근거일 수 있다.
- 중복 제거/예산으로 제외된 후보·질의 수, `context_complete`, 제한 이유, cache hit/miss 및 계측 참조.
- `no_candidates`를 ‘원문에 근거가 없음’ 또는 ‘거짓’으로 확정하지 않는다. A와 같은 전체 원문 검수와 수동 확인을 유지한다.

## 6. 제안 작업 D: 최종 검수 보조 입력

기존 `article`/`draft`/`requirements`/`selected_keywords`와 두 검수 출력 계약은 그대로 둔다. 아래 보조 객체를 **향후 실험 어댑터 내부에서** 전달하는 방안을 제안한다. 실제 `/api/platform/validate` 필드 확장은 아직 합의하지 않는다.

```json
{
  "evidence_assist": {
    "contract_version": "snapshot-evidence-v1",
    "mode": "position_context_or_semantic",
    "snapshot_id": "<same snapshot UUID>",
    "search_text_hash": "<same source hash>",
    "trigger_policy_version": "<fixed test policy>",
    "items": [],
    "context_complete": true
  }
}
```

- 항목은 생성 문장·기존 인용·일치 위치·검색 후보를 구분해 담는다. 정상/오류 정답 라벨과 앞선 비교군의 AI 판단을 넣지 않는다.
- 보조 후보는 독립적인 사실이 아니며 원문 전체 검토를 대신하지 않는다는 지침을 고정한다. 조건·정정·반대 문맥도 확인하도록 한다.
- 근거 추가·교체, 초안 수정, 판정 생략은 자동 수행하지 않는다. 기존 `source_evidence`, 배분표 ID, `generation_review`, `validation_review`를 덮어쓰지 않는다.
- 사실→편집/요구사항 순서와 중복 지적 방지 관계를 유지한다. 검색 대상마다 추가 판정 API를 호출하지 않는다.
- 입력이 없거나 검색 실패이면 기존 최종 검수로 돌아간다. 실패를 숨기지 않고 상태·소요시간·호출 수를 실험 로그에 남긴다.

## 7. 관찰용 계약: 호출·사용량·시간

별도 실험 로그로 `trace_id`, 상위 단계, 요청 종류, 요청/실제 모델, 성공/실패/재시도, monotonic 시작/종료, 원본 `usage`를 연결한다. Node→Core 브리지의 요청 ID를 기사/고정본/실험 단계와 매핑한다. JSON 결과 파싱에서 떨어지는 AI 사용량을 실험 기록 장치가 수집하되 운영 출력 계약은 변경하지 않는다.

임베딩 문서와 질의 호출을 구분하고 캐시 미스 개수와 실제 네트워크 배치 수를 모두 남긴다. 공급자가 토큰을 반환하지 않으면 값은 null이며 추정치와 분리한다. 토큰 합계가 캐시·추론 토큰을 중복 계산하지 않도록 원본 응답의 정의도 기록한다.

로그에는 운영키·JWT·사용자 전체 본문을 기본 포함하지 않는다. 평가용 원문/초안은 허용된 격리 자료 묶음에 보관하고 로그는 식별자·해시·필요 지표를 참조한다.

## 8. 오류·일관성 및 향후 계약 검증 항목

제안 오류 분류: `SNAPSHOT_NOT_FOUND`, `SNAPSHOT_SCOPE_MISMATCH`, `SNAPSHOT_HASH_MISMATCH`, `INDEX_NOT_READY`, `INDEX_VERSION_MISMATCH`, `EMBEDDING_UNAVAILABLE`, `SEARCH_TIMEOUT`, `CANCELLED`, `SPAN_UNAVAILABLE`. 기존 팀 오류 코드를 바꾸지 않으며 실제 명명/HTTP 상태/IPC 표현은 팀 Core가 결정한다.

- 기사 전환·원문/조건 수정·세션 변경 후 이전 검색 결과를 새 검수에 적용하지 않는다.
- 취소/시간 초과/네트워크 오류에서도 저장 원고·고정본·이미지·기존 검수 상태를 손상시키지 않는다.
- 준비 작업의 멱등성·동시 요청·대기 취소·캐시 버전 불일치를 검증한다.
- 동일 구절 여러 발생, 제목에만 있는 인용, 반복 문단, 이모지/Unicode/CRLF, 청킹 정규화로 달라진 원문, 다른 고정본·계정 결과 혼입을 검증한다.
- 검색이 누락하거나 잘못된 후보를 반환했을 때 전체 검수 유지와 불완전 상태 표시를 검증한다.
- HTTP와 IPC의 같은 의미/ID/오류 계약을 확인한다. 기존 API-boundary 검사와 팀 Core 테스트·기존 플랫폼 테스트는 구현 변경이 발생하는 향후 단계의 회귀 기준이다.

## 9. 합의가 필요한 사항

고정본 자료 어댑터, 원문 좌표·정규화 기준, 청크 매핑 수명과 공유 벡터 참조, 최초 색인 시점/대기 정책, 질의 발동·k·문맥 예산, 보조 입력 전달 위치, 사용량 계측, 제공사로 나가는 텍스트 범위를 합의해야 한다. 계약 합의·실험용 구현·실계정 평가·제품 연결은 각각 별도 단계이며 이번 문서 작성으로 수행된 것으로 취급하지 않는다.
