const path = require('path');
// 루트 디렉터리와 현재 디렉터리의 .env 파일을 순차적으로 확인하여 로드
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { recognizeSpeech } = require('./clovaSpeech');
const { analyzeInterview } = require('./interviewAnalyzer');

const app = express();
const PORT = process.env.PORT || 4000;

// 1. 미들웨어 설정
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Multer 메모리 스토리지 및 파일 검증 설정
const storage = multer.memoryStorage();
const allowedExtensions = ['.webm', '.wav', '.mp3', '.m4a'];
const allowedMimeTypes = [
  'audio/webm',
  'video/webm', // 브라우저에 따라 녹음 시 video/webm으로 전송될 수 있음
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/m4a',
  'audio/mp4',
  'audio/x-m4a'
];

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB 제한
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowedExt = allowedExtensions.includes(ext);
    const isAllowedMime = allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/');

    if (isAllowedExt || isAllowedMime) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식입니다. (지원 형식: ${allowedExtensions.join(', ')})`), false);
    }
  }
});

// 3. 헬스 체크 API
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'CLOVA Speech STT backend'
  });
});

// 4. STT 음성인식 API
app.post('/api/stt', (req, res) => {
  upload.single('audio')(req, res, async (err) => {
    // Multer 파일 업로드 에러 처리
    if (err) {
      console.error('[서버 오류] 파일 업로드 검증 실패:', err.message);
      return res.status(400).json({
        success: false,
        error: '파일 업로드 검증에 실패했습니다.',
        detail: err.message
      });
    }

    // 파일 존재 여부 확인
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '음성 파일이 선택되지 않았습니다.',
        detail: 'audio 필드에 유효한 음성 파일을 첨부해 주세요.'
      });
    }

    console.log(`[서버 로그] 음성 파일 수신: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);

    try {
      // CLOVA Speech 장문 인식 API 호출
      const result = await recognizeSpeech(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      // 성공 응답 반환 (ai-newsroom-os 아키텍처 표준 응답 규격)
      return res.json({
        success: true,
        job: {
          id: `job_stt_${Date.now()}`,
          status: 'COMPLETED',
          type: 'AUDIO_TRANSCRIPTION',
          filename: req.file.originalname,
          fileSize: req.file.size,
          processedAt: new Date().toISOString()
        },
        result: {
          // 1. 표준 Transcript 데이터 (ai-newsroom-os 공식 엔티티)
          transcript: result.transcript,
          // 2. 하위 호환성을 위한 기본 필드 유지
          text: result.transcript.text,
          confidence: result.transcript.confidence,
          segments: result.transcript.segments,
          // 3. 감사 및 디버깅을 위한 CLOVA Speech 원본 JSON 분리 보존
          raw: result
        }
      });
    } catch (apiError) {
      // CLOVA Speech 호출 중 발생한 오류
      console.error('[서버 로그] CLOVA Speech 변환 실패:', apiError.message);
      const statusCode = apiError.status || 500;
      
      return res.status(statusCode >= 100 && statusCode < 600 ? statusCode : 500).json({
        success: false,
        error: 'STT 처리 중 오류가 발생했습니다.',
        detail: apiError.detail || apiError.message
      });
    }
  });
});

// 5. AI 인터뷰 분석 API
app.post('/api/analyze-interview', async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript 데이터가 제공되지 않았습니다.',
        detail: 'request body에 transcript 객체를 포함해 주세요.'
      });
    }

    const analysisResult = await analyzeInterview(transcript);

    return res.json({
      success: true,
      result: analysisResult
    });
  } catch (error) {
    console.error('[서버 오류] AI 인터뷰 분석 실패:', error.message);
    const statusCode = error.status || 500;
    return res.status(statusCode >= 100 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      error: error.message || 'AI 인터뷰 분석 처리 중 오류가 발생했습니다.',
      detail: error.detail || error.message
    });
  }
});

// 6. 서버 시작
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`CLOVA Speech STT 백엔드 서버가 실행되었습니다.`);
  console.log(`포트: ${PORT} (http://localhost:${PORT})`);
  console.log(`환경변수 상태:`);
  console.log(`- CLOVA SECRET_KEY: ${process.env.CLOVA_SPEECH_SECRET_KEY ? '설정됨' : '미설정 (확인 필요)'}`);
  console.log(`- CLOVA INVOKE_URL: ${process.env.CLOVA_SPEECH_INVOKE_URL ? process.env.CLOVA_SPEECH_INVOKE_URL : '미설정 (확인 필요)'}`);
  console.log(`- OPENAI_API_KEY:   ${process.env.OPENAI_API_KEY ? '설정됨' : '미설정 (필요 시 .env에 입력)'}`);
  console.log(`=================================================`);
});
