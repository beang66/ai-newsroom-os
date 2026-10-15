const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
// 루트 디렉터리와 상위 디렉터리, 현재 디렉터리의 .env 파일을 순차적으로 확인하여 로드
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { recognizeSpeech } = require('./clovaSpeech');
const { analyzeInterview } = require('./interviewAnalyzer');

const app = express();
const PORT = process.env.PORT || 4000;
const DEFAULT_STT_OUTPUT_DIR = path.resolve(__dirname, 'data', 'stt');

/**
 * Persist only the safe, contract-level transcription data. The CLOVA raw
 * response is intentionally excluded: it is returned to existing API clients
 * for backward compatibility, but is not needed in a local transcript file.
 */
function copyExistingSpeaker(sourceSegment) {
  const sourceSpeaker = sourceSegment?.speaker || sourceSegment?.diarization;
  if (!sourceSpeaker || typeof sourceSpeaker !== 'object') return undefined;

  const speaker = {};
  for (const field of ['label', 'name']) {
    const value = sourceSpeaker[field];
    if ((typeof value === 'string' && value.trim()) || typeof value === 'number') {
      speaker[field] = value;
    }
  }
  return Object.keys(speaker).length ? speaker : undefined;
}

function copyExistingWords(words) {
  if (!Array.isArray(words)) return [];

  return words.map((word) => {
    const source = Array.isArray(word)
      ? { start: word[0], end: word[1], text: word[2] }
      : word;
    const savedWord = {};

    if (typeof source?.start === 'number') savedWord.start = source.start;
    if (typeof source?.end === 'number') savedWord.end = source.end;
    if (typeof source?.text === 'string' && source.text.trim()) savedWord.text = source.text;

    return savedWord;
  }).filter((word) => Object.keys(word).length > 0);
}

function buildStoredTranscript(transcript, rawResult) {
  const rawSegments = Array.isArray(rawResult?.segments) ? rawResult.segments : [];
  const segments = rawSegments.map((sourceSegment, index) => {
    const savedSegment = {
      segmentId: transcript?.segments?.[index]?.segmentId || `seg_${String(index + 1).padStart(4, '0')}`,
      index: index + 1
    };

    if (typeof sourceSegment?.start === 'number') savedSegment.start = sourceSegment.start;
    if (typeof sourceSegment?.end === 'number') savedSegment.end = sourceSegment.end;
    if (typeof sourceSegment?.text === 'string' && sourceSegment.text.trim()) savedSegment.text = sourceSegment.text;
    if (typeof sourceSegment?.confidence === 'number') savedSegment.confidence = sourceSegment.confidence;

    const speaker = copyExistingSpeaker(sourceSegment);
    if (speaker) savedSegment.speaker = speaker;

    const words = copyExistingWords(sourceSegment?.words);
    if (words.length) savedSegment.words = words;

    return savedSegment;
  }).filter((segment) => Object.keys(segment).length > 2);

  const savedTranscript = {
    id: transcript?.id,
    language: transcript?.language || 'ko-KR',
    segments
  };
  if (typeof rawResult?.text === 'string' && rawResult.text.trim()) savedTranscript.text = rawResult.text;
  if (typeof rawResult?.confidence === 'number') savedTranscript.confidence = rawResult.confidence;

  const metadata = transcript?.metadata;
  if (metadata && typeof metadata === 'object') {
    const safeMetadata = {};
    for (const field of ['sourceEngine', 'sourceFilename', 'fileSize', 'mimeType', 'createdAt']) {
      if (metadata[field] !== undefined) safeMetadata[field] = metadata[field];
    }
    if (Object.keys(safeMetadata).length) savedTranscript.metadata = safeMetadata;
  }

  return { transcript: savedTranscript };
}

function getOutputDir() {
  return process.env.STT_OUTPUT_DIR
    ? path.resolve(process.env.STT_OUTPUT_DIR)
    : DEFAULT_STT_OUTPUT_DIR;
}

async function saveTranscriptOutput(transcript, rawResult) {
  const outputDir = getOutputDir();
  const outputPath = path.join(outputDir, `stt-${randomUUID()}.json`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(buildStoredTranscript(transcript, rawResult), null, 2)}\n`,
    'utf8'
  );
  return outputPath;
}

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

      try {
        await saveTranscriptOutput(result.transcript, result);
      } catch (storageError) {
        console.error('[서버 오류] STT JSON 저장 실패:', storageError.message);
        return res.status(500).json({
          success: false,
          error: 'STT 결과를 저장하지 못했습니다.',
          detail: '저장 디렉터리 권한과 STT_OUTPUT_DIR 설정을 확인해 주세요.'
        });
      }

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

// 5-1. 저장된 전사(STT_OUTPUT_DIR의 JSON) 목록·재열기 — 읽기 전용, 저장 형식은 바꾸지 않는다.
const STORED_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const STORED_FILE_PATTERN = new RegExp(`^stt-(${STORED_UUID})\\.json$`);
const STORED_ID_PATTERN = new RegExp(`^${STORED_UUID}$`);
const MAX_LISTED_TRANSCRIPTS = 200;

function summarizeStoredTranscript(id, stored, modifiedAt) {
  const transcript = stored?.transcript || {};
  const segments = Array.isArray(transcript.segments) ? transcript.segments : [];
  const endMs = segments.reduce((max, segment) => Math.max(max, typeof segment.end === 'number' ? segment.end : 0), 0);
  return {
    id,
    filename: transcript.metadata?.sourceFilename || '',
    engine: transcript.metadata?.sourceEngine || '',
    createdAt: transcript.metadata?.createdAt || modifiedAt.toISOString(),
    segmentCount: segments.length,
    durationSec: endMs / 1000,
    preview: String(transcript.text || '').replace(/\s+/g, ' ').slice(0, 80)
  };
}

app.get('/api/stt/transcripts', async (req, res) => {
  try {
    const outputDir = getOutputDir();
    let names;
    try {
      names = await fs.readdir(outputDir);
    } catch (error) {
      if (error.code === 'ENOENT') return res.json({ success: true, transcripts: [] });
      throw error;
    }

    const transcripts = [];
    for (const name of names) {
      const match = STORED_FILE_PATTERN.exec(name);
      if (!match) continue;
      try {
        const filePath = path.join(outputDir, name);
        const [raw, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
        transcripts.push(summarizeStoredTranscript(match[1], JSON.parse(raw), stat.mtime));
      } catch {
        // 읽을 수 없거나 깨진 파일은 목록에서 건너뛴다.
      }
    }
    transcripts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ success: true, transcripts: transcripts.slice(0, MAX_LISTED_TRANSCRIPTS) });
  } catch (error) {
    console.error('[서버 오류] 저장된 전사 목록 조회 실패:', error.message);
    return res.status(500).json({
      success: false,
      error: '저장된 전사 목록을 읽지 못했습니다.',
      detail: '저장 디렉터리 권한과 STT_OUTPUT_DIR 설정을 확인해 주세요.'
    });
  }
});

app.get('/api/stt/transcripts/:id', async (req, res) => {
  const { id } = req.params;
  if (!STORED_ID_PATTERN.test(id)) {
    return res.status(400).json({ success: false, error: '전사 ID 형식이 올바르지 않습니다.' });
  }
  try {
    const raw = await fs.readFile(path.join(getOutputDir(), `stt-${id}.json`), 'utf8');
    return res.json({ success: true, id, transcript: JSON.parse(raw).transcript });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: '저장된 전사를 찾지 못했습니다.' });
    }
    console.error('[서버 오류] 저장된 전사 조회 실패:', error.message);
    return res.status(500).json({ success: false, error: '저장된 전사를 읽지 못했습니다.' });
  }
});

// 6. 서버 시작
function startServer(port = PORT) {
  // 이 PC 안에서만 받는다(녹취·CLOVA 사용량을 같은 네트워크에 노출하지 않음). 화면은 vite 중계로 127.0.0.1 을 쓴다.
  return app.listen(port, '127.0.0.1', () => {
    console.log(`=================================================`);
    console.log(`CLOVA Speech STT 백엔드 서버가 실행되었습니다.`);
    console.log(`포트: ${port} (http://127.0.0.1:${port})`);
    console.log(`환경변수 상태:`);
    console.log(`- CLOVA SECRET_KEY: ${process.env.CLOVA_SPEECH_SECRET_KEY ? '설정됨' : '미설정 (확인 필요)'}`);
    console.log(`- CLOVA INVOKE_URL: ${process.env.CLOVA_SPEECH_INVOKE_URL ? process.env.CLOVA_SPEECH_INVOKE_URL : '미설정 (확인 필요)'}`);
    console.log(`- OPENAI_API_KEY:   ${process.env.OPENAI_API_KEY ? '설정됨' : '미설정 (필요 시 .env에 입력)'}`);
    console.log(`=================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  buildStoredTranscript,
  saveTranscriptOutput,
  startServer
};
