# 뉴스 카드 편집실

기사에서 Instagram·Threads 원고와 카드뉴스를 생성하고 편집하는 로컬 웹 앱입니다. 카드뉴스 사진·텍스트 편집, 원문 검수, 초안 저장·불러오기, JPG 출력, Instagram·Threads 로컬 게시 기능을 포함합니다.

## 실행

Node.js를 설치한 후 다음 명령을 실행하세요.

```powershell
cd platform-generator
npm ci
Copy-Item .env.example .env
```

`.env`에 사용할 AI·사진 API 설정을 입력하세요. 이미 `.env`가 있으면 복사 명령은 생략합니다. 로컬 게시와 JPG 출력에 필요한 Chromium을 설치하고 서버를 시작합니다.

```powershell
npx playwright install chromium
npm start
```

브라우저에서 http://localhost:3001 을 여세요.

## 테스트

```powershell
cd platform-generator
npm test
```

API 키가 들어 있는 `.env`, `node_modules`, 출력 이미지 및 ZIP 파일은 Git에서 제외됩니다. 기사 검토 시제품(`localhost:8765`)은 포함하지 않습니다.
