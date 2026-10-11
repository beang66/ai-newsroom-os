---
name: AI Newsroom
description: Local newsroom editor and contextual DataMap
colors:
  canvas: "#F8F7F4"
  card: "#FFFFFF"
  text-primary: "#292929"
  text-secondary: "#666666"
  border-soft: "#E7E4DE"
  accent-orange: "#F4A940"
  map-ink: "#252b35"
  map-purple: "#7963b6"
  map-line: "#eae7f0"
  map-soft: "#f4f1fa"
typography:
  body:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "16px"
rounded:
  map-button: "9px"
  map-panel: "13px"
  app-panel: "32px"
spacing:
  map-panel: "20px"
  map-gap: "18px"
components:
  map-primary-button:
    backgroundColor: "{colors.map-purple}"
    textColor: "{colors.card}"
    rounded: "{rounded.map-button}"
    padding: "10px 16px"
---

# Design System: AI Newsroom

## Overview

**Creative North Star: "연결의 출처를 읽을 수 있는 편집 지도"**

앱의 전체 바탕은 따뜻한 종이색, 기본 텍스트는 짙은 회색이다. DataMap은 그 안에서 옅은 라일락 패널과 작은 관계 표시로 구분된다. 정보의 구조와 출처가 장식보다 먼저 보인다.

**Key Characteristics:** 로컬 편집 도구, 부드러운 패널, 명확한 선택 상태, 읽을 수 있는 관계 목록.

## Colors

앱은 따뜻한 중립색과 주황색 동작 강조를 사용한다. DataMap은 기존 라일락을 관계 탐색에 사용한다. 정확한 값은 위 토큰을 따른다.

**The Evidence Rule.** 연결 상태는 색과 함께 라벨·형태·선 스타일로 표현한다.

## Typography

로컬 번들된 Pretendard Variable이 앱과 DataMap의 본문·컨트롤을 맡는다. 좁은 DataMap 패널에서도 읽을 수 있는 본문 크기를 유지한다.

## Layout

보관함의 기사 선택은 DataMap에 붙이지 않는다. 화면 최상단의 독립된 `기사 컨텍스트 바`에서 현재 탐색 기준과 자료 수를 먼저 확인하고, 아래 DataMap으로 내려가 관계를 탐색한다.

DataMap은 제목·문서/연결/미해결 요약 → 보기 전환 → 검색과 유형 필터 → 선택 맥락 → 관계망과 상세 패널 순으로 읽힌다. 데스크톱은 관계망과 맥락 패널을 나란히 놓고, 좁은 컨테이너에서는 아래로 쌓는다. DataMap CSS는 슬롯 너비를 기준으로 한 컨테이너 쿼리를 쓴다.

## Elevation & Depth

앱 헤더와 사이드바는 약한 그림자와 반투명 흰색을 사용한다. DataMap 내부는 밝은 표면과 얇은 경계로 깊이를 나눈다.

## Shapes

앱의 큰 패널은 넓은 곡률을, DataMap 내부 패널과 컨트롤은 더 작은 곡률을 사용한다. 새 관계 요소는 기존 패널의 모서리 언어를 따른다.

## Components

### Buttons

DataMap의 기본 동작은 라일락 배경과 흰 텍스트다. 키보드 포커스는 기존 보라색 외곽선을 보존한다.

### Cards / Containers

관계망은 옅은 라일락 표면, 맥락 패널은 흰 표면이다. 두 영역은 얇은 경계와 여백으로 구분한다.

### Navigation

`관계망`, `문서 목록`, `기사 기록`은 밑줄형 탭으로 전환한다. 현재 탭은 텍스트 굵기와 선택선으로 함께 표시한다. 기사 상태 필터는 기사 컨텍스트 바의 확장 영역에만 두어 같은 기능을 반복하지 않는다.

### Article Context Bar

현재 기사 제목, 작성 상태, 취재자료·녹취·미디어 수를 한 줄의 작업 맥락으로 제공한다. `기사 찾기`를 열면 검색과 상태 필터, 선택 목록이 같은 영역에서 확장된다. DataMap과는 최소 20px 간격과 별도 그림자로 분리한다.

## Do's and Don'ts

### Do:

- **Do** 문서 경로와 링크 방향을 사용자가 읽을 수 있는 위치에 둔다.
- **Do** 노드 선택과 포커스를 서로 구분한다.

### Don't:

- **Don't** 추정된 관련도를 실제 파일 링크처럼 표시한다.
- **Don't** 파일·미해결 대상의 차이를 색상 하나로만 표현한다.
