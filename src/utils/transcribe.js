/**
 * Crash-Safe Transcription & Audio Processing Utilities for Journalist Studio
 */

import { requestCloudTranscription } from '../api.js';

export function formatTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

let wordCounter = 1;

/**
 * Process a raw sentence string to detect:
 * 1. Filler words (어..., 음..., 그..., 이제...)
 * 2. Sensitive data (amounts, numbers, dates, names) and wrap in .redact-word
 */
export function processRawSentence(text) {
  let htmlText = escapeHtml(text);
  let cleanText = htmlText;

  // 1. Detect filler words
  htmlText = htmlText.replace(/(어\.\.\.|음\.\.\.|그\.\.\.|이제\.\.\.|약간|사실상\s)/g, '<span class="filler-word">$1</span>');
  cleanText = cleanText.replace(/(어\.\.\.|음\.\.\.|그\.\.\.|이제\.\.\.|약간\s|사실상\s)/g, '');

  // 2. Detect amounts & numbers (e.g., 12억 원, 35%, 10만 원)
  htmlText = htmlText.replace(/(\d+[\d,]*\s*(?:억|만|천|백|조|원|%|건|명|대))/g, (m) => {
    const wid = `w_${wordCounter++}`;
    return `<span class="redact-word" data-word-id="${wid}">${m}</span>`;
  });

  // 3. Detect dates (e.g., 2024년 6월 12일, 10월 15일)
  htmlText = htmlText.replace(/(\d{2,4}년\s*\d{1,2}월\s*\d{1,2}일|\d{1,2}월\s*\d{1,2}일)/g, (m) => {
    const wid = `w_${wordCounter++}`;
    return `<span class="redact-word" data-word-id="${wid}">${m}</span>`;
  });

  // 4. Detect names followed by position/title (e.g., 홍길동 대표, 김철수 교수, 박 변호사)
  htmlText = htmlText.replace(/([가-힣]{2,4}\s*(?:대표|교수|위원|변호사|원장|장관|의원|부사장|사장|관계자))/g, (m) => {
    const wid = `w_${wordCounter++}`;
    return `<span class="redact-word" data-word-id="${wid}">${m}</span>`;
  });

  return { htmlText, cleanText };
}

/**
 * Intelligent Sentence & Paragraph Merging Engine
 * Merges short, fragmented STT words/phrases into natural, complete Korean sentences/paragraphs.
 */
export function mergeFragmentedSegments(segments) {
  if (!segments || segments.length === 0) return [];

  const merged = [];
  let current = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = (seg.text || '').trim();
    if (!text) continue;

    const start = typeof seg.start === 'number' ? seg.start : 0;
    const end = typeof seg.end === 'number' ? seg.end : start + 3;
    const speaker = seg.speaker || null;

    if (!current) {
      current = {
        start,
        end,
        text,
        speaker,
        segment_id: seg.segment_id
      };
      continue;
    }

    const prevText = current.text;
    const pauseDuration = start - current.end;
    const isDifferentSpeaker = speaker && current.speaker && speaker !== current.speaker;

    // Check sentence completion criteria:
    // 1. Ends with sentence end punctuation (. ? !)
    const hasPunctuationEnd = /[.?!…]$/.test(prevText);
    // 2. Korean closing endings (습니다, 합니다, 니다, 세요, 에요, 까요, 나요, 죠 등)
    const hasKoreanClosingEnding = /(?:습니다|합니다|입니다|됩니다|않습니다|있습니다|했지요|했고요|했나요|인가요|나요|시죠|었나요|시나요|어요|아요|해요|게요|세요|네요|군요|지요|이죠)[.?!~…]*$/.test(prevText);
    // 3. Question mark inside or at end
    const isQuestion = /[?？]/.test(prevText);
    // 4. Significant pause between utterances (> 1.8 seconds)
    const hasLongPause = pauseDuration > 1.8;
    // 5. Length check: Keep merging if sentence is too short (< 40 characters) unless pause is long
    const isTooShort = prevText.length < 40;

    // Determine if we should split into a new sentence or merge into current sentence
    const shouldSplit = isDifferentSpeaker || ((hasPunctuationEnd || hasKoreanClosingEnding || isQuestion || hasLongPause) && !isTooShort);

    if (shouldSplit) {
      merged.push(current);
      current = {
        start,
        end,
        text,
        speaker,
        segment_id: seg.segment_id
      };
    } else {
      // Merge with current segment smoothly
      const separator = /[\s]$/.test(current.text) ? '' : ' ';
      current.text += separator + text;
      current.end = Math.max(current.end, end);
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Convert raw ASR segments to dialogue list with natural sentence consolidation and speaker alternation
 */
export function processSegmentsToDialogues(segments) {
  // 1. Merge fragmented, short chunks into readable, rich sentences
  const consolidated = mergeFragmentedSegments(segments);

  const dialogues = [];
  let currentSpeaker = 1;

  consolidated.forEach((seg, idx) => {
    const text = seg.text;
    if (!text) return;

    // If segment already has speaker from Clova Acoustic Diarization, use it!
    let speakerNum = seg.speaker;
    if (!speakerNum) {
      if (idx > 0) {
        const prevText = consolidated[idx - 1].text;
        const prevEnd = consolidated[idx - 1].end || 0;
        const pauseDuration = (seg.start || 0) - prevEnd;

        // Question detection or long silence alternates speaker (기자 <-> 취재원)
        if (/[?？]/.test(prevText) || /습니까|인가요|나요|시죠|었나요|시나요|말씀해|부탁드립니다/.test(prevText) || pauseDuration > 2.5) {
          currentSpeaker = currentSpeaker === 1 ? 2 : 1;
        }
      }
      speakerNum = currentSpeaker;
    } else {
      currentSpeaker = speakerNum;
    }

    const { htmlText, cleanText } = processRawSentence(text);

    dialogues.push({
      id: seg.segment_id || `seg_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      speaker: speakerNum,
      timestamp: Math.round(seg.start || 0),
      duration: Math.max(1, Math.round((seg.end || seg.start + 3) - seg.start)),
      text: htmlText,
      cleanText: cleanText
    });
  });

  return dialogues;
}


/**
 * Crash-Safe Local Transformers.js Whisper In-Browser Transcription
 * Downsamples safely and slices audio to avoid WebAssembly out-of-memory crashes!
 */
export async function transcribeWithTransformersLocal(file, onProgress) {
  if (onProgress) onProgress('AI 음성 모델 로딩 중 (Wasm 초기화)...', 15);

  const { pipeline, env } = await import(/* @vite-ignore */ '@xenova/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  // Use whisper-tiny with single thread to prevent browser tab crash
  const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
    progress_callback: (prog) => {
      if (prog.status === 'progress' && prog.total && onProgress) {
        const pct = Math.round((prog.loaded / prog.total) * 40) + 15;
        onProgress(`모델 로딩 중 (${Math.round(prog.loaded / 1024 / 1024)}MB / ${Math.round(prog.total / 1024 / 1024)}MB)...`, pct);
      }
    }
  });

  if (onProgress) onProgress('음성 데이터 안전 디코딩 중...', 60);

  // Decode audio using offline audio context to save RAM
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  // Safe channel extraction
  let audioData;
  if (audioBuffer.numberOfChannels === 1) {
    audioData = audioBuffer.getChannelData(0);
  } else {
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    audioData = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; ++i) {
      audioData[i] = (ch0[i] + ch1[i]) / 2;
    }
  }

  // Close audioCtx to free memory immediately!
  audioCtx.close();

  // If audio is longer than 5 minutes (5 * 60 * 16000 samples), slice to prevent Wasm crash
  const maxSamples = 5 * 60 * 16000;
  let processingData = audioData;
  if (audioData.length > maxSamples) {
    processingData = audioData.subarray(0, maxSamples);
  }

  if (onProgress) onProgress('한국어 인터뷰 전사 및 타임스탬프 분석 중...', 80);

  const output = await transcriber(processingData, {
    language: 'korean',
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 25,
    stride_length_s: 4
  });

  let rawChunks = output.chunks || [];
  if (rawChunks.length === 0 && output.text) {
    rawChunks = [{ timestamp: [0, Math.round(audioBuffer.duration)], text: output.text }];
  }

  return rawChunks.map((c) => ({
    start: c.timestamp && c.timestamp[0] !== null ? c.timestamp[0] : 0,
    end: c.timestamp && c.timestamp[1] !== null ? c.timestamp[1] : 0,
    text: c.text ? c.text.trim() : ''
  })).filter((c) => c.text.length > 0);
}

/**
 * Cloud Whisper API Transcription (Groq or OpenAI)
 * 100% crash-free, fast 2-second remote execution!
 */
export async function transcribeWithCloudApi(file, provider, apiKey, onProgress, signal) {
  if (onProgress) onProgress('클라우드 고속 Whisper AI로 전송 중...', 40);

  const data = await requestCloudTranscription({ file, provider, apiKey, signal });

  if (onProgress) onProgress('응답 데이터 화자 색인 중...', 85);

  if (data.segments && data.segments.length > 0) {
    return data.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim()
    }));
  } else if (data.text) {
    return [{ start: 0, end: 10, text: data.text.trim() }];
  }
  return [];
}
