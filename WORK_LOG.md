# 📋 디지털 뉴스룸 기사 작성실 & 통합 보관함 작업 로그

- **작업 기간**: 2026-10-06 ~ 2026-10-07 (KST)
- **대상 프로젝트**: `team01` (AI 뉴스룸 디지털 스튜디오)
- **주요 수정 파일**:
  - [`src/components/ArticleWriter.jsx`](file:///Users/sohyeon/Desktop/main01/team01/src/components/ArticleWriter.jsx)
  - [`src/components/PhotoEditor.jsx`](file:///Users/sohyeon/Desktop/main01/team01/src/components/PhotoEditor.jsx)
  - [`src/components/ArchiveView.jsx`](file:///Users/sohyeon/Desktop/main01/team01/src/components/ArchiveView.jsx)
  - [`server/clovaStt.js`](file:///Users/sohyeon/Desktop/main01/team01/server/clovaStt.js)
  - [`server/index.js`](file:///Users/sohyeon/Desktop/main01/team01/server/index.js)
  - [`vite.config.js`](file:///Users/sohyeon/Desktop/main01/team01/vite.config.js)
  - [`.env`](file:///Users/sohyeon/Desktop/main01/team01/.env) / [`.env.example`](file:///Users/sohyeon/Desktop/main01/team01/.env.example)
  - [`package.json`](file:///Users/sohyeon/Desktop/main01/team01/package.json)

---

## ⏱️ 타임라인 및 작업 상세 내역

### 1. 기사 중심 통합 보관함(ArchiveView) 레이아웃 재구성 및 디자인 개선 (10/06)
- **요청 사항**:
  - 큰 중앙 메인 작업 공간 확보 (세컨드 브레인 기능 공간)
  - 주변 영역에 원고, 취재자료, 인터뷰·녹취, 사진·미디어, 편집·변환본, 발행 이력 및 타임라인 배치
  - 불필요한 감싸는 박스 2가지 삭제 및 동그라미 원형 없는 깨끗한 직사각형 박스 형태 유지
  - 메인 박스 영역과 기사 선택 및 탐색 영역을 뒤집어진 ㄱ자 형태로 연결
  - 지정 영역에 부드러운 음영(그림자) 효과 반영
- **수행 내용**:
  - `ArchiveView.jsx` 레이아웃을 하나의 큰 작업 공간 구조로 개편
  - 복잡한 다중 외곽 박스를 제거하고 심플한 라운드 사각 카드 형태로 정리
  - 기존 사이드바는 위치, 디자인, 기능 모두 100% 보존

---

### 2. 기사 작성 화면 '사진 넣기' 팝업 UI 전면 개편 (10/06 ~ 10/07)
- **요청 사항**:
  - 상단 헤더 이모지 및 불필요한 설명 문구 제거, '사진 넣기' 명칭으로 통일
  - 3개 메인 탭 구성: `Unsplash 사진 검색`, `내 파일에서 추가`, `사진 저장하기`
  - Unsplash 검색 UI: 추천 검색 단어, 고해상도 사진 갤러리 그리드, 바로 첨부하기 및 편집하기 버튼
  - 팝업 크기 확장 및 화면 정중앙 기준 정렬
  - 추천 카테고리 박스 스타일 변경: 너무 둥글지 않은 약간의 모서리가 있는 직사각형(`rounded-md`) 형태 유지
  - 추천 카테고리 개수를 16개로 구성 및 가운데 정렬(`justify-center`) 적용
  - 리셋 버튼 클릭 시 새로운 16개 추천 키워드 풀 순환 전환
  - 갤러리 카드에서 '편집하기' 버튼 이모지 제거 및 마우스 호버 시 사진 확대 방지(고정)
- **수행 내용**:
  - `ArticleWriter.jsx` 내 사진 모달 구조 전면 개편
  - 카테고리 키워드 16개씩 3세트 풀 구축 및 `RotateCcw` 리셋 연동
  - 불필요한 감싸는 박스를 배제하여 미니멀한 UI 완성

---

### 3. 기사 본문 이미지 클릭 인터랙션 (4버튼 플로팅 툴바) 구현 (10/07 00:15 ~ 00:20)
- **요청 사항**:
  - 기사 작성 화면에서 본문에 사진을 추가한 뒤, 사진을 클릭(누르면)했을 때 첨부 이미지와 동일한 툴바 노출
  - 기존 UI 및 기능은 유지
- **수행 내용**:
  - 기사 본문 내 이미지 클릭 시 사진 상단 중앙에 플로팅 툴바 오버레이 표시
  - 사용자 제공 이미지와 100% 동일한 4가지 정사각형 버튼 디자인 적용:
    1. ✏️ **편집 (연필)**: 사진 상세 편집기(`PhotoEditor`) 모달 열기
    2. ⇄ **교체 (양방향 화살표)**: 내 PC 파일 탐색기 열어 해당 블록 사진 즉시 교체
    3. 💬 **캡션 수정 (말풍선)**: 사진 설명(캡션) 텍스트 인라인/프롬프트 수정
    4. 🗑️ **삭제 (휴지통)**: 본문에서 해당 사진 블록 깔끔하게 삭제
  - 선택된 사진에 테두리 하이라이트 적용 및 사진 외부 클릭 시 툴바 자동 닫힘 이벤트 리스너 탑재

---

### 4. 사진 편집실(PhotoEditor) 화면 연동 및 레이아웃 최적화 (10/07 00:22 ~ 00:36)
- **요청 사항**:
  - 사진 넣기 팝업 내 '편집하기' 및 메인 사진 '연필(✏️)' 버튼 클릭 시 첨부 이미지의 사진 편집 기능 실행
  - 편집기 내 도구 버튼(표시 비율, 모자이크, 브러시 크기, 투명도, 경계 선명도, 사진 설명, 사진 출처, 다운로드, 본문에 넣기) 일치
  - 편집 화면 열릴 때 빈 화면(크래시) 문제 해결
  - 사이드바와 겹치지 않고 사이드바는 살리는 방향으로 배치
  - 상단 '기사 작성' 바 삭제, 왼쪽 상단 '사진 편집', 오른쪽 상단 '작성으로 돌아가기' 배치 및 사이드바 상단 높이 일치
- **문제 진단 및 수행 내용**:
  - **빈 화면 원인 규명**: `ArticleWriter.jsx`에 `PhotoEditor` 컴포넌트 import 누락 발견 → import 추가로 런타임 ReferenceError 해결
  - **사이드바 보존**: 전체화면 고정 오버레이(`fixed inset-0`)를 해제하고 사이드바 우측 메인 작업 영역(`w-full flex-1 min-h-[calc(100vh-80px)] self-start`) 내에 배치하여 좌측 사이드바가 온전히 유지되도록 조정
  - **헤더 재배치**: 불필요한 '기사 작성 / 저장하기' 바를 제거하고 좌측 **사진 편집** / 우측 **[작성으로 돌아가기]** 단일 헤더 바로 정돈
  - **본문 반영 로직 강화**: 편집 후 `[본문에 넣기]` 클릭 시 기사 본문 삽입 및 기존 이미지 블록 정보(크롭, 모자이크, 캡션 등) 자동 동기화

---

### 5. UI 클린업 - 자동 저장 상태 표시 영역 삭제 (10/07 00:36 ~ 00:39)
- **요청 사항**:
  - 기사 작성하는 화면에서 '자동저장'이라는 부분 삭제
  - 다른 코드 및 UI는 일절 수정하지 말 것
- **수행 내용**:
  - `ArticleWriter.jsx`: 본문 에디터 상단 툴바 우측에 노출되던 `자동 저장됨 · {시간}` 상태 안내 UI 영역 제거
  - `PhotoEditor.jsx`: 편집실 하단 푸터에 있던 `자동 저장됨` 텍스트 함께 제거

---

### 6. 네이버 CLOVA STT 백엔드 구축 및 기사 작성 UI 음성 자동 입력 연동 (10/07 01:17 ~ 01:30)
- **요청 사항**:
  - 네이버 CLOVA STT 백엔드를 현재 기사 작성 UI에 연결
  - 녹음 시작 → 음성 데이터 백엔드 전송 → CLOVA STT 변환 → 반환된 텍스트를 기사 작성 영역에 자동 입력
  - STT API 키는 `.env`에서 관리하고 프론트엔드에 노출하지 않을 것
  - 기존 UI 디자인과 기사 작성 기능은 유지하고 STT 기능에 필요한 부분만 추가
  - 실제 녹음부터 텍스트 입력까지 정상 작동 여부 검증
- **수행 내용**:
  - **백엔드 구축 (`server/clovaStt.js`, `server/index.js`, `vite.config.js`)**:
    - 브라우저는 오디오 Blob 데이터를 `/api/stt`로 전송하고, 실제 네이버 CLOVA API 호출 및 인증은 서버 사이드(백엔드)에서만 수행하여 API 키 노출 원천 차단
    - 네이버 CLOVA STT 2가지 규격 모두 지원:
      1. **CLOVA Speech (신형)**: `CLOVA_SPEECH_INVOKE_URL`, `CLOVA_SPEECH_SECRET_KEY`
      2. **CLOVA CSR (NCP OpenAPI)**: `NCP_CLOVA_CLIENT_ID`, `NCP_CLOVA_CLIENT_SECRET`
    - Vite 개발 서버 미들웨어 플러그인(`configureServer`) 통합: 별도 백엔드 실행 없이도 `npm run dev` 하나로 동일 포트(`5173`)에서 프론트/백엔드 단일 패키지 동작 지원
    - 독립 실행형 Node.js 백엔드 서버(`server/index.js`, 포트 `3001`, `npm run server`)도 동시 제공
  - **기사 작성 UI 마이크 녹음 및 자동 입력 (`ArticleWriter.jsx`)**:
    - 본문 상단 툴바(사진, 요약, 복사, 인쇄) 옆에 동일한 규격(`w-10 h-10 border rounded-lg`)의 마이크(🎙️) 버튼 배치
    - 브라우저 `MediaRecorder` API를 통한 고음질 오디오 녹음 및 실시간 타이머(`00:05`), 펄스 애니메이션 피드백
    - 녹음 종료 시 오디오 데이터를 백엔드(`/api/stt`)로 전송하고, 반환된 텍스트를 기사 본문(`article.content`)에 자동 입력
  - **무결성 검증**:
    - `/api/stt` 바이너리 및 멀티파트 폼데이터 전송 테스트 완료 (Status 200 OK)
    - `npm run build` 프로덕션 빌드 정상 통과 완료

---

## 📁 주요 산출물 및 환경설정 요약

1. **환경변수 설정 파일 ([`.env`](file:///Users/sohyeon/Desktop/main01/team01/.env))**:
   ```env
   # Unsplash API Access Key
   VITE_UNSPLASH_ACCESS_KEY=H1h3MxSwrxWNOc-8zppu3zUSgTOY0Smss1fDChzfuRw

   # 네이버 CLOVA STT API 설정 (백엔드 전용 / 프론트엔드 비노출)
   # [방식 1] CLOVA Speech (신형)
   CLOVA_SPEECH_INVOKE_URL=
   CLOVA_SPEECH_SECRET_KEY=

   # [방식 2] CLOVA CSR (Naver Cloud Platform OpenAPI)
   NCP_CLOVA_CLIENT_ID=
   NCP_CLOVA_CLIENT_SECRET=
   ```

2. **빌드 및 실행 상태**:
   - `npm run dev`: 프론트엔드 + 네이버 CLOVA STT 백엔드 통합 실행 (포트 5173)
   - `npm run server`: 독립 Node.js 백엔드 서버 실행 (포트 3001)
   - `npm run build`: 프로덕션 번들 정상 빌드 완료 (`dist/` 생성)
