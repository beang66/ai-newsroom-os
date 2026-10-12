# id 규칙 — 레거시 hex id → 팀 계약 UUID (v0.8)

- 코드: `app/core/ids.py` (표준 라이브러리만, DB·네트워크 없음) · 테스트: `dev/tests/test_ids.py`
- 출처: su4228 브랜치 `integration/core_contract.py` 의 `uuid_text`·`legacy_uuid` 를 옮겨 왔다(브랜치 자체는 병합하지 않음).

## 왜 UUID v5 인가

팀 계약(v0.8)은 article·revision·media·source 를 UUID 로 식별한다. 앱에 이미 쌓인 데이터는 hex id 를 쓴다.
UUID v5 는 (네임스페이스, 이름) 의 SHA-1 해시라서 **같은 레거시 id 는 어느 기기·언제 변환해도 같은 UUID** 가 된다.
매핑 테이블을 따로 저장·동기화할 필요가 없고, 다른 팀원 시스템도 같은 규칙으로 같은 id 를 얻는다.

## 네임스페이스와 이름 형식

- 네임스페이스: `fb7978fb-ae58-41b1-a9e5-37c17f46d423` (`ids.TEAM_NAMESPACE`)
- 이름: `<system>:<entity>:<legacy_id>` — system 기본값 `app-core`
  - 예: `app-core:article:<32자리 hex>`
  - entity 는 지금까지 `article`, `revision`, `media_asset`, `source`
- 결과: `str(uuid.uuid5(TEAM_NAMESPACE, name))`
- 고정 벡터: `legacy_uuid('article', 'abc') == '9faf10d9-0423-5bf9-97ce-806fc477f904'` (테스트에 박혀 있음)

**네임스페이스와 이름 형식은 절대 바꾸지 않는다.** 바꾸면 이미 발급·공유된 모든 계약 id 가 달라져 서로 못 찾는다.
su4228 원본은 네임스페이스를 인자로 받고 없으면 거부했지만, 여기서는 팀이 확정한 위 상수로 고정했다.

`uuid_text` 는 하이픈 UUID 와 32자리 hex 만 받아 소문자 하이픈 표준형으로 돌려준다(`{...}`, `urn:uuid:` 형태는 `IdError`).
v5 는 해시라 **원래 레거시 id 로 되돌릴 수 없다.**

## 새로 만드는 id 규칙 (2026-10-07 결정: 별칭 없이 처음부터 UUID)

별칭(같은 대상이 id 두 개)을 만들지 않으려고, **새 id 는 처음부터 UUID 로 만든다.** 저장 형태는 하이픈 없는 32자리 hex(`uuid.hex`),
계약·외부로 나갈 때만 `uuid_text()` 로 하이픈을 붙인다(같은 값, 변환일 뿐 별칭이 아님).

| 대상 | 저장 위치 | id 만드는 법 |
|---|---|---|
| 원고 | `articles.id` | 무작위 UUID v4 (`uuid4().hex`) — 예전부터 이 방식 |
| 원고 개정본 | `article_revisions.id` | `revision_uuid(기사 id, 번호)` = UUID v5 (`app-core:revision:<기사 hex>:<번호>`) |
| 취재자료 | `sources.id` | `source_id(원본 바이트)` = UUID v5 (`app-core:source:<sha256>`) — 같은 파일이면 같은 id(중복 저장 방지) |
| 사진 | `media.id` | `media_id(머리글, 바이트)` = UUID v5 (`app-core:media:<sha256>`) — 같은 사진이면 같은 id |
| 미디어 자산 | `media_assets.id` | 사진의 UUID 를 하이픈 표준형으로(`uuid_text(media.id)`) — 별도 계산 없음 |

`legacy_uuid()` 는 **옛 id 를 UUID 로 바꿔야 할 때만** 쓰는 도구다(su4228 어댑터와 같은 값). 앱 자체 데이터에는 쓰지 않는다.
옛 평문 폴더에서 가져온(`import_legacy_files`) 자료만 16자리 hex id 를 그대로 가지며, 조회 경로는 이 모양도 받는다. 계약용 UUID 는 없다.

시험용으로 쌓였던 예전 기사·자료(옛 16자리 자료 id)는 이 규칙으로 바꿀 때 **옮기지 않고 비웠다**(사용자 결정: 모두 시험용 임시 데이터).

## 범위

이 모듈은 순수 함수만 제공한다. **DB 스키마 변경·저장소(vault/storage)·API 에 id 를 연결하는 일은 이후 마일스톤(M4)** 이며 이번 작업에 포함되지 않는다.
