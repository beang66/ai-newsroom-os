# 기사 작성 기능 — 팀 연동 계약 (v14)

> 출처: 노션 "백엔드 담당자 공유 — 기사 작성 기능 통합 안내"
> 작성: 고서연 · v14 · 2026-10-02
> 원본: https://transparent-bear-d7b.notion.site/3eddc185f6d3804e9120da9b48a12a98
> 이 문서는 위 안내에서 **연동에 필요한 내용만** 추린 것이다.

---

## 1. 목표

기사 작성 화면(로컬 Python 서버)을 **팀 기사 보관소·카드뉴스와 연결**한다.
화면이 보내는 원고를 팀 서버가 저장하고, 저장한 원고를 다시 열거나 다른 기능에서 사용할 수 있게 한다.

## 2. 핵심 원칙 (가장 중요)

> 각 기능이 서로 다른 기사 복사본을 만들지 않고 **같은 기사ID**를 기준으로 연결한다.

- DB 연결 = "화면의 저장 요청을 받아 공용 보관소에 넣고, 다시 읽어주는" 작업으로 이해하면 됨.

## 3. 전체 연결 흐름

1. 사용자가 보관소에서 기사 선택 → 팀 서버가 원고를 조회
2. 원고를 작성 화면에 전달 → 사용자가 제목·본문·사진을 수정
3. 작성 화면이 원고 전체를 전달 → 팀 서버가 **같은 기사ID로 갱신**
4. 보관소에서 저장 상태와 기사를 다시 확인
5. 카드뉴스가 **기사ID로** 저장된 원고를 읽어 제작

## 4. API 계약 (그대로 유지 → 프론트 변경 최소화)

| 주소 | 요청 | 응답 |
|---|---|---|
| `POST /api/articles/save` | `{draft: 원고전체}` | `{saved:true, articleId, fileName, folder}` |
| `POST /api/assist` | `{kind:"metadata", requested:"headline", body, current_headline}` | `headline_candidates` 배열 |
| `POST /api/assist` | `requested:"subheadline"` | 로컬 모델 경로: `subtitle_items` 또는 `subtitle` · OpenAI 경로: `subtitle_candidates` |
| `POST /api/assist` | `{kind:"flow", body}` | `{paragraphs:[핵심문장 3~5개], advice:""}` |
| `POST /api/assist` | `{kind:"photo_keywords", body}` | `{keywords:[영어 검색어 3개]}` |
| `GET /api/unsplash/search?q={검색어}&page=1` | 검색어·페이지 | `{photos, page, totalPages, total}` (photos = Unsplash 결과 구조) |
| `GET /api/unsplash/photo/{id}` | Unsplash 사진ID | 사진 바이너리 + 이미지 Content-Type (**JSON 응답 아님**) |
| `GET /api/unsplash/photo/{id}/track` | 사진ID | `{tracked:true}` |

- `fileName`/`folder` 는 로컬 구현 정보 → 팀 저장 방식에 맞춰 정리 가능.
- 오류: 적절한 실패 상태 코드 + `{error:"사용자가 이해할 안내"}`.
- 생성 결과는 **JSON으로 주고받고**, 모델 원문 출력·API 오류 페이지를 그대로 화면에 전달하지 않는다.

## 5. 현재 구현 vs 팀 작업

| 영역 | 현재 상태 | 팀에서 할 작업 |
|---|---|---|
| 작성 화면 | 제목·부제·본문·사진 편집 구현 | 팀 화면에서 원고 열기·변경 전달 |
| 제목·부제 AI | KeT5·KoBART + OpenAI 경로 구현 | 모델 설치·활성화·서버 실행 확인 |
| 요약 | OpenAI 또는 KoBART + OpenAI | 사용할 경로 설정 |
| Unsplash | 검색·페이지 탐색·선택·원본·다운로드 추적 | 서버 키와 API 주소 연결 |
| 원고 저장 | 로컬 JSON + 브라우저 임시 저장 | 팀 DB·Storage 저장으로 연결(또는 로컬 정책 유지) |
| 기사 목록·조회 | **미구현** | 목록/조회 API와 권한 구현 |
| 카드뉴스 전달 | 원고 데이터를 전달할 수 있음 | 전달 규격과 작업 요청 연결 |
| 회원·로그인·권한 | **미구현** | 팀 인증에 연결 |
| 오류 로그 | 사용자 오류 안내, 일부 개발 기록 | 서버 자동 로그·요청 추적 보완 |

## 6. 주의 / 합의 사항

- 사진 설명은 현재 **직접 입력**한다.
- **이미지 생성은 현재 UI 기능이 아니며**, 서버에 남은 과거 이미지 생성·설명 API까지 통합 필수 기능으로 취급할 필요는 없다. (제거하려면 담당자와 별도 합의)
- 제목·부제·본문 값은 **서식을 포함한 HTML**이다.

---

## 7. 코어(App Core) 관점 메모

- 위 API 계약은 현재 `app/core` 의 엔드포인트(`app/core/api.py`, `app/core/ai/router.py`, `app/core/integrations/unsplash.py`, `app/core/storage.py`)와 **일치**한다 → 프론트·백엔드 변경 없이 그대로 연결 가능.
- 남은 갭(팀 작업에 해당):
  - **기사 목록/조회 API** (미구현)
  - **인증/권한** (미구현)
  - **팀 DB/Storage 저장** (현재는 로컬 JSON: `app/core/storage.py`)
  - 서버 자동 로그/요청 추적
- 키 소유권: Unsplash Access Key·OpenAI Key는 현재 서버(`app/core/ai/client.py`, `app/core/integrations/unsplash.py`)에 위치 → 추후 백엔드 프록시로 교체 예정.
