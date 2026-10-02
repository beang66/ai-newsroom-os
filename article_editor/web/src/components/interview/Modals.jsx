import React, { useState, useEffect } from 'react';

export function RenameModal({
  isOpen,
  onClose,
  speakerNames,
  onSave
}) {
  const [speakers, setSpeakers] = useState([]);

  useEffect(() => {
    if (isOpen) {
      const keys = Object.keys(speakerNames || {}).map(Number).sort((a, b) => a - b);
      if (keys.length === 0) {
        setSpeakers([
          { id: 1, name: '나 (기자)' },
          { id: 2, name: '취재원' }
        ]);
      } else {
        setSpeakers(keys.map((k) => ({
          id: k,
          name: speakerNames[k] || `화자 ${k}`
        })));
      }
    }
  }, [speakerNames, isOpen]);

  if (!isOpen) return null;

  const handleNameChange = (id, newName) => {
    setSpeakers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName } : s))
    );
  };

  const handleAddSpeaker = () => {
    const nextId = speakers.length > 0 ? Math.max(...speakers.map((s) => s.id)) + 1 : 1;
    setSpeakers((prev) => [...prev, { id: nextId, name: `화자 ${nextId}` }]);
  };

  const handleRemoveSpeaker = (id) => {
    if (speakers.length <= 2) {
      alert('최소 2명의 화자는 유지되어야 합니다.');
      return;
    }
    setSpeakers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSubmit = () => {
    const result = {};
    speakers.forEach((s) => {
      result[s.id] = (s.name || '').trim() || `화자 ${s.id}`;
    });
    onSave(result);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">👥 화자(참석자) 이름 설정</h3>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-desc">
            이름을 설정하면 녹취록의 발언자와 기사 초안, 인용구에 즉시 일괄 반영됩니다. (다자간 인터뷰 시 화자를 추가할 수 있습니다)
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            {speakers.map((s, idx) => (
              <div key={s.id} className="input-field" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="field-label" style={{ margin: 0 }}>
                    화자 {s.id} {s.id === 1 ? '(기자 본인)' : s.id === 2 ? '(주 취재원)' : `(참석자 ${s.id})`}
                  </label>
                  {speakers.length > 2 && s.id > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSpeaker(s.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      삭제
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="custom-text-input"
                  value={s.name}
                  onChange={(e) => handleNameChange(s.id, e.target.value)}
                  placeholder={`예: ${s.id === 1 ? '나 (기자)' : s.id === 2 ? '홍길동 대표' : '박철수 CTO'}`}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: '14px' }}>
            <button
              type="button"
              className="btn-toolbar-subtle"
              onClick={handleAddSpeaker}
              style={{
                width: '100%',
                padding: '9px',
                border: '1px dashed #cbd5e1',
                borderRadius: '8px',
                background: '#f8fafc',
                cursor: 'pointer',
                fontWeight: 600,
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              ➕ 화자 추가하기 (3인 이상 다자간 인터뷰)
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={handleSubmit}>일괄 적용</button>
        </div>
      </div>
    </div>
  );
}

export function ApiModal({
  isOpen,
  onClose,
  cloudConfig,
  onSave
}) {
  const [provider, setProvider] = useState(cloudConfig?.provider || 'clova');
  const [apiKey, setApiKey] = useState(cloudConfig?.apiKey || '');
  const [clovaInvokeUrl, setClovaInvokeUrl] = useState(cloudConfig?.clovaInvokeUrl || '');
  const [clovaSecretKey, setClovaSecretKey] = useState(cloudConfig?.clovaSecretKey || '');

  useEffect(() => {
    setProvider(cloudConfig?.provider || 'clova');
    setApiKey(cloudConfig?.apiKey || '');
    setClovaInvokeUrl(cloudConfig?.clovaInvokeUrl || '');
    setClovaSecretKey(cloudConfig?.clovaSecretKey || '');
  }, [cloudConfig, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSave({
      provider,
      apiKey: apiKey.trim(),
      clovaInvokeUrl: clovaInvokeUrl.trim(),
      clovaSecretKey: clovaSecretKey.trim()
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">⚙️ 음성 인식(STT) 및 화자 분리 엔진 설정</h3>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="input-field">
            <label className="field-label">음성 변환 및 화자 분리 엔진</label>
            <select
              className="custom-select-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              <option value="clova">🟢 네이버 CLOVA Speech (강력 추천: 목소리 주파수 화자 분리 + 한국어 특화)</option>
              <option value="groq">⚡ Groq Whisper (무료 / 초고속 2초 전사, 1:1 대화용)</option>
              <option value="openai">🤖 OpenAI Whisper Large (고정밀 한국어)</option>
              <option value="local">💻 브라우저 로컬 엔진 (짧은 오디오 전용)</option>
            </select>
          </div>

          {provider === 'clova' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
              <div className="modal-info-box" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.5' }}>
                <strong style={{ color: '#166534' }}>🎙️ 네이버 CLOVA Speech (클로바노트 동일 AI)</strong>
                <p style={{ margin: '4px 0 0 0', color: '#374151' }}>
                  실제 사람의 목소리 주파수(음색)를 분석하여 2명 이상의 참석자를 <strong>화자 1, 화자 2, 화자 3...</strong>으로 정밀하게 자동 분리합니다.
                </p>
                <div style={{ marginTop: '6px' }}>
                  <a
                    href="https://www.ncloud.com/product/aiService/clovaSpeech"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    🔗 네이버 클라우드 CLOVA Speech 콘솔 ↗
                  </a>
                </div>
              </div>

              <div className="input-field" style={{ marginBottom: 0 }}>
                <label className="field-label">Invoke URL</label>
                <input
                  type="text"
                  className="custom-text-input"
                  value={clovaInvokeUrl}
                  onChange={(e) => setClovaInvokeUrl(e.target.value)}
                  placeholder="예: https://clovaspeech-gw.ncloud.com/external/v1/..."
                />
                <span className="field-caption">네이버 클라우드 플랫폼 CLOVA Speech 도메인에서 생성된 Invoke URL을 입력하세요.</span>
              </div>

              <div className="input-field" style={{ marginBottom: 0 }}>
                <label className="field-label">Secret Key</label>
                <input
                  type="password"
                  className="custom-text-input"
                  value={clovaSecretKey}
                  onChange={(e) => setClovaSecretKey(e.target.value)}
                  placeholder="네이버 클라우드 Secret Key 입력"
                />
                <span className="field-caption">도메인 빌더에서 발급된 Secret Key를 입력하세요. 브라우저에 안전하게 저장됩니다.</span>
              </div>
            </div>
          )}

          {provider === 'groq' && (
            <div className="input-field" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="field-label" style={{ margin: 0 }}>Groq API Key</label>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '12px', color: '#4e6af3', fontWeight: 600, textDecoration: 'underline' }}
                >
                  🔗 무료 Groq API 키 즉시 발급 ↗
                </a>
              </div>
              <input
                type="password"
                className="custom-text-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
              />
              <span className="field-caption">
                Groq에서 구글 계정으로 무료 키를 발급받으면 20분 인터뷰도 2초 만에 초고속으로 전사됩니다.
              </span>
            </div>
          )}

          {provider === 'openai' && (
            <div className="input-field" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="field-label" style={{ margin: 0 }}>OpenAI API Key</label>
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '12px', color: '#4e6af3', fontWeight: 600, textDecoration: 'underline' }}
                >
                  🔗 OpenAI API 키 발급 ↗
                </a>
              </div>
              <input
                type="password"
                className="custom-text-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={handleSubmit}>설정 저장 및 적용</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirm Clear Transcript Modal
 * Prevents accidental loss of interview transcripts!
 */
export function ConfirmClearModal({
  isOpen,
  onClose,
  onConfirm
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ borderBottom: '1px solid #fee2e2' }}>
          <h3 className="modal-title" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚠️ 인터뷰 녹취 텍스트 비우기
          </h3>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          <p style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: '#1f2937', lineHeight: 1.5 }}>
            정말 변환된 녹취록과 분석 내용을 모두 삭제하시겠습니까?
          </p>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#991b1b', lineHeight: 1.6 }}>
            • 현재 화면의 줄글 텍스트 및 발언 시간 싱크 데이터가 모두 초기화됩니다.<br />
            • 삭제된 내용은 되돌릴 수 없으니, 필요한 경우 먼저 <strong>[📋 전체 복사]</strong> 또는 <strong>[💾 TXT]</strong>로 백업해 두세요.
          </div>
        </div>
        <div className="modal-footer" style={{ background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
          <button className="btn-secondary" onClick={onClose} style={{ fontWeight: 600 }}>
            취소 (유지하기)
          </button>
          <button 
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '7px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🗑️ 텍스트 비우기 확인
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastShelf({ toasts }) {
  return (
    <div className="toast-shelf">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
