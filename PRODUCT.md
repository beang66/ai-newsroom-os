# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

주 사용자는 로컬 PC에서 민감한 취재자료와 기사 맥락을 관리하는 개인 기자·에디터다. 기사 작성 중 자료의 출처를 확인하고, 저장된 문서 사이의 명시적인 연결을 다시 찾는다.

## Product Purpose

AI Newsroom은 기사 작성, 취재자료 보관, 근거 확인, 보관함 탐색을 한 작업 공간에 묶는다. DataMap은 저장된 기사·자료·문서의 실제 관계를 탐색하게 한다.

## Operating Context

Windows 데스크톱 배포를 염두에 둔 로컬 웹 UI다. React 화면은 Python App Core의 API를 통해 SQLCipher 저장소에 접근한다. 사용자가 가져온 Markdown 문서는 앱이 관리하는 워크스페이스에 저장한다.

## Capabilities and Constraints

- 기사, 자료, 고정본에는 기존의 안정적인 ID와 관계 계약이 있다.
- Markdown 문서는 앱으로 명시적으로 가져온 것만 인덱싱한다. 외부 폴더 자동 감시는 사용하지 않는다.
- 취재자료와 문서 본문은 암호화 저장소에 둔다.
- DataMap의 관계는 저장된 참조나 문서에 적힌 링크처럼 확인 가능한 것만 나타낸다.
- 미해결 링크도 찾을 수 있어야 하며, 파일을 나중에 가져오면 관계를 다시 해석한다.

## Evidence on Hand

- 구현: `article_editor/app/core/vault.py`, `article_editor/app/core/read_models.py`, `article_editor/web/src/features/data-map/`.
- Foam 참조 구현: `C:/myproject/art-city-intelligence-ref/code/foam-main/packages/foam-core/src/`.
- 기존 DataMap 통합 메모: `docs/architecture/DATA_MAP_INTEGRATION.md`.

## Product Principles

- 기사와 자료의 근거를 추적할 수 있게 한다.
- 사용자가 명시한 연결과 시스템이 추정한 유사성을 혼동하지 않는다.
- 로컬 자료를 사용자가 통제하는 암호화 저장소에 보관한다.
- 파일이 없거나 링크가 깨졌을 때도 다음 행동을 알 수 있게 한다.

## Accessibility & Inclusion

DataMap은 키보드로 탐색할 수 있어야 한다. 노드 상태와 관계 방향은 색만으로 구분하지 않는다.
