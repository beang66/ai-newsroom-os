# AI Newsroom OS

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

---

## 🎙️ CLOVA Speech STT 모듈 (feature/stt-integration)

NAVER CLOUD PLATFORM의 **CLOVA Speech 장문 음성인식 API**와 연동된 STT 처리 모듈입니다.  
React 클라이언트와 Node.js(Express) 백엔드로 구성되어 있으며, 음성 파일 업로드, 브라우저 재생 연동, 표준 Transcript 정규화, AI 인터뷰 분석 기능을 제공합니다.

### 📁 STT 모듈 구조

```text
├─ client/                  # STT 프론트엔드 (React + Vite)
│  ├─ src/
│  │  ├─ App.jsx            # STT 메인 UI 오케스트레이션
│  │  ├─ StudioView.jsx     # 인터뷰·녹취 스튜디오 화면
│  │  ├─ models/            # 표준 Transcript 데이터 모델 (ai-newsroom-os 연계)
│  │  └─ services/          # STT API 통신 서비스 계층
│  └─ vite.config.js
│
├─ server/                  # STT 백엔드 (Node.js + Express)
│  ├─ index.js              # Express 서버 엔트리포인트 (/api/health, /api/stt, /api/analyze-interview)
│  ├─ clovaSpeech.js        # CLOVA Speech API 통신 모듈
│  ├─ interviewAnalyzer.js  # OpenAI 기반 인터뷰 분석 모듈
│  └─ normalizers/          # Transcript 표준 규격 정규화 모듈
```

### ⚙️ 환경변수 설정 (.env)

`.env.example`을 참고하여 프로젝트 루트에 `.env` 파일을 생성하고 다음 키를 설정합니다:

```env
# CLOVA Speech 연동 정보
CLOVA_SPEECH_SECRET_KEY=your_secret_key
CLOVA_SPEECH_INVOKE_URL=your_invoke_url
PORT=4000

# OpenAI API Key (AI 인터뷰 분석)
OPENAI_API_KEY=your_openai_key
```

### 🚀 실행 방법

```bash
# 1. STT 모듈 의존성 설치
npm run stt:install

# 2. STT 백엔드 및 클라이언트 개별 실행
npm run stt:server   # 백엔드 실행 (포트 4000)
npm run stt:client   # 프론트엔드 실행 (포트 5173)
```
