import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Search,
  Link2,
  ExternalLink,
  RotateCcw,
  Check,
  X,
  Volume2,
  ShieldCheck,
  Eye,
  Filter,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import {
  VerificationIssue,
  IssueSeverity,
  IssueStatus,
  IssueCategory,
  EvidenceState,
} from '../types';

export const VerificationPanel: React.FC = () => {
  const {
    article,
    verificationIssues,
    selectedIssueId,
    setSelectedIssueId,
    jumpToIssueSentence,
    updateIssueStatus,
    applySpellingCorrection,
    linkSourceToIssue,
    runFullVerification,
    isVerifying,
    openSourceSearchWithQuery,
    jumpToInterviewFromIssue,
    sources,
    isLocalProcessingOnly,
  } = useNewsroom();

  const [severityFilter, setSeverityFilter] = useState<'all' | IssueSeverity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | IssueStatus>('all');
  const [sourceDropdownIssueId, setSourceDropdownIssueId] = useState<string | null>(null);

  // Filter issues
  const filteredIssues = verificationIssues.filter(issue => {
    if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
    return true;
  });

  const criticalCount = verificationIssues.filter(i => i.severity === 'critical' && i.status === 'unconfirmed').length;
  const reviewCount = verificationIssues.filter(i => i.severity === 'review' && i.status === 'unconfirmed').length;
  const suggestionCount = verificationIssues.filter(i => i.severity === 'suggestion' && i.status === 'unconfirmed').length;

  const getSeverityBadge = (severity: IssueSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
            <AlertCircle className="w-3 h-3 text-red-600" />
            우선 확인
          </span>
        );
      case 'review':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            확인 필요
          </span>
        );
      case 'suggestion':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
            <Info className="w-3 h-3 text-slate-500" />
            수정 제안
          </span>
        );
    }
  };

  const getEvidenceStateDescription = (state: EvidenceState, note?: string) => {
    switch (state) {
      case 'no_evidence_in_sources':
        return (
          <div className="flex items-start gap-1.5 text-red-800 bg-red-50/70 p-2 rounded border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">현재 연결된 자료에서 확인되지 않음</div>
              <div className="text-[10px] text-red-600 mt-0.5">
                연결된 3건의 보도자료 및 공공 보고서 자료에 해당 수치가 존재하지 않습니다.
              </div>
            </div>
          </div>
        );
      case 'contradiction':
        return (
          <div className="flex items-start gap-1.5 text-amber-900 bg-amber-50/70 p-2 rounded border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">취재 녹취 원음과 발언 불일치 감지</div>
              <div className="text-[10px] text-amber-800 mt-0.5">
                {note || '원음 인터뷰 전사본 대조가 필요합니다.'}
              </div>
            </div>
          </div>
        );
      case 'linked':
        return (
          <div className="flex items-start gap-1.5 text-emerald-800 bg-emerald-50/70 p-2 rounded border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">공식 근거 문서 연결됨</div>
              <div className="text-[10px] text-emerald-700 mt-0.5">{note}</div>
            </div>
          </div>
        );
      case 'search_failed':
        return (
          <div className="flex items-start gap-1.5 text-slate-700 bg-slate-100 p-2 rounded border border-slate-200">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">자료 검색 실패 / 타임아웃</div>
              <div className="text-[10px] text-slate-500 mt-0.5">검색 쿼리를 재시도하세요.</div>
            </div>
          </div>
        );
      case 'unverified':
      default:
        return (
          <div className="flex items-start gap-1.5 text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">근거 미확인 (독립 검증 필요)</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{note || '관련 자료 검색 권장'}</div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs select-none">
      {/* Verification Header: Full analysis action & version state */}
      <div className="bg-white p-3 rounded-lg border border-[#E3E6E9] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm text-[#20252C] flex items-center gap-1.5">
              <span>기사 팩트체크 & 검증</span>
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                시뮬레이션
              </span>
            </div>
            <div className="text-[11px] text-[#626C78] mt-0.5 font-mono">
              기준: 원고 v{article.lastReviewedVersion} · {article.lastReviewedAt.slice(-8)}
            </div>
          </div>

          <button
            onClick={runFullVerification}
            disabled={isVerifying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2457D6] hover:bg-[#1D46AF] text-white font-medium rounded text-xs transition-colors shrink-0 disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? '분석 중...' : '전체 검증 실행'}</span>
          </button>
        </div>

        {/* Lightweight typing check vs full run notice */}
        <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2 flex items-center justify-between">
          <span>작성 중 상시 점검 활성 (팝업 방지)</span>
          <span className="text-[10px] text-emerald-600 font-medium">실시간 감지 중</span>
        </div>

        {/* Outdated analysis warning if edited */}
        {article.isEditedSinceReview && (
          <div className="p-2 bg-amber-50 rounded border border-amber-200 text-amber-900 text-[11px] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>본문 수정됨: 분석 시점과 일치하지 않는 문장이 있습니다.</span>
          </div>
        )}
      </div>

      {/* Filter Tabs by Severity */}
      <div className="flex items-center gap-1 p-1 bg-[#F6F7F8] rounded-lg border border-[#E3E6E9]">
        <button
          onClick={() => setSeverityFilter('all')}
          className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors text-center ${
            severityFilter === 'all'
              ? 'bg-white text-[#20252C] shadow-xs font-semibold'
              : 'text-[#626C78] hover:text-[#20252C]'
          }`}
        >
          전체 ({verificationIssues.length})
        </button>
        <button
          onClick={() => setSeverityFilter('critical')}
          className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors text-center ${
            severityFilter === 'critical'
              ? 'bg-white text-red-700 shadow-xs font-bold'
              : 'text-[#626C78] hover:text-red-600'
          }`}
        >
          우선 확인 ({criticalCount})
        </button>
        <button
          onClick={() => setSeverityFilter('review')}
          className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors text-center ${
            severityFilter === 'review'
              ? 'bg-white text-amber-800 shadow-xs font-bold'
              : 'text-[#626C78] hover:text-amber-700'
          }`}
        >
          확인 필요 ({reviewCount})
        </button>
        <button
          onClick={() => setSeverityFilter('suggestion')}
          className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors text-center ${
            severityFilter === 'suggestion'
              ? 'bg-white text-slate-800 shadow-xs font-bold'
              : 'text-[#626C78] hover:text-slate-800'
          }`}
        >
          제안 ({suggestionCount})
        </button>
      </div>

      {/* Filter Tabs by Processing Status */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 px-1">
        <span className="text-slate-400">처리 상태:</span>
        <button
          onClick={() => setStatusFilter('all')}
          className={`hover:underline ${statusFilter === 'all' ? 'text-[#2457D6] font-bold' : ''}`}
        >
          전체
        </button>
        <span>·</span>
        <button
          onClick={() => setStatusFilter('unconfirmed')}
          className={`hover:underline ${statusFilter === 'unconfirmed' ? 'text-[#2457D6] font-bold' : ''}`}
        >
          확인 전
        </button>
        <span>·</span>
        <button
          onClick={() => setStatusFilter('confirmed')}
          className={`hover:underline ${statusFilter === 'confirmed' ? 'text-[#2457D6] font-bold' : ''}`}
        >
          확인 완료
        </button>
        <span>·</span>
        <button
          onClick={() => setStatusFilter('ignored')}
          className={`hover:underline ${statusFilter === 'ignored' ? 'text-[#2457D6] font-bold' : ''}`}
        >
          무시
        </button>
      </div>

      {/* Verification Cards List */}
      <div className="space-y-3">
        {filteredIssues.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-lg border border-[#E3E6E9]">
            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-600">선택한 조건의 검토 항목이 없습니다.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              원고 본문을 수정 후 [전체 검증 실행]을 누르면 새 항목이 분석됩니다.
            </p>
          </div>
        ) : (
          filteredIssues.map(issue => {
            const isSelected = selectedIssueId === issue.id;

            return (
              <div
                key={issue.id}
                className={`bg-white rounded-lg border transition-all p-3.5 space-y-3 ${
                  isSelected
                    ? 'border-[#2457D6] ring-1 ring-[#2457D6]/30 shadow-xs'
                    : 'border-[#E3E6E9] hover:border-slate-300'
                }`}
              >
                {/* 1. Severity & Category & Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {getSeverityBadge(issue.severity)}
                    <span className="text-[11px] font-semibold text-[#626C78] bg-slate-100 px-1.5 py-0.5 rounded">
                      {issue.category}
                    </span>
                  </div>

                  {/* Processing Status Badge */}
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                      issue.status === 'confirmed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : issue.status === 'ignored'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {issue.status === 'confirmed'
                      ? '사용자 확인 완료'
                      : issue.status === 'ignored'
                      ? '무시됨'
                      : '확인 전'}
                  </span>
                </div>

                {/* 2. Problem Sentence */}
                <div className="p-2.5 bg-slate-50 rounded border-l-2 border-slate-300 text-xs text-[#20252C] font-serif leading-relaxed">
                  "{issue.sentenceText}"
                </div>

                {/* 3. Reason for review */}
                <div className="text-[12px] text-[#20252C] leading-normal font-normal">
                  <span className="font-semibold text-slate-700">확인 이유: </span>
                  {issue.reason}
                </div>

                {/* Spelling Before/After Box if spelling issue */}
                {issue.spellingCorrection && (
                  <div className="p-2.5 bg-blue-50/50 rounded border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-red-700 line-through">
                        {issue.spellingCorrection.before}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="text-emerald-700 font-bold">
                        {issue.spellingCorrection.after}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {issue.spellingCorrection.explanation}
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-blue-100">
                      <button
                        onClick={() => applySpellingCorrection(issue.id)}
                        className="flex-1 py-1 bg-[#2457D6] hover:bg-[#1D46AF] text-white rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        교정 적용
                      </button>
                      <button
                        onClick={() => updateIssueStatus(issue.id, 'ignored')}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 rounded text-[11px] border border-slate-200 transition-colors"
                      >
                        원문 유지
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Evidence State */}
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-slate-400 font-mono">
                    근거 상태
                  </div>
                  {getEvidenceStateDescription(issue.evidenceState, issue.evidenceNote)}
                </div>

                {/* 5. Next Actions */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 select-none">
                  {/* Jump to body */}
                  <button
                    onClick={() => jumpToIssueSentence(issue.id)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[#20252C] rounded font-medium text-[11px] transition-colors flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3 text-slate-500" />
                    본문 이동
                  </button>

                  {/* Related Source Search */}
                  {issue.category !== '맞춤법' && (
                    <button
                      onClick={() =>
                        openSourceSearchWithQuery(
                          issue.category === '수치·날짜·고유명사'
                            ? '재생에너지 전환율 통계'
                            : '송전망 특별법 산자위',
                          issue.id
                        )
                      }
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[#2457D6] rounded font-medium text-[11px] transition-colors flex items-center gap-1"
                    >
                      <Search className="w-3 h-3 text-[#2457D6]" />
                      관련 자료 검색
                    </button>
                  )}

                  {/* Interview quote reconciliation jump */}
                  {issue.interviewQuoteRef && (
                    <button
                      onClick={() => jumpToInterviewFromIssue(issue)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-medium text-[11px] transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <Volume2 className="w-3 h-3" />
                      인터뷰 녹취 대조 (02:45)
                    </button>
                  )}

                  {/* Link Source dropdown toggle */}
                  {issue.category !== '맞춤법' && (
                    <div className="relative">
                      <button
                        onClick={() =>
                          setSourceDropdownIssueId(
                            sourceDropdownIssueId === issue.id ? null : issue.id
                          )
                        }
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" />
                        출처 연결
                      </button>

                      {sourceDropdownIssueId === issue.id && (
                        <div className="absolute right-0 bottom-full mb-1 w-64 bg-white border border-[#E3E6E9] rounded-lg shadow-lg p-1.5 z-40 text-xs">
                          <div className="px-2 py-1 text-[10px] text-slate-400 font-mono border-b border-slate-100">
                            연결할 취재 근거 문서 선택
                          </div>
                          {sources.map(src => (
                            <button
                              key={src.id}
                              onClick={() => {
                                linkSourceToIssue(issue.id, src.id);
                                setSourceDropdownIssueId(null);
                              }}
                              className="w-full text-left p-1.5 hover:bg-slate-50 rounded text-[11px] text-[#20252C] truncate"
                            >
                              <div className="font-medium truncate">{src.title}</div>
                              <div className="text-[10px] text-slate-400">{src.publisher}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status Toggle buttons */}
                  {issue.status !== 'confirmed' && (
                    <button
                      onClick={() => updateIssueStatus(issue.id, 'confirmed')}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-medium transition-colors ml-auto flex items-center gap-1"
                      title="출처 연결만으로 자동 완료되지 않으며 기자가 직접 확인 완료해야 합니다."
                    >
                      <Check className="w-3 h-3" />
                      확인 완료
                    </button>
                  )}

                  {issue.status !== 'ignored' && (
                    <button
                      onClick={() => updateIssueStatus(issue.id, 'ignored')}
                      className="px-2 py-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded text-[11px] transition-colors"
                    >
                      무시
                    </button>
                  )}

                  {issue.status === 'confirmed' && (
                    <button
                      onClick={() => updateIssueStatus(issue.id, 'unconfirmed')}
                      className="px-2 py-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded text-[11px] transition-colors ml-auto"
                    >
                      확인 전으로 되돌리기
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Privacy note */}
      <div className="p-3 bg-slate-50 rounded-lg border border-[#E3E6E9] text-[11px] text-slate-500 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          민감 취재 자료 외부 AI 전송 방지: 모든 텍스트 대조 및 오탈자 검토는 로컬 규격으로 처리됩니다.
        </span>
      </div>
    </div>
  );
};
