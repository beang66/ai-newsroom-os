/**
 * @file sttService.js
 * @description 녹음 전사·저장된 녹취·AI 인터뷰 분석 모두 코어를 거친다(CLOVA 연동, 암호화 저장소, Render 중계).
 * 데스크톱 앱에서도 같은 경로로 동작하고, 녹음·발언은 코어 암호화 저장소에만 남는다.
 */
import { createTranscriptModel } from "../models/transcriptModel";
import { transcribeAudio, analyzeInterview, listTranscripts, loadTranscript } from "../api/editorial.js";

const MAX_AUDIO_BYTES = 40_000_000; // 코어 전사 한도(core/ai/transcribe.py MAX_AUDIO)와 같게 — 올리기 전에 알려 준다

const durationOf = (transcript) => (transcript?.segments || []).reduce((max, segment) => {
  const endMs = typeof segment.end_ms === "number" ? segment.end_ms : (typeof segment.end === "number" ? segment.end : 0);
  return Math.max(max, endMs / 1000);
}, 0);

/**
 * 음성 파일을 코어로 보내 전사한다(40MB 이하). 코어가 녹음과 결과를 암호화 저장소에 보관한다.
 * @returns {Promise<{ dialogues: Array, text: string, transcript: Object, duration: number, engine: string }>}
 */
export async function requestSTT(file) {
  if (!file) {
    throw new Error("변환할 음성 파일이 없습니다.");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new Error(`녹음 파일은 40MB 이하만 전사할 수 있어요(선택한 파일 ${(file.size / 1_000_000).toFixed(1)}MB). 나눠서 올려 주세요.`);
  }
  const result = await transcribeAudio(file);
  const transcript = createTranscriptModel(result);
  return {
    dialogues: Array.isArray(result.dialogues) ? result.dialogues : [],
    text: result.text || transcript?.text || "",
    duration: result.duration || durationOf(transcript),
    transcript,
    engine: result.engine || transcript?.metadata?.sourceEngine || "clova"
  };
}

/**
 * 전사된 Transcript를 기반으로 AI 핵심 요약을 요청한다(코어 assist). 긴 녹취는 코어가 나눠 읽고 합치므로 여기서는 하나의 요약으로 받는다.
 *
 * @param {Object} transcript - 표준 Transcript 객체 ({ text, segments })
 * @returns {Promise<{ summary: string, keyPoints: string[], keywords: string[] }>}
 */
export async function requestInterviewAnalysis(transcript, options = {}) {
  if (!transcript) {
    throw new Error("분석할 Transcript 데이터가 없습니다.");
  }
  const text = transcript.text || (transcript.segments || []).map((segment) => segment.text || "").join(" ");
  return analyzeInterview(text, options.signal);
}

/**
 * 코어 암호화 저장소에 보관된 녹취 목록(최신순).
 * @returns {Promise<Array<{ id, filename, createdAt, segmentCount, durationSec }>>}
 */
export async function listStoredTranscripts() {
  const { transcripts = [] } = await listTranscripts();
  return transcripts.map((item) => ({
    id: item.id,
    filename: item.filename,
    createdAt: item.createdAt,
    segmentCount: item.segments,
    durationSec: item.duration || 0
  }));
}

/**
 * 저장된 녹취 하나를 다시 연다. requestSTT와 같은 모양에 원본 녹음 주소(audioUrl)를 더해 돌려준다.
 */
export async function loadStoredTranscript(id) {
  const result = await loadTranscript(id);
  const dialogues = Array.isArray(result.dialogues) ? result.dialogues : [];
  // 분석 서버는 글자만 쓴다 — 저장본에는 전사 원본이 없어 발언을 이어 붙인다
  const transcript = { text: dialogues.map((item) => item.text).join("\n"), segments: [] };
  return {
    dialogues,
    text: transcript.text,
    duration: result.duration || 0,
    transcript,
    filename: result.filename || "",
    audioUrl: result.audioUrl || null
  };
}
