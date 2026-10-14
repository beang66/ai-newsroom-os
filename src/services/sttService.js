/**
 * @file sttService.js
 * @description 독립 STT 서버(`/api/stt`)와의 multipart 전사 통신 모듈 // api-boundary-allow: 개인 STT 서버(포트 4000, CLOVA) — Core 가 아님
 */
import { createTranscriptModel } from "../models/transcriptModel";

function toDialogue(segment, index) {
  const startMs = typeof segment.start_ms === "number"
    ? segment.start_ms
    : (typeof segment.start === "number" ? segment.start : 0);
  const speakerName = segment.speaker || "화자 미식별";

  return {
    id: segment.id || segment.segmentId || `dialogue_${index + 1}`,
    speaker: speakerName.includes("기자") ? "reporter" : "speaker",
    speakerName,
    // API의 시간값은 ms이며 UI 플레이어는 초 단위를 사용한다.
    timestamp: startMs / 1000,
    text: segment.text || ""
  };
}

/**
 * 음성 파일을 독립 STT 서버에 multipart/form-data로 전송한다.
 * Content-Type을 직접 지정하지 않아 브라우저가 boundary를 생성하도록 한다.
 *
 * @param {File|Blob} file - 변환할 오디오 파일
 * @param {Object} [options={}] - { signal }
 * @returns {Promise<{ dialogues: Array, text: string, transcript: Object, duration: number }>}
 */
export async function requestSTT(file, options = {}) {
  if (!file) {
    throw new Error("변환할 음성 파일이 없습니다.");
  }

  const formData = new FormData();
  formData.append("audio", file, file.name || "audio.wav");

  let response;
  try {
    response = await fetch("/api/stt", { // api-boundary-allow: 개인 STT 서버(포트 4000, CLOVA) — Core 가 아님
      method: "POST",
      body: formData,
      signal: options.signal
    });
  } catch (error) {
    throw new Error("STT 서버(포트 4000)에 연결하지 못했습니다. 서버 실행 상태를 확인해 주세요.", {
      cause: error
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? ` (${data.detail})` : "";
    throw new Error(`${data.error || `HTTP ${response.status} 오류가 발생했습니다.`}${detail}`);
  }

  // 독립 서버는 { success, result: { transcript, text, segments } }를 반환한다.
  const result = data.result || data;
  const transcript = createTranscriptModel(result);
  const dialogues = Array.isArray(result.dialogues) && result.dialogues.length > 0
    ? result.dialogues
    : (transcript?.segments || []).map(toDialogue);
  const duration = (transcript?.segments || []).reduce((max, segment) => {
    const endMs = typeof segment.end_ms === "number"
      ? segment.end_ms
      : (typeof segment.end === "number" ? segment.end : 0);
    return Math.max(max, endMs / 1000);
  }, 0);

  return {
    dialogues,
    text: result.text || transcript?.text || "",
    duration,
    transcript,
    engine: transcript?.metadata?.sourceEngine || "clova"
  };
}

/**
 * 전사된 Transcript를 기반으로 AI 핵심 요약 및 인사이트를 요청한다.
 *
 * @param {Object} transcript - 표준 Transcript 객체 ({ text, segments, confidence })
 * @param {Object} [options={}] - { signal }
 * @returns {Promise<{ summary: string, keyPoints: string[], keywords: string[] }>}
 */
export async function requestInterviewAnalysis(transcript, options = {}) {
  if (!transcript) {
    throw new Error("분석할 Transcript 데이터가 없습니다.");
  }

  let response;
  try {
    response = await fetch("/api/analyze-interview", { // api-boundary-allow: 개인 STT 서버(포트 4000, CLOVA) — Core 가 아님
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      // 분석 서버는 text(없으면 구간 text)만 쓴다. 단어별 시간까지 보내면 긴 인터뷰가 서버 JSON 한도(100KB)를 넘는다.
      body: JSON.stringify({ transcript: { text: transcript.text || "", segments: (transcript.segments || []).map((s) => ({ text: s.text || "" })) } }),
      signal: options.signal
    });
  } catch (error) {
    throw new Error("AI 인터뷰 분석 서버에 연결하지 못했습니다.", { cause: error });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? ` (${data.detail})` : "";
    throw new Error(`${data.error || `HTTP ${response.status} AI 분석 실패`}${detail}`);
  }

  return data.result || { summary: "", keyPoints: [], keywords: [] };
}

function readJsonError(data, status, fallback) {
  const detail = typeof data.detail === "string" ? ` (${data.detail})` : "";
  return new Error(`${data.error || `HTTP ${status} ${fallback}`}${detail}`);
}

/**
 * 독립 STT 서버가 STT_OUTPUT_DIR에 저장한 전사 목록(최신순)을 가져온다.
 *
 * @returns {Promise<Array<{ id, filename, engine, createdAt, segmentCount, durationSec, preview }>>}
 */
export async function listStoredTranscripts(options = {}) {
  let response;
  try {
    response = await fetch("/api/stt/transcripts", { signal: options.signal }); // api-boundary-allow: 개인 STT 서버(포트 4000, CLOVA) — Core 가 아님
  } catch (error) {
    throw new Error("STT 서버(포트 4000)에 연결하지 못했습니다. 서버 실행 상태를 확인해 주세요.", { cause: error });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw readJsonError(data, response.status, "저장된 전사 목록 오류");
  return Array.isArray(data.transcripts) ? data.transcripts : [];
}

/**
 * 저장된 전사 하나를 다시 연다. requestSTT와 같은 모양으로 돌려주되 원본 오디오는 없다.
 */
export async function loadStoredTranscript(id, options = {}) {
  let response;
  try {
    response = await fetch(`/api/stt/transcripts/${encodeURIComponent(id)}`, { signal: options.signal }); // api-boundary-allow: 개인 STT 서버(포트 4000, CLOVA) — Core 가 아님
  } catch (error) {
    throw new Error("STT 서버(포트 4000)에 연결하지 못했습니다. 서버 실행 상태를 확인해 주세요.", { cause: error });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw readJsonError(data, response.status, "저장된 전사 오류");

  const transcript = createTranscriptModel({ transcript: data.transcript });
  const segments = transcript?.segments || [];
  const duration = segments.reduce((max, segment) => Math.max(max, (segment.end_ms || 0) / 1000), 0);
  return {
    dialogues: segments.map(toDialogue),
    text: transcript?.text || "",
    duration,
    transcript,
    engine: transcript?.metadata?.sourceEngine || "clova",
    filename: transcript?.metadata?.sourceFilename || ""
  };
}
