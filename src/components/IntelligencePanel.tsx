import React, { useState } from 'react';
import { 
  Sparkles, 
  BookOpen, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  ExternalLink, 
  Search, 
  Edit3, 
  X, 
  Send, 
  ShieldCheck, 
  FileText, 
  ArrowRight,
  Filter,
  Check
} from 'lucide-react';
import { CritiqueCard, CritiqueCategory, Article, MaterialItem } from '../types';

interface IntelligencePanelProps {
  critiques: CritiqueCard[];
  article: Article;
  materials: MaterialItem[];
  isReviewing: boolean;
  onDismissCritique: (id: string) => void;
  onSelectNode: (nodeId: string) => void;
  onFindEvidence: (critique: CritiqueCard) => void;
  onApplyFix: (critique: CritiqueCard) => void;
  onRunReview: () => void;
}

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({
  critiques,
  article,
  materials,
  isReviewing,
  onDismissCritique,
  onSelectNode,
  onFindEvidence,
  onApplyFix,
  onRunReview,
}) => {
  const [activeTab, setActiveTab] = useState<'review' | 'sources' | 'ask'>('review');
  const [categoryFilter, setCategoryFilter] = useState<'all' | CritiqueCategory>('all');
  
  // Ask tab state
  const [questionInput, setQuestionInput] = useState('');
  const [askHistory, setAskHistory] = useState<Array<{ q: string; a: string; timestamp: string }>>([
    {
      q: '바스 박사는 원시 측정치 급등이 언제 처음 감지되었다고 언급했나요?',
      a: `엘레나 바스 박사의 인터뷰 속기록 [14:32] 발언:
"우리는 지난 5월에 벤젠 수치가 18 ppb를 초과한 것을 두 차례 확인했으나, 카운티 위원회에 제출된 월간 요약 보고서에서는 두 이상치 급등 수치가 모두 누락되었습니다."

검증 참고: 바스 박사는 이어 [15:15]에서 손 이사가 이를 단순 작동상 보정 오차라고 해명했다고 증언했습니다.`,
      timestamp: '오전 10:42',
    },
  ]);
  const [askLoading, setAskLoading] = useState(false);

  const activeCritiques = critiques.filter(c => !c.dismissed);
  const filteredCritiques = activeCritiques.filter(c => 
    categoryFilter === 'all' || c.category === categoryFilter
  );

  // Handle Ask assistant
  const handleSendQuestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!questionInput.trim() || askLoading) return;

    const userQuestion = questionInput.trim();
    setQuestionInput('');
    setAskLoading(true);

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQuestion,
          materials: materials.map(m => ({
            id: m.id,
            title: m.title,
            speaker: m.outletOrSpeaker,
            content: m.content,
          })),
          nodes: article.nodes,
        }),
      });

      const data = await response.json();
      setAskHistory(prev => [
        ...prev,
        {
          q: userQuestion,
          a: data.answer || '취재 자료에서 확인할 수 있는 내용이 없습니다.',
          timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      console.error('Ask error:', err);
    } finally {
      setAskLoading(false);
    }
  };

  const getCategoryBadge = (category: CritiqueCategory) => {
    switch (category) {
      case 'fact':
        return <span className="font-mono-code text-[10pt] font-bold px-2 py-0.5 rounded-xs bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4] uppercase">팩트</span>;
      case 'logic':
        return <span className="font-mono-code text-[10pt] font-bold px-2 py-0.5 rounded-xs bg-neutral-100 text-black border border-neutral-300 uppercase">논리</span>;
      case 'balance':
        return <span className="font-mono-code text-[10pt] font-bold px-2 py-0.5 rounded-xs bg-neutral-100 text-black border border-neutral-300 uppercase">균형</span>;
      case 'source':
        return <span className="font-mono-code text-[10pt] font-bold px-2 py-0.5 rounded-xs bg-[#edf7f7] text-[#008285] border border-[#bce3e4] uppercase">출처</span>;
    }
  };

  // Calculate evidence statistics
  const totalNodes = article.nodes.length;
  const nodesWithSources = article.nodes.filter(n => n.linkedSourceIds && n.linkedSourceIds.length > 0).length;
  const coveragePercent = totalNodes > 0 ? Math.round((nodesWithSources / totalNodes) * 100) : 0;
  const claimsWithoutSources = article.nodes.filter(n => n.type === 'CLAIM' && (!n.linkedSourceIds || n.linkedSourceIds.length === 0));

  return (
    <aside 
      className="w-[340px] shrink-0 border-l border-neutral-200 bg-white flex flex-col h-[calc(100vh-3.25rem)] select-none text-[10.5pt]"
      aria-label="AI 인텔리전스 패널"
    >
      {/* Top Header & Tabs: Review, Sources, Ask */}
      <div className="p-3 border-b border-neutral-200 bg-white">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-[#008285]" />
            <h2 className="font-semibold text-[10.5pt] text-black uppercase tracking-wider font-mono-code">
              AI 인텔리전스 데스크
            </h2>
          </div>
          <span className="font-mono-code text-[10pt] text-neutral-500 font-medium">
            교열 데스크 모드
          </span>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-neutral-100 rounded-xs border border-neutral-200">
          <button
            id="tab-review-btn"
            onClick={() => setActiveTab('review')}
            className={`py-1.5 text-center font-medium rounded-xs transition-colors flex items-center justify-center space-x-1 text-[10pt] cursor-pointer ${
              activeTab === 'review'
                ? 'bg-white text-black shadow-2xs font-semibold'
                : 'text-neutral-600 hover:text-black'
            }`}
          >
            <span>기사 검토</span>
            {activeCritiques.length > 0 && (
              <span className="bg-[#edf7f7] text-[#006b6e] text-[10pt] font-mono-code font-bold px-1.5 rounded-xs border border-[#bce3e4]">
                {activeCritiques.length}
              </span>
            )}
          </button>

          <button
            id="tab-sources-btn"
            onClick={() => setActiveTab('sources')}
            className={`py-1.5 text-center font-medium rounded-xs transition-colors flex items-center justify-center space-x-1 text-[10pt] cursor-pointer ${
              activeTab === 'sources'
                ? 'bg-white text-black shadow-2xs font-semibold'
                : 'text-neutral-600 hover:text-black'
            }`}
          >
            <span>출처 연계</span>
            <span className="text-[10pt] font-mono-code text-neutral-500 font-semibold">
              {coveragePercent}%
            </span>
          </button>

          <button
            id="tab-ask-btn"
            onClick={() => setActiveTab('ask')}
            className={`py-1.5 text-center font-medium rounded-xs transition-colors flex items-center justify-center space-x-1 text-[10pt] cursor-pointer ${
              activeTab === 'ask'
                ? 'bg-white text-black shadow-2xs font-semibold'
                : 'text-neutral-600 hover:text-black'
            }`}
          >
            <span>자료 질의</span>
            <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* TAB CONTENT: REVIEW */}
      {activeTab === 'review' && (
        <div className="flex-1 overflow-y-auto flex flex-col p-2.5 space-y-2.5 bg-white">
          {/* Category Filter Pills: Fact, Logic, Balance, Source */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1 rounded-xs text-[10pt] font-mono-code font-medium border transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              전체 ({activeCritiques.length})
            </button>
            <button
              onClick={() => setCategoryFilter('fact')}
              className={`px-2.5 py-1 rounded-xs text-[10pt] font-mono-code font-medium border transition-colors cursor-pointer ${
                categoryFilter === 'fact'
                  ? 'bg-[#008285] text-white border-[#008285]'
                  : 'bg-white text-[#006b6e] border-neutral-200 hover:bg-[#edf7f7]'
              }`}
            >
              팩트
            </button>
            <button
              onClick={() => setCategoryFilter('logic')}
              className={`px-2.5 py-1 rounded-xs text-[10pt] font-mono-code font-medium border transition-colors cursor-pointer ${
                categoryFilter === 'logic'
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              논리
            </button>
            <button
              onClick={() => setCategoryFilter('balance')}
              className={`px-2.5 py-1 rounded-xs text-[10pt] font-mono-code font-medium border transition-colors cursor-pointer ${
                categoryFilter === 'balance'
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              균형
            </button>
            <button
              onClick={() => setCategoryFilter('source')}
              className={`px-2.5 py-1 rounded-xs text-[10pt] font-mono-code font-medium border transition-colors cursor-pointer ${
                categoryFilter === 'source'
                  ? 'bg-[#008285] text-white border-[#008285]'
                  : 'bg-white text-[#006b6e] border-neutral-200 hover:bg-[#edf7f7]'
              }`}
            >
              출처
            </button>
          </div>

          {/* Editorial Principle Reminder */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-xs p-2.5 text-[10.5pt] text-black leading-snug">
            <span className="font-semibold block mb-0.5 text-[#008285]">언론 검증 원칙 안내</span>
            AI 검토는 근거 공백 및 표현상 편향 우려를 표시하며, 기사의 최종 검증과 편집 권한은 전적으로 취재 기자에게 있습니다.
          </div>

          {/* List of Critique Cards */}
          {filteredCritiques.length > 0 ? (
            <div className="space-y-2.5">
              {filteredCritiques.map((critique) => {
                const targetNode = article.nodes.find(n => n.id === critique.nodeId);

                return (
                  <div
                    key={critique.id}
                    id={`critique-card-${critique.id}`}
                    className="p-3.5 bg-white border border-neutral-200 hover:border-[#008285] rounded-xs shadow-2xs transition-all text-left"
                  >
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <div className="flex items-center space-x-1.5">
                        {getCategoryBadge(critique.category)}
                        <span className="font-semibold text-[10.5pt] text-black">
                          {critique.title}
                        </span>
                      </div>
                      <button
                        onClick={() => onDismissCritique(critique.id)}
                        className="text-neutral-400 hover:text-black p-0.5 cursor-pointer"
                        title="검토 완료 처리 (기자 확인)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[10.5pt] text-neutral-700 mb-2 leading-relaxed">
                      {critique.description}
                    </p>

                    {/* Target sentence excerpt if node linked */}
                    {targetNode && (
                      <button
                        onClick={() => onSelectNode(targetNode.id)}
                        className="w-full text-left p-2 bg-neutral-50 hover:bg-[#edf7f7] border border-neutral-200 rounded-xs text-[10.5pt] text-neutral-800 font-editorial italic mb-2 truncate transition-colors block cursor-pointer"
                        title="클릭하여 에디터 해당 노드로 이동"
                      >
                        해당 노드: "{targetNode.text.slice(0, 75)}..."
                      </button>
                    )}

                    {/* Suggested Fix if provided */}
                    {critique.suggestedFix && (
                      <div className="p-2 bg-[#edf7f7] border border-[#bce3e4] rounded-xs text-[10.5pt] text-black mb-2.5">
                        <span className="font-semibold block text-[10pt] text-[#006b6e] font-mono-code uppercase">
                          표현 수정 제안:
                        </span>
                        <span>{critique.suggestedFix}</span>
                      </div>
                    )}

                    {/* Critique Actions: Find evidence, Edit sentence, Dismiss */}
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[10pt]">
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => onFindEvidence(critique)}
                          className="px-2.5 py-1 bg-white hover:bg-[#edf7f7] text-black hover:text-[#008285] border border-neutral-200 rounded-xs text-[10pt] font-medium font-mono-code flex items-center space-x-1 transition-colors cursor-pointer"
                          title="취재 사료 및 녹취록에서 근거 검색"
                        >
                          <Search className="w-3 h-3 text-[#008285]" />
                          <span>근거 검색</span>
                        </button>

                        <button
                          onClick={() => onApplyFix(critique)}
                          className="px-2.5 py-1 bg-white hover:bg-neutral-100 text-black border border-neutral-200 rounded-xs text-[10pt] font-medium font-mono-code flex items-center space-x-1 transition-colors cursor-pointer"
                          title="문장 수정 적용하기"
                        >
                          <Edit3 className="w-3 h-3 text-black" />
                          <span>문장 수정</span>
                        </button>
                      </div>

                      <button
                        onClick={() => onDismissCritique(critique.id)}
                        className="text-[10pt] text-neutral-400 hover:text-black font-mono-code underline cursor-pointer"
                      >
                        확인 완료
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center bg-white border border-neutral-200 rounded-xs text-neutral-500">
              <CheckCircle2 className="w-6 h-6 text-[#008285] mx-auto mb-2" />
              <p className="font-semibold text-xs text-black mb-1">
                지적된 검토 사항 없음
              </p>
              <p className="text-[11px] text-neutral-500 mb-3">
                현재 모든 기사 문장이 뉴스룸 팩트체크 검증 기준을 충족하고 있습니다.
              </p>
              <button
                onClick={onRunReview}
                className="px-3 py-1.5 bg-[#edf7f7] hover:bg-[#e2f3f4] text-[#006b6e] border border-[#bce3e4] rounded-xs text-xs font-semibold inline-flex items-center space-x-1 font-mono-code cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-[#008285]" />
                <span>검토 재실행</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: SOURCES */}
      {activeTab === 'sources' && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-white">
          {/* Source Grounding Coverage Widget */}
          <div className="p-3.5 bg-white border border-neutral-200 rounded-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-[10.5pt] text-black">
                출처 연계율 (근거 검증)
              </span>
              <span className="font-mono-code font-bold text-[10.5pt] text-[#008285]">
                {coveragePercent}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden mb-2">
              <div 
                className="bg-[#008285] h-full rounded-full transition-all"
                style={{ width: `${coveragePercent}%` }}
              ></div>
            </div>
            <p className="text-[10pt] text-neutral-500">
              총 {totalNodes}개 노드 중 {nodesWithSources}개 노드가 1차 근거 사료와 연결되어 있습니다.
            </p>
          </div>

          {/* Unlinked Claims Alert */}
          {claimsWithoutSources.length > 0 && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xs">
              <div className="flex items-center space-x-1.5 text-black font-semibold text-[10.5pt] mb-1">
                <AlertTriangle className="w-4 h-4 text-[#008285] shrink-0" />
                <span>출처 미연결 주장 ({claimsWithoutSources.length})</span>
              </div>
              <p className="text-[10pt] text-neutral-600 mb-2 leading-relaxed">
                다음 문장은 1차 사료나 공문서 뒷받침 없이 서술된 일방적 주장 또는 해명입니다:
              </p>
              <div className="space-y-1.5">
                {claimsWithoutSources.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectNode(c.id)}
                    className="w-full text-left p-2 bg-white border border-neutral-200 rounded-xs text-[10.5pt] text-black italic truncate block hover:border-[#008285] cursor-pointer"
                  >
                    "{c.text}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Story Bibliography */}
          <div>
            <div className="text-[10pt] font-mono-code font-semibold uppercase text-neutral-500 mb-2">
              기사 인용 사료 목록
            </div>
            <div className="space-y-2">
              {materials.map(mat => {
                const citeCount = article.nodes.filter(n => n.linkedSourceIds?.includes(mat.id)).length;
                return (
                  <div 
                    key={mat.id}
                    className="p-2.5 bg-white border border-neutral-200 rounded-xs flex items-center justify-between text-[10.5pt]"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-black truncate">
                        {mat.title}
                      </div>
                      <div className="text-[10pt] text-neutral-400 font-mono-code">
                        {mat.outletOrSpeaker}
                      </div>
                    </div>
                    <span className="font-mono-code text-[10pt] px-2 py-0.5 rounded-xs bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4] shrink-0 font-semibold">
                      {citeCount}회 인용
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: ASK */}
      {activeTab === 'ask' && (
        <div className="flex-1 flex flex-col h-full bg-white">
          {/* Chat / Query History */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-white">
            {askHistory.map((item, idx) => (
              <div key={idx} className="space-y-1.5 text-[10.5pt]">
                {/* Journalist question */}
                <div className="bg-black text-white p-2.5 rounded-xs rounded-tr-none max-w-[90%] ml-auto font-medium">
                  {item.q}
                </div>
                {/* AI Grounded response */}
                <div className="bg-white border border-neutral-200 text-black p-3 rounded-xs rounded-tl-none max-w-[95%] text-left space-y-1.5 leading-relaxed shadow-2xs">
                  <div className="flex items-center justify-between text-[10pt] text-neutral-400 font-mono-code pb-1 border-b border-neutral-100">
                    <span className="flex items-center space-x-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#008285]" />
                      <span className="text-[#008285] font-semibold">취재 사료 기반 검증 답변</span>
                    </span>
                    <span>{item.timestamp}</span>
                  </div>
                  <div className="text-[10.5pt] whitespace-pre-wrap text-black font-editorial leading-relaxed">
                    {item.a}
                  </div>
                </div>
              </div>
            ))}

            {askLoading && (
              <div className="bg-white border border-neutral-200 p-3 rounded-xs text-[10.5pt] text-neutral-500 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 animate-spin text-[#008285]" />
                <span>취재 녹취록 및 공문서를 검색하는 중...</span>
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          <div className="px-3 py-2 border-t border-neutral-200 bg-white flex items-center space-x-2 overflow-x-auto text-[10pt] font-mono-code">
            <button
              onClick={() => setQuestionInput('손 이사가 거짓 양성 반응(False positive)에 대해 선서 하에 무엇이라고 진술했나요?')}
              className="px-2.5 py-1 bg-white border border-neutral-200 hover:border-[#008285] rounded-xs text-black hover:text-[#008285] shrink-0 cursor-pointer transition-colors"
            >
              손 이사 청문회 진술
            </button>
            <button
              onClick={() => setQuestionInput('에이펙스 공장 원시 시험에서 확인된 벤젠 최고 농도(ppb)는 얼마였나요?')}
              className="px-2.5 py-1 bg-white border border-neutral-200 hover:border-[#008285] rounded-xs text-black hover:text-[#008285] shrink-0 cursor-pointer transition-colors"
            >
              에이펙스 벤젠 최고 ppb 수치
            </button>
          </div>

          {/* Ask Input form */}
          <form onSubmit={handleSendQuestion} className="p-2.5 border-t border-neutral-200 bg-white flex items-center space-x-1.5">
            <input
              id="ask-assistant-input"
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="취재 자료에 대해 질문하세요 (예: 발언 시점, 수치)..."
              className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-xs text-[10.5pt] text-black placeholder:text-neutral-400 focus:outline-none focus:border-[#008285]"
            />
            <button
              id="btn-send-ask"
              type="submit"
              disabled={!questionInput.trim() || askLoading}
              className="p-2 bg-[#008285] hover:bg-[#006b6e] disabled:opacity-30 text-white rounded-xs transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Footer Status */}
      <div className="p-2.5 border-t border-neutral-200 bg-white text-[10pt] text-neutral-400 font-mono-code flex items-center justify-between">
        <span>보조 모드: 사료 연계 검증</span>
        <span>보도 기준: 로이터 언론윤리 핸드북</span>
      </div>
    </aside>
  );
};
