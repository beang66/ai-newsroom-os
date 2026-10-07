# 뉴스룸 CLOVA Speech STT 독립 테스트 프로젝트

NAVER CLOUD PLATFORM의 **CLOVA Speech 장문 음성인식 API**를 사용하는 독립적인 STT 테스트 프로젝트입니다.  
React(Vite) 프론트엔드와 Node.js(Express) 백엔드로 구성되어 있으며, 음성 파일 업로드 및 브라우저 실시간 녹음을 지원합니다.

---

## 📁 프로젝트 구조

```text
/
├─ client/                  # 프론트엔드 (React + Vite)
│  ├─ src/
│  │  ├─ App.jsx            # STT 테스트 메인 UI (업로드, 녹음, 결과 시각화)
│  │  ├─ App.css            # 스타일시트
│  │  └─ main.jsx           # React 진입점
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.js        # Vite 프록시 (/api -> http://localhost:4000)
│
├─ server/                  # 백엔드 (Node.js + Express)
│  ├─ index.js              # Express 서버 엔트리포인트 (/api/health, /api/stt, /api/analyze-interview)
│  ├─ clovaSpeech.js        # CLOVA Speech API 호출 모듈 (multipart/form-data)
│  ├─ interviewAnalyzer.js  # OpenAI 기반 인터뷰 분석 모듈 (요약, 핵심내용, 키워드)
│  └─ package.json
│
├─ .env                     # 실제 환경변수 파일 (Git 미포함, 직접 작성)
├─ .env.example             # 환경변수 예시 템플릿
├─ .gitignore               # 민감 정보(.env) 및 빌드/의존성 파일 제외
├─ package.json             # 루트 스크립트 (동시 실행용)
└─ README.md                # 프로젝트 안내 문서
```

---

## 🔒 보안 및 환경변수 안내

- `CLOVA_SPEECH_SECRET_KEY` 및 `OPENAI_API_KEY`는 절대로 클라이언트(React) 코드에 노출되지 않으며, 백엔드 서버에서만 안전하게 사용됩니다.
- `.env` 파일은 `.gitignore`에 등록되어 있어 Git 저장소에 커밋되지 않습니다.
- 실제 Secret Key 및 API Key 값은 코드에 하드코딩하지 않습니다.

---

## ⚙️ 사전 환경 설정 (.env 작성)

프로젝트 루트 디렉터리의 `.env` 파일(또는 `.env.example`을 복사하여 생성)에 본인의 설정을 입력합니다:

```env
# CLOVA Speech 빌더 > [설정] > [연동 정보]에서 확인한 Secret Key 입력
CLOVA_SPEECH_SECRET_KEY=여기에_실제_SECRET_KEY_입력

# CLOVA Speech 빌더 > [설정] > [연동 정보]에서 확인한 Invoke URL 입력
CLOVA_SPEECH_INVOKE_URL=여기에_실제_INVOKE_URL_입력

# 백엔드 서버 포트
PORT=4000

# OpenAI API Key (AI 인터뷰 분석 기능에 사용)
OPENAI_API_KEY=여기에_실제_OPENAI_API_KEY_입력
```

> **참고**: 현재 사용 중인 도메인은 `newsroom-stt` 기준입니다.

---

## 🚀 설치 및 실행 방법

### 방법 1. 루트에서 한 번에 설치 및 실행 (권장)

```bash
# 1. 루트 및 하위(client, server) 의존성 패키지 일괄 설치
npm run install:all

# 2. 백엔드(포트 4000)와 프론트엔드(포트 5173) 동시 실행
npm run dev
```

---

### 방법 2. 백엔드와 프론트엔드를 개별 터미널에서 실행

#### 1) 백엔드 서버 실행
```bash
cd server
npm install
npm run dev
# 또는 node index.js
```
- 서버 주소: `http://localhost:4000`
- 헬스 체크: `http://localhost:4000/api/health`

#### 2) 프론트엔드 클라이언트 실행 (새 터미널)
```bash
cd client
npm install
npm run dev
```
- 클라이언트 주소: `http://localhost:5173`

---

## 🖥️ STT 테스트 방법

1. 브라우저에서 `http://localhost:5173`에 접속합니다.
2. 상단에 **"백엔드 서버 정상 연결됨 (Port 4000)"** 뱃지가 표시되는지 확인합니다.
3. 변환 방식을 선택합니다:
   - **📁 파일 업로드**: `webm`, `wav`, `mp3`, `m4a` 형식의 음성 파일을 선택하고 `STT 변환 실행` 클릭
   - **🔴 브라우저 마이크 녹음**: `🎙️ 녹음 시작` 클릭 후 마이크에 발화하고, `⏹️ 녹음 중지` 후 `녹음 파일 STT 변환` 클릭
4. 변환 결과 확인:
   - **전체 인식 결과**: 통합 변환된 전체 텍스트
   - **세부 결과**: 화자 정보(Diarization), 시작/종료 시간(`MM:SS`), 문장별 텍스트, 단어 단위 시간(`words`)
   - **감지된 소리 이벤트(SED)**: 박수, 웃음 등 소리 이벤트
   - **CLOVA Speech 원본 JSON**: 필요 시 디버깅을 위해 원본 JSON 펼치기 가능

---

## 💰 비용 및 유료 서비스 안내 (중요)

- 본 테스트 프로젝트는 **CLOVA Speech의 기본 장문 인식 API** 호출만을 사용하도록 구성되었습니다.
- 불필요한 비용 발생을 방지하기 위해 다음과 같은 유료 서비스는 **일체 추가/생성하지 않았습니다**:
  - ❌ 별도 API Gateway 유료 서비스 추가 생성 없음
  - ❌ 유료 Object Storage 설정 변경 없음
  - ❌ 기타 유료 NAVER CLOUD 서비스 미연동
- 테스트 시 무료 제공량 내에서 짧은 음성 파일 위주로 먼저 동작을 검증하는 것을 권장합니다.
