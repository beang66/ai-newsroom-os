# 코어가 구현하는 7개 메서드 합의 문서 (v0.8, 2026-10-07 기준 구현 현황)

대상: su4228 어댑터(`integration/core_contract.py`, `assets/api.js`의 `createCoreClient`)가 부르는 이름이 붙은 메서드 7개.
결정 d2: 경로는 우리 코어의 `/api/*`를 유지하고, 계약 경로(`/api/core/v0.8/*`, `workspaces/{workspace_id}/...`)는 어댑터가 흡수한다.
이 문서는 **실제로 구현된 것**만 적는다. 구현 전인 것은 "예정"으로 표시한다.

## 한눈에

| 메서드 | 코어 경로 (HTTP, 지금) | 상태 |
|---|---|---|
| `getArticle` | `GET /api/articles/latest` (가장 최근), `GET /api/articles` (목록) | **부분**: id로 한 건 읽기 `GET /api/articles/<id>` **예정** |
| `saveArticle` | `POST /api/articles/save` | 구현됨 (`expectedRevisionNo` → 409) |
| `createSnapshot` | `POST /api/articles/<id>/snapshots` | 구현됨 |
| `registerMediaAsset` | `POST /api/media-assets` | 구현됨 (이미지만) |
| `getMediaAsset` | `GET /api/media-assets/<uuid>` (+ `/file` 바이트) | 구현됨 |
| `getJob` | `GET /api/jobs/<uuid>` | 구현됨 (기존 기능은 아직 연결 안 됨) |
| `cancelJob` | `POST /api/jobs/<uuid>/cancel` | 구현됨 |

추가로 만든 것(계약의 보조 기능): 저장 이력 `GET /api/articles/<id>/revisions[/<n>]`·`POST .../<n>/restore`, 고정본 목록·조회 `GET /api/articles/<id>/snapshots`·`GET /api/snapshots/<uuid>`,
자료 `GET /api/sources`·`GET /api/sources/<id>`·`POST /api/sources/<id>/delete`, 읽기 모델 `GET /api/knowledge-map`.

## 공통 규칙

- **워크스페이스는 하나**다(`vault.WORKSPACE_ID`). 계약 경로의 `workspace_id`는 어댑터가 떼어 낸다.
- **id**: 코어 저장·경로는 하이픈 없는 32자리 hex(UUID), 응답의 계약 객체는 하이픈 UUID(`uuid_text`). 규칙은 `docs/IDS.md`.
  - **예정**: 경로의 기사 id가 하이픈 UUID로 와도 받도록 라우트를 넓힌다(어댑터가 UUID로 부르기 때문).
- **오류 본문**: `{"error": "<한국어 문장>", "code"?: "<기계용 코드>", "details"?: {...}}` — 화면이 `error` 문자열을 읽기 때문에 계약의 중첩 `ErrorEnvelope`(`{error:{code,message,retryable}}`) 대신 평평한 모양이다.
  어댑터는 `error`→`message`, `code`→`code`로 옮기면 된다. 코드: `REVISION_CONFLICT`(409), `NOT_FOUND`(404), `SOURCE_IN_USE`(409).
- **성공 상태 코드**: 코어는 생성도 200을 돌려준다(계약은 201). 어댑터가 201로 취급하면 된다.
- 모든 POST는 같은 출처(Origin)·JSON(`Content-Type`)·크기 검사를 거친다.

## 메서드별

### saveArticle
- 요청: `{"draft": {...}, "expectedRevisionNo"?: 정수 >= 0}` (`0` = 아직 없어야 함). 응답: `{saved, articleId, revisionNo, fileName, folder}`.
- `expectedRevisionNo`가 지금 최신 번호와 다르면 409 `REVISION_CONFLICT`, 아무것도 저장하지 않는다. 안 보내면 예전처럼 저장.
- 내용이 직전 저장본과 같으면 이력을 늘리지 않는다. 기사당 최근 200개만 보관(고정본은 영향 없음).
- 계약의 `ArticleRevisionInput`(`title`, `body_html`, `body_text`, `editor_state`)과 코어의 `draft`는 모양이 다르다 → 어댑터의 `revision_input`/`revision_to_draft`가 변환(su4228 코드 그대로 사용).

### getArticle
- `GET /api/articles/latest` → `{draft}`(가장 최근 저장한 기사), `GET /api/articles` → 목록(`id`, 제목, 상태, 저장 횟수, 쓰는 자료 id).
  - `?photos=ref` 를 붙이면 사진(`photos[].data`·`original`)을 data URL 로 풀지 않고 `media:<32hex>` 참조로 준다. 바이트는 `GET /api/media/<32hex>`(→ 이미지 바이트, 형식은 Content-Type). 앱 화면은 이 방식으로 받는다(사진 몇 장이면 응답이 수십 MB 가 되던 것을 피함).
  - 저장(`POST /api/articles/save`)도 사진 자리에 `media:<id>` 참조를 받는다 — 앱 화면은 새 사진을 `registerMediaAsset` 로 한 번 올린 뒤 참조만 보낸다.
- 개정본: `GET /api/articles/<id>/revisions` (목록), `.../<n>` (미리보기). 개정본의 `id`는 `revision_uuid(기사 hex, 번호)`(UUID v5).

### createSnapshot
- 요청: `POST /api/articles/<id>/snapshots` 본문 `{"revisionId"?: "<개정본 uuid>"}` (없으면 최신). 응답: `{id, workspace_id, article_id, revision_id, revision_no, title, body_html, body_text, content_hash, created_at}`.
- 고정본은 **자기 본문 사본**을 가지며 수정·삭제할 수 없다(DB 트리거로 막음). 같은 기사·개정본·내용이면 기존 고정본을 돌려준다.
- `content_hash` = `sha256(json.dumps({"body_html":…, "title":…}, ensure_ascii=False, sort_keys=True, separators=(",",":")))`.
- 고정본을 입력으로 쓰는 곳: 팩트체크(`snapshotId` → 응답에 그대로 싣기), 플랫폼 키워드·생성(`snapshotId` → 고정본 제목·본문으로 생성).

### registerMediaAsset / getMediaAsset
- 요청: `{"kind":"image", "mime_type":"image/png|jpeg|webp|gif", "data":"data:...;base64,...", "filename"?, "caption"?, "generated"?}` 또는 `data` 대신 `"object_ref":"media:<hex>"`(이미 저장된 사진).
- 같은 바이트면 같은 자산(id = 사진의 UUID)이다. 다시 등록해도 `caption`·`filename`(사진의 기본 설명)은 처음 값을 유지하고 비어 있을 때만 채운다. `generated`(AI 생성)는 한번 켜지면 꺼지지 않는다.
- 기사마다 다른 설명은 원고의 `photos[].caption` 에 있고, 응답의 `usages` 가 각 기사 최신 저장본에서 읽어 준다.
- 응답: `{id, workspace_id, kind, object_ref, mime_type, filename, caption, generated, byte_size, local_uri, created_at, usages:[{articleId, title, photoId, caption}]}`.
- 계약과의 차이: 바이트를 `data`로 함께 보낼 수 있다(코어가 암호화 저장소에 보관). 영상·오디오는 아직 받지 않는다.

### getJob / cancelJob
- `GET /api/jobs/<uuid>` → `{id, workspace_id, type, status, progress, input_ref, output_ref, error, created_at}` + 시작·끝난 뒤에만 `started_at`, `completed_at`. 상태: `queued`·`running`·`succeeded`·`failed`·`cancelled`.
- `POST /api/jobs/<uuid>/cancel`: 대기 중이면 바로 취소, 실행 중이면 취소 요청을 기록하고 작업이 확인하면 `cancelled`. 이미 끝난 작업은 409.
- 앱 시작 때 이전 실행에서 남은 대기·실행 중 작업은 `INTERRUPTED`로 실패 처리. 팩트체크·변환·전사·모델 설치를 이 레지스트리에 연결하는 일은 아직 안 했다.

## 어댑터가 해야 할 일 (su4228 `createCoreClient` 쪽)
1. 기본 경로를 `/api/core/v0.8`에서 `/api`로, `workspaces/{id}/` 접두를 제거.
2. 위 표의 이름→경로 대응으로 메서드를 호출하고, 오류 본문·201/200 차이를 흡수.
3. 기사 id는 하이픈 UUID로 보내도 되게 코어 라우트를 넓힌 뒤(예정) 그대로 사용.
4. `getArticle(article_id)`는 코어에 `GET /api/articles/<id>`가 생긴 뒤 연결(그 전에는 `latest`/목록으로 대체).
