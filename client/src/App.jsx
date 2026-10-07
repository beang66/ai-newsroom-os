import React, { useState, useRef, useEffect, useMemo } from 'react';
import StudioView from './StudioView';
import { createTranscriptModel } from './models/transcriptModel';
import { requestSTT, requestAnalyzeInterview, checkServerHealth } from './services/sttService';
import './App.css';

/**
 * 밀리초(ms)를 MM:SS 형식으로 변환하는 유틸 함수
 */
function formatTime(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function App() {
  // 1. 파일 업로드 관련 상태
  const [selectedFile, setSelectedFile] = useState(null);

  // 2. STT 결과 및 통신 상태
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [errorInfo, setErrorInfo] = useState(null);
  const [sttResult, setSttResult] = useState(null);
  const [serverHealth, setServerHealth] = useState(null);

  // 3. AI 인터뷰 분석 관련 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [aiAnalysisError, setAiAnalysisError] = useState(null);

  // 표준 Transcript 데이터 구조화 (models/transcriptModel의 표준 정규화 적용)
  const transcript = useMemo(() => {
    return createTranscriptModel(sttResult);
  }, [sttResult]);

  // 마운트 시 백엔드 헬스체크 확인
  useEffect(() => {
    checkServerHealth().then((isConnected) => {
      setServerHealth(isConnected ? 'connected' : 'disconnected');
    });
  }, []);

  // 공통 STT 요청 함수
  const executeSTT = async (fileOrBlob, filename) => {
    if (!fileOrBlob) {
      setErrorInfo({
        error: '변환할 음성 파일이 없습니다.',
        detail: '파일을 선택하거나 브라우저에서 녹음을 먼저 완료해 주세요.'
      });
      return;
    }

    setIsLoading(true);
    setLoadingStep('음성 파일을 백엔드로 전송하고 있습니다...');
    setErrorInfo(null);
    setSttResult(null);
    setAiAnalysisResult(null);
    setAiAnalysisError(null);

    try {
      setLoadingStep('CLOVA Speech 장문 음성인식 처리 중입니다. 잠시만 기다려주세요...');
      const result = await requestSTT(fileOrBlob, filename);

      // 디버깅: 수신된 원본 결과 및 표준 Transcript 객체 콘솔 출력
      console.log('========== [CLOVA Speech 원본 응답] ==========', result?.raw || result);
      console.log('========== [표준 Transcript 데이터 구조] ==========', result?.transcript);
      if (Array.isArray(result?.transcript?.segments)) {
        console.table(result.transcript.segments.map((s, i) => ({
          '#': i + 1,
          'start(ms)': s.start,
          'end(ms)': s.end,
          confidence: s.confidence,
          '단어 수': s.words?.length || 0,
          text: s.text
        })));
      }
      console.log('====================================================');

      setSttResult(result);
    } catch (err) {
      console.error('STT 변환 오류:', err);
      setErrorInfo({
        error: err.message || 'STT 요청 중 알 수 없는 오류가 발생했습니다.',
        detail: typeof err.cause === 'object' ? JSON.stringify(err.cause, null, 2) : (err.cause || err.message)
      });
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // AI 인터뷰 분석 요청 핸들러
  const handleAnalyzeInterview = async () => {
    if (!transcript || !transcript.text || transcript.text.trim() === '') {
      setAiAnalysisError({
        error: '분석할 Transcript 데이터가 없습니다.',
        detail: '먼저 음성 파일 STT 변환을 완료해 주세요.'
      });
      return;
    }

    setIsAnalyzing(true);
    setAiAnalysisError(null);

    try {
      const result = await requestAnalyzeInterview(transcript);
      console.log('========== [AI 인터뷰 분석 결과] ==========', result);
      setAiAnalysisResult(result);
    } catch (err) {
      console.error('AI 분석 오류:', err);
      setAiAnalysisError({
        error: err.message || 'AI 분석 중 오류가 발생했습니다.',
        detail: typeof err.cause === 'object' ? JSON.stringify(err.cause, null, 2) : (err.cause || err.message)
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 오디오 Object URL 상태 및 라이프사이클 관리 (메모리 누수 방지 및 revoke 처리)
  const [audioUrl, setAudioUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    if (selectedFile) {
      try {
        objectUrl = URL.createObjectURL(selectedFile);
      } catch (err) {
        console.error('오디오 Object URL 생성 실패:', err);
      }
    }
    setAudioUrl(objectUrl);

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedFile]);

  const currentFileName = selectedFile?.name || 'interview_sample.wav';

  // 기본 샘플 데이터 화면으로 리셋하는 핸들러
  const handleReset = () => {
    setSelectedFile(null);
    setAudioUrl(null);
    setSttResult(null);
    setAiAnalysisResult(null);
    setAiAnalysisError(null);
    setErrorInfo(null);
  };

  return (
    <div className="app-root">
      <StudioView
        transcriptData={sttResult ? transcript : null}
        audioSource={audioUrl}
        fileName={currentFileName}
        selectedFile={selectedFile}
        aiResult={aiAnalysisResult}
        serverHealth={serverHealth}
        onFileSelect={(file) => {
          setSelectedFile(file);
          setSttResult(null);
          setAiAnalysisResult(null);
          setAiAnalysisError(null);
        }}
        onRunSTT={() => {
          if (selectedFile) {
            executeSTT(selectedFile, selectedFile.name);
          } else {
            alert('먼저 음성 파일을 업로드해 주세요.');
          }
        }}
        onReset={handleReset}
        isSTTLoading={isLoading}
        sttError={errorInfo}
        onRunAiAnalysis={handleAnalyzeInterview}
        isAiAnalyzing={isAnalyzing}
      />
    </div>
  );
}
