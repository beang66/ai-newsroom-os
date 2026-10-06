# 팀 통합 전달서 — 기사 작성 기능 v30

## 이번 변경의 기준

받은 6개 문서 v0.8 및 OpenAPI `info.version=0.8.1` 적용. 현재 문서는 팀 검토안이며 최종 v1.0 확정본이 아님. App Core를 기준으로 기존 기능에 어댑터를 붙이는 방식 채택.

**독립 앱 내부 저장 형식과 팀 전달 객체를 구분.** 기존 SQLite의 32자리 ID·사진 저장·버전 복원은 유지하고, Core로 보낼 때 canonical UUID와 객체로 변환. 공통 DB에는 접속·수정하지 않음.

## 객체 대응

| 기존 기능 값 | 공통 규격 | 반영 |
|---|---|---|
| `articleId` | `Article.id` | 새 기사 UUID v4. 기존 원고 UUID v5 변환에 팀 namespace 필요 |
| 원고 제목·본문 | `ArticleRevision.title`, `body_html`, `body_text` | 서식·문단 유지, 삭제선·사진 설명을 본문 텍스트에서 제외 |
| 제목 HTML·부제·확정 상태·이미지 편집 상태 | `ArticleRevision.editor_state` | 기존 UI 상태 보존, 신규 공통 컬럼 임의 추가 없음 |
| 버전 파일 ID·번호 | `ArticleRevision.id`, `revision_no` | 복구용 내부 백업은 사용자 revision으로 변환하지 않음 |
| 분석용 고정 본문 | `ArticleSnapshot` | `createSnapshot({revision_id})` named method 연결 제공. Snapshot 생성·불변 저장은 Core 소유 |
| 본문 사진 | `MediaAsset` | 공유 asset ID 참조, `editor_state.media_asset_ids`에 ID 목록 |
| 작업 상태 | `queued/running/succeeded/failed/cancelled` | 공통 상수 사용 |

원래 기사 ID는 `Article.legacy_id`, revision의 `editor_state.legacy_article_id`로 보존. UI 안 `articleId`는 이전 저장 코드와의 호환을 위해 32자리 값으로 유지. **그 값을 공통 DB PK로 직접 저장하면 안 됨.**

`photo_to_media`는 저장된 사진 참조만 변환. base64 이미지·localhost URL은 공통 식별자로 등록하지 않음. 실제 사진 바이트 저장과 MediaAsset 등록은 Core Media Repository가 담당. 사진 출처·crop·모자이크는 기존 편집 상태에 보존하되, 팀 공식 MediaAsset 필드로 확장할지는 별도 합의 필요.

## ID 적용

새 기사에서는 브라우저 `crypto.randomUUID()`의 UUID v4를 `core_context.article_id`에 유지. Core가 기사 생성·조회 흐름을 관리할 때는 Core에서 전달한 ID를 우선 사용.

기존 데이터 변환 예시:

```python
from integration.core_contract import draft_to_article, revision_input

# 실제 팀 값 전달. 예제용 namespace나 임의 기본값 사용 금지.
article = draft_to_article(draft, workspace_id, namespace=team_namespace_uuid)
revision_payload = revision_input(draft, expected_revision_no=current_revision_no)
```

변환 이름: `app-core:article:기존ID`, `app-core:revision:기존ID`, `app-core:media_asset:기존ID`. 동일 namespace·이름이면 항상 같은 UUID v5. 기사·revision·snapshot·media ID는 서로 다른 객체의 ID.

## 프론트 연결

```javascript
import {
  createCoreClient,
  createWorkspaceCoreAdapter,
  fromCoreRevision,
} from './assets/api.js';

// article과 revision은 Core의 원고 열기 흐름에서 제공.
const client = createCoreClient({
  ipc: window.pywebview?.api || null,
  // 브라우저 HTTP 테스트에서는 인증 토큰을 Core 로그인 흐름에서 전달.
  token: accessToken,
});
const adapter = createWorkspaceCoreAdapter({
  client,
  workspaceId: article.workspace_id,
  extensions: coreFeatureExtensions,
});
const editor = document.querySelector('article-workspace');
editor.coreAdapter = adapter;
editor.value = fromCoreRevision(article, revision);
```

`accessToken`, `article`, `revision`, `coreFeatureExtensions`는 팀 Core가 제공해야 하는 실제 값. 예시의 변수명이 있다고 해당 연결이 완성된 것은 아님.

React에서는 동일 adapter를 `coreAdapter` prop으로 전달. `draftKey`는 기사마다 별도로 사용해 브라우저 임시 원고가 섞이지 않도록 지정.

## 이미 정의된 Core named method

`getArticle`, `saveArticle`, `createSnapshot`, `registerMediaAsset`, `getMediaAsset`, `getJob`, `cancelJob`.

HTTP base `/api/core/v0.8`. named method의 payload는 HTTP와 pywebview IPC 모두 동일:

```javascript
await client.saveArticle({
  workspace_id,
  article_id,
  input: {
    title,
    body_html,
    body_text,
    editor_state,
    expected_revision_no,
  },
});
await client.createSnapshot({
  workspace_id,
  article_id,
  input: { revision_id },
});
```

편집 중 저장 응답이 도착해도 최신 입력은 유지하며, 다음 저장의 `expected_revision_no`는 방금 성공한 revision으로 갱신. Core의 409 충돌·공통 error envelope를 UI 오류로 전달. HTTP 오류와 IPC의 `{error:...}` 모두 동일하게 처리.

## 아직 계약에 없는 기능 — Core 담당과 연결 합의 필요

| adapter 확장 슬롯 | Core 담당이 연결할 기능 |
|---|---|
| `prepareDraft(draft)` | 원본·편집본 사진 바이트 저장, MediaAsset 등록, 사진별 `core_context.media_asset_id` 연결 |
| `savedContentHash({revision,draft})` | Core 버전 복원의 낙관적 동시성 검사에 쓰는 저장 hash 반환. 기존 snapshot hash와 같은 정의 필요 |
| `versionHistory(context)` | 버전 목록·읽기·복원·복구용 백업. 기존 UI 응답 형식을 Core 객체로 연결 |
| `assistArticle(context)` | 제목·부제·요약·사진 검색어 AI 요청 |
| `mediaTools(context)` | Unsplash 검색·다운로드 추적 등 JSON 응답 |
| `fetchPhoto({workspace_id,id})` | 선택한 Unsplash 사진의 바이트 Response 반환. 브라우저/IPC 간 blob 변환 포함 |

`context` = `{workspace_id,article_id,revision_id,path,payload}`. `path`는 기존 기능 요청을 구분하는 어댑터 내부 값이며 신규 공식 endpoint가 아님. 기존 서버에는 기능 구현이 있지만 Core는 이 경계에 자신의 저장·인증·named method를 연결해야 함.

OpenAPI에는 버전 목록/복원·AI assist·파일 업로드 세부 API가 없음. 임의로 `headline_generation` Job 타입을 추가하거나 기존 `verification` 타입을 대신 쓰지 않음. 보완 계약은 담당자 합의 후 확정 필요.

## DB 전달

- 현재 `.article-workspace/workspace.db`는 독립 앱의 로컬 SQLite. 개인 원고 폴더 전체로 백업.
- 팀 통합 후 Core Local Storage Repository를 원본 저장소로 사용. 별도 공식 DB 테이블·클라우드 기사 본문 저장소 생성 없음.
- 이전 SQLite를 삭제하거나 전체 재작성하지 않음. 기존 데이터는 namespace 확정 후 변환·복사하는 별도 이관 작업 필요.
- `test-user-001`은 독립 앱 테스트 사용자. Core 모드에서 인증 사용자·권한·workspace 범위를 Core가 확인해야 함. UI의 사용자 ID 전달을 인증으로 취급하지 않음.
- 제공 파일은 팀 GitHub나 실제 Core 브랜치에 자동 반영되지 않음. 담당자 코드 리뷰 후 해당 파일의 변경을 통합.

## ONNX 모델 연동

`onnx_models.py` 로더와 모델 bundle을 Core AI 서비스에서 재사용 가능. 기존 `generate_headline_drafts`, `generate_subtitle_drafts` 함수는 생성 옵션을 유지하고 선택한 runtime만 변경. KoBART는 부제와 요약에서 같은 bundle 재사용.

ONNX는 추론 실행 형식. 다른 팀원의 모델과 가중치를 합치는 형식이 아니며, 모델별 토크나이저·입출력 의미·후처리는 유지해야 함. 두 모델은 encoder/decoder/cache decoder 3개 그래프로 제공. 단일 `.onnx` 파일로 가정하지 말 것.

변환 결과는 원본과의 수치·토큰 비교 자료 포함. 원 모델의 사실 오류나 번역투를 개선한 결과는 아니므로 기존 OpenAI 교열·원문 검증 유지.
