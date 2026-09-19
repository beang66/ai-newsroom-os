import React, { useState, useRef, useEffect } from 'react';
import { 
  GripVertical, 
  Plus, 
  MoreVertical, 
  Trash2, 
  Sparkles, 
  Link2, 
  Clock, 
  User, 
  Check, 
  AlertCircle, 
  Share2, 
  ArrowUp, 
  ArrowDown, 
  Copy, 
  FileText,
  Quote,
  HelpCircle,
  Wand2,
  Minimize2,
  Scale,
  Search,
  ExternalLink,
  ChevronDown,
  Image as ImageIcon,
  Camera,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { Article, ArticleNode, NodeType, ArticleStatus, MaterialItem } from '../types';

interface ArticleEditorProps {
  article: Article;
  materials: MaterialItem[];
  highlightedNodeId: string | null;
  onUpdateTitle: (title: string) => void;
  onUpdateStatus: (status: ArticleStatus) => void;
  onUpdateNode: (nodeId: string, updates: Partial<ArticleNode>) => void;
  onAddNode: (type: NodeType, afterNodeId?: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onMoveNode: (index: number, direction: 'up' | 'down') => void;
  onOpenSourcePreview: (materialId: string) => void;
  onRunReview: () => void;
  onOpenExport: () => void;
  isReviewing?: boolean;
}

interface FloatingToolbarState {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  nodeId: string;
}

export const ArticleEditor: React.FC<ArticleEditorProps> = ({
  article,
  materials,
  highlightedNodeId,
  onUpdateTitle,
  onUpdateStatus,
  onUpdateNode,
  onAddNode,
  onDeleteNode,
  onMoveNode,
  onOpenSourcePreview,
  onRunReview,
  onOpenExport,
  isReviewing = false,
}) => {
  const [activeMenuNodeId, setActiveMenuNodeId] = useState<string | null>(null);
  const [sourceSelectorNodeId, setSourceSelectorNodeId] = useState<string | null>(null);
  const [editingImageNodeId, setEditingImageNodeId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Floating selection toolbar
  const [floatingToolbar, setFloatingToolbar] = useState<FloatingToolbarState>({
    visible: false,
    x: 0,
    y: 0,
    selectedText: '',
    nodeId: '',
  });
  const [transformLoading, setTransformLoading] = useState(false);
  const [transformPreview, setTransformPreview] = useState<{ original: string; transformed: string; action: string } | null>(null);

  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.node-menu-container') && !target.closest('.source-selector-container')) {
        setActiveMenuNodeId(null);
        setSourceSelectorNodeId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen for text selection inside node content
  const handleMouseUp = (nodeId: string) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      // Don't close immediately if transformPreview is showing
      if (!transformPreview) {
        setFloatingToolbar(prev => ({ ...prev, visible: false }));
      }
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 3) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = editorContainerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };

      setFloatingToolbar({
        visible: true,
        x: rect.left - containerRect.left + (rect.width / 2),
        y: rect.top - containerRect.top - 46,
        selectedText: text,
        nodeId: nodeId,
      });
      setTransformPreview(null);
    }
  };

  // Perform text transformation (Rewrite, More neutral, More concise, Find source)
  const handleTransformAction = async (action: 'rewrite' | 'neutral' | 'concise' | 'find-source') => {
    if (!floatingToolbar.selectedText || !floatingToolbar.nodeId) return;

    setTransformLoading(true);
    try {
      const currentNode = article.nodes.find(n => n.id === floatingToolbar.nodeId);
      const response = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text: floatingToolbar.selectedText,
          context: currentNode?.text,
          materials: materials.map(m => ({ id: m.id, title: m.title, summary: m.summary })),
        }),
      });
      const data = await response.json();
      if (data.result) {
        setTransformPreview({
          original: floatingToolbar.selectedText,
          transformed: data.result,
          action,
        });
      }
    } catch (err) {
      console.error('Transform error:', err);
    } finally {
      setTransformLoading(false);
    }
  };

  // Apply transformed text
  const handleApplyTransform = () => {
    if (!transformPreview || !floatingToolbar.nodeId) return;
    const node = article.nodes.find(n => n.id === floatingToolbar.nodeId);
    if (!node) return;

    const newText = node.text.replace(transformPreview.original, transformPreview.transformed);
    onUpdateNode(node.id, { text: newText });
    setTransformPreview(null);
    setFloatingToolbar(prev => ({ ...prev, visible: false }));
  };

  const getNodeTypeBadge = (type: NodeType) => {
    switch (type) {
      case 'FACT':
        return (
          <span className="font-mono-code text-[10pt] font-bold tracking-wider px-2 py-0.5 rounded-xs bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4]">
            FACT
          </span>
        );
      case 'IMAGE':
        return (
          <span className="font-mono-code text-[10pt] font-bold tracking-wider px-2 py-0.5 rounded-xs bg-neutral-100 text-black border border-neutral-200 flex items-center space-x-1">
            <ImageIcon className="w-3 h-3 text-[#008285]" />
            <span>IMAGE</span>
          </span>
        );
      case 'QUOTE':
        return (
          <span className="font-mono-code text-[10pt] font-bold tracking-wider px-2 py-0.5 rounded-xs bg-white text-black border border-neutral-300">
            QUOTE
          </span>
        );
      case 'CONTEXT':
        return (
          <span className="font-mono-code text-[10pt] font-bold tracking-wider px-2 py-0.5 rounded-xs bg-neutral-50 text-neutral-600 border border-neutral-200">
            CONTEXT
          </span>
        );
      case 'CLAIM':
        return (
          <span className="font-mono-code text-[10pt] font-bold tracking-wider px-2 py-0.5 rounded-xs bg-[#edf7f7] text-[#008285] border border-[#bce3e4]">
            CLAIM
          </span>
        );
    }
  };

  // Drag & drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      const updatedNodes = [...article.nodes];
      const [removed] = updatedNodes.splice(draggedIndex, 1);
      updatedNodes.splice(targetIndex, 0, removed);
      // Re-order in parent
      const diff = targetIndex - draggedIndex;
      if (diff > 0) {
        for (let i = 0; i < diff; i++) {
          onMoveNode(draggedIndex + i, 'down');
        }
      } else {
        for (let i = 0; i < Math.abs(diff); i++) {
          onMoveNode(draggedIndex - i, 'up');
        }
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <main 
      ref={editorContainerRef}
      className="flex-1 bg-white h-[calc(100vh-3.25rem)] overflow-y-auto flex flex-col relative text-[11pt]"
      aria-label="Article Editor"
    >
      {/* Floating Selection Toolbar */}
      {floatingToolbar.visible && (
        <div 
          className="absolute z-40 bg-black text-white rounded-xs shadow-xl border border-neutral-700 py-1.5 px-2 flex items-center space-x-1.5 text-[10pt] select-none transition-all font-mono-code"
          style={{
            left: Math.max(16, Math.min(floatingToolbar.x - 140, 500)),
            top: Math.max(8, floatingToolbar.y),
          }}
        >
          {transformLoading ? (
            <div className="px-3 py-1 flex items-center space-x-2 text-neutral-300">
              <Sparkles className="w-4 h-4 animate-spin text-[#008285]" />
              <span>문맥 표현 분석 중...</span>
            </div>
          ) : transformPreview ? (
            <div className="p-2.5 max-w-sm text-left">
              <div className="text-[10pt] font-mono-code text-[#008285] uppercase tracking-wider mb-1 flex items-center justify-between font-semibold">
                <span>수정 제안 ({
                  transformPreview.action === 'rewrite' ? '문장 다듬기' :
                  transformPreview.action === 'neutral' ? '중립적 보도체' :
                  transformPreview.action === 'concise' ? '간결하게 압축' : '출처 추천'
                })</span>
                <button 
                  onClick={() => setTransformPreview(null)}
                  className="text-neutral-400 hover:text-white text-[10pt] p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="text-neutral-100 text-[10.5pt] mb-2 font-editorial italic bg-neutral-900 p-2 rounded-xs border border-neutral-700">
                "{transformPreview.transformed}"
              </div>
              <div className="flex items-center space-x-2">
                <button
                  id="btn-apply-transform"
                  onClick={handleApplyTransform}
                  className="px-2.5 py-1 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs text-[10pt] font-semibold cursor-pointer"
                >
                  수정안 반영
                </button>
                <button
                  onClick={() => setTransformPreview(null)}
                  className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xs text-[10pt] cursor-pointer"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                id="btn-floating-rewrite"
                onClick={() => handleTransformAction('rewrite')}
                className="px-2.5 py-1 hover:bg-neutral-800 rounded-xs flex items-center space-x-1 text-neutral-200 hover:text-white text-[10pt] cursor-pointer"
                title="가독성 및 능동적 보도 문체 개선"
              >
                <Wand2 className="w-3.5 h-3.5 text-[#008285]" />
                <span>문장 다듬기</span>
              </button>

              <button
                id="btn-floating-neutral"
                onClick={() => handleTransformAction('neutral')}
                className="px-2.5 py-1 hover:bg-neutral-800 rounded-xs flex items-center space-x-1 text-neutral-200 hover:text-white text-[10pt] cursor-pointer"
                title="주관적 편향 및 감정적 수식어 제거"
              >
                <Scale className="w-3.5 h-3.5 text-[#008285]" />
                <span>중립적 보도체</span>
              </button>

              <button
                id="btn-floating-concise"
                onClick={() => handleTransformAction('concise')}
                className="px-2.5 py-1 hover:bg-neutral-800 rounded-xs flex items-center space-x-1 text-neutral-200 hover:text-white text-[10pt] cursor-pointer"
                title="핵심 사실 위주로 간결하게 압축"
              >
                <Minimize2 className="w-3.5 h-3.5 text-[#008285]" />
                <span>간결하게 압축</span>
              </button>

              <div className="w-[1px] h-3.5 bg-neutral-700 my-auto"></div>

              <button
                id="btn-floating-find-source"
                onClick={() => handleTransformAction('find-source')}
                className="px-2.5 py-1 hover:bg-neutral-800 rounded-xs flex items-center space-x-1 text-neutral-200 hover:text-white text-[10pt] cursor-pointer"
                title="주장을 뒷받침할 1차 근거 사료 추천"
              >
                <Search className="w-3.5 h-3.5 text-[#008285]" />
                <span>출처 제안</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Editor Top Control Bar */}
      <div className="border-b border-neutral-200 bg-white sticky top-0 z-20 px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3.5">
          {/* Article Status Dropdown */}
          <div className="flex items-center space-x-2">
            <span className="text-[10pt] font-mono-code text-neutral-500 uppercase font-semibold">기사 상태:</span>
            <select
              id="article-status-select"
              value={article.status}
              onChange={(e) => onUpdateStatus(e.target.value as ArticleStatus)}
              className="font-mono-code text-[10.5pt] font-semibold px-2.5 py-1 bg-white border border-neutral-300 rounded-xs text-black focus:outline-none focus:border-[#008285] cursor-pointer"
            >
              <option value="DRAFT">초고 (DRAFT)</option>
              <option value="IN REVIEW">데스크 검토 (IN REVIEW)</option>
              <option value="LEGAL CHECK">법률/윤리 심의 (LEGAL CHECK)</option>
              <option value="READY FOR PRINT">최종 송고 승인 (READY FOR PRINT)</option>
            </select>
          </div>

          <span className="text-neutral-300">|</span>

          {/* Autosave badge */}
          <div className="flex items-center space-x-1.5 text-[10pt] text-neutral-500 font-mono-code">
            <span className="w-2 h-2 rounded-full bg-[#008285] inline-block"></span>
            <span>자동 저장: {article.lastSaved}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="editor-review-btn"
            onClick={onRunReview}
            disabled={isReviewing}
            className="px-3.5 py-1.5 bg-[#edf7f7] hover:bg-[#e2f3f4] text-[#006b6e] border border-[#bce3e4] rounded-xs text-[10.5pt] font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isReviewing ? 'animate-spin text-[#008285]' : 'text-[#008285]'}`} />
            <span>{isReviewing ? '검토 진행 중...' : 'AI 기사 검토'}</span>
          </button>

          <button
            id="editor-export-btn"
            onClick={onOpenExport}
            className="px-4 py-1.5 bg-black hover:bg-[#008285] text-white rounded-xs text-[10.5pt] font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>기사 송고</span>
          </button>
        </div>
      </div>

      {/* Primary Workspace Document Body */}
      <div className="max-w-4xl w-full mx-auto px-8 py-6 flex-1">
        {/* Article Headline Header */}
        <div className="mb-6 pb-4 border-b border-neutral-200">
          <div className="flex items-center space-x-2 text-[10pt] font-mono-code text-neutral-500 uppercase tracking-wider mb-2 font-medium">
            <span className="text-black font-semibold">{article.desk}</span>
            <span>•</span>
            <span>By {article.author}</span>
          </div>

          <input
            id="article-headline-input"
            type="text"
            value={article.title}
            onChange={(e) => onUpdateTitle(e.target.value)}
            placeholder="기사 표제(헤드라인)를 입력하세요..."
            className="w-full text-2xl font-bold font-editorial text-black tracking-tight bg-transparent border-none p-0 focus:outline-none focus:ring-0 placeholder:text-neutral-400"
          />
        </div>

        {/* Draggable Content Nodes List */}
        <div className="space-y-3.5">
          {article.nodes.map((node, index) => {
            const isHighlighted = highlightedNodeId === node.id;
            const linkedMaterials = materials.filter(m => node.linkedSourceIds?.includes(m.id));

            return (
              <div 
                key={node.id}
                id={`article-node-${node.id}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                className={`group relative rounded-xs border transition-all ${
                  isHighlighted 
                    ? 'border-[#008285] ring-2 ring-[#008285]/30 bg-[#edf7f7]/30'
                    : 'border-neutral-200 bg-white hover:border-[#008285]'
                } ${dragOverIndex === index ? 'border-t-2 border-t-[#008285]' : ''}`}
              >
                {/* Node Metadata & Controls Bar */}
                <div className="flex items-center justify-between px-3.5 py-2 bg-neutral-50/70 border-b border-neutral-200 text-[10pt]">
                  <div className="flex items-center space-x-2">
                    {/* Drag Handle */}
                    <button 
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 -ml-1 p-0.5"
                      title="드래그하여 노드 순서 변경"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>

                    {/* Node Type Badge with dropdown switcher */}
                    <div className="relative group/type">
                      <select
                        id={`node-type-select-${node.id}`}
                        value={node.type}
                        onChange={(e) => onUpdateNode(node.id, { type: e.target.value as NodeType })}
                        className="bg-transparent font-mono-code text-[10pt] font-bold tracking-wider cursor-pointer border-none p-0 focus:outline-none"
                      >
                        <option value="FACT">FACT (팩트)</option>
                        <option value="IMAGE">IMAGE (보도 사진)</option>
                        <option value="QUOTE">QUOTE (인용)</option>
                        <option value="CONTEXT">CONTEXT (배경)</option>
                        <option value="CLAIM">CLAIM (주장)</option>
                      </select>
                    </div>

                    <div>{getNodeTypeBadge(node.type)}</div>

                    {/* AI Generated Label */}
                    {node.isAiGenerated && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10pt] font-mono-code font-bold tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                        AI 생성 문장
                      </span>
                    )}

                    {/* Status badge */}
                    {node.status === 'needs_review' && (
                      <span className="inline-flex items-center space-x-1 text-[10pt] font-mono-code font-medium text-amber-700 bg-amber-50 px-2 py-0.5 border border-amber-200 rounded-xs">
                        <AlertCircle className="w-3 h-3" />
                        <span>검토 필요</span>
                      </span>
                    )}
                  </div>

                  {/* Right side of node header: Sources & Actions */}
                  <div className="flex items-center space-x-2">
                    {/* Linked Sources Badge & Popover trigger */}
                    <div className="relative source-selector-container">
                      <button
                        id={`btn-connect-source-${node.id}`}
                        onClick={() => setSourceSelectorNodeId(sourceSelectorNodeId === node.id ? null : node.id)}
                        className={`text-[10pt] font-mono-code px-2.5 py-1 rounded-xs flex items-center space-x-1.5 border transition-colors cursor-pointer ${
                          node.linkedSourceIds && node.linkedSourceIds.length > 0
                            ? 'bg-[#edf7f7] text-[#006b6e] border-[#bce3e4] hover:bg-[#e2f3f4]'
                            : 'bg-white text-neutral-500 border-dashed border-neutral-300 hover:text-black hover:border-neutral-400'
                        }`}
                        title="취재 증거 자료 연결 및 확인"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>
                          {node.linkedSourceIds && node.linkedSourceIds.length > 0
                            ? `${node.linkedSourceIds.length}개 출처 연계`
                            : '+ 출처 연결'}
                        </span>
                      </button>

                      {/* Source selector dropdown */}
                      {sourceSelectorNodeId === node.id && (
                        <div className="absolute right-0 top-7 z-30 w-80 bg-white rounded-xs shadow-lg border border-neutral-200 p-2.5 text-left select-none">
                          <div className="text-[10pt] font-mono-code font-bold uppercase text-neutral-500 mb-2 pb-1.5 border-b border-neutral-100">
                            취재 자료 및 사료 연결
                          </div>
                          <div className="max-h-52 overflow-y-auto space-y-1">
                            {materials.map((mat) => {
                              const isLinked = node.linkedSourceIds?.includes(mat.id);
                              return (
                                <button
                                  key={mat.id}
                                  onClick={() => {
                                    const current = node.linkedSourceIds || [];
                                    const next = isLinked 
                                      ? current.filter(id => id !== mat.id)
                                      : [...current, mat.id];
                                    onUpdateNode(node.id, { linkedSourceIds: next });
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-xs text-[10.5pt] flex items-center justify-between transition-colors cursor-pointer ${
                                    isLinked ? 'bg-[#edf7f7] text-[#006b6e] font-semibold' : 'hover:bg-neutral-50 text-black'
                                  }`}
                                >
                                  <span className="truncate pr-2">{mat.title}</span>
                                  {isLinked && <Check className="w-3.5 h-3.5 text-[#008285] shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Move Up/Down Controls */}
                    <div className="flex items-center space-x-0.5 text-neutral-400">
                      <button
                        onClick={() => onMoveNode(index, 'up')}
                        disabled={index === 0}
                        className="p-1 hover:text-black disabled:opacity-20 cursor-pointer"
                        title="노드 위로 이동"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onMoveNode(index, 'down')}
                        disabled={index === article.nodes.length - 1}
                        className="p-1 hover:text-black disabled:opacity-20 cursor-pointer"
                        title="노드 아래로 이동"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Node More Menu */}
                    <div className="relative node-menu-container">
                      <button
                        onClick={() => setActiveMenuNodeId(activeMenuNodeId === node.id ? null : node.id)}
                        className="p-1 text-neutral-400 hover:text-black rounded-xs cursor-pointer"
                        title="노드 메뉴"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {activeMenuNodeId === node.id && (
                        <div className="absolute right-0 top-7 z-30 w-48 bg-white rounded-xs shadow-lg border border-neutral-200 py-1.5 text-[10.5pt]">
                          <button
                            onClick={() => {
                              onUpdateNode(node.id, { isAiGenerated: !node.isAiGenerated });
                              setActiveMenuNodeId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-neutral-50 text-black flex items-center space-x-2 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-[#008285]" />
                            <span>AI 생성 표시 토글</span>
                          </button>

                          <button
                            onClick={() => {
                              onUpdateNode(node.id, { 
                                status: node.status === 'verified' ? 'needs_review' : 'verified' 
                              });
                              setActiveMenuNodeId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-neutral-50 text-black flex items-center space-x-2 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 text-[#008285]" />
                            <span>검증 완료 토글</span>
                          </button>

                          <div className="border-t border-neutral-100 my-1"></div>

                          <button
                            onClick={() => {
                              onDeleteNode(node.id);
                              setActiveMenuNodeId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center space-x-2 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>노드 삭제</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Node Body Content */}
                <div className="p-4" onMouseUp={() => handleMouseUp(node.id)}>
                  {/* IMAGE node dedicated visual rendering & controls */}
                  {node.type === 'IMAGE' && (
                    <div className="mb-3">
                      {/* Image Preview Box */}
                      {node.imageUrl ? (
                        <div className="relative group/img rounded-xs overflow-hidden border border-neutral-200 bg-neutral-900 mb-3 shadow-2xs">
                          <img
                            src={node.imageUrl}
                            alt={node.altText || node.caption || '보도 사진'}
                            className="w-full max-h-[400px] object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-2 right-2 flex items-center space-x-1.5 opacity-90 group-hover/img:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setEditingImageNodeId(editingImageNodeId === node.id ? null : node.id)}
                              className="px-2.5 py-1 bg-black/80 hover:bg-[#008285] text-white text-[9.5pt] font-mono-code rounded-xs backdrop-blur-2xs flex items-center space-x-1 border border-white/20 transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>{editingImageNodeId === node.id ? '설정 닫기' : '사진 교체 / 설정'}</span>
                            </button>
                          </div>
                          {node.photoCredit && (
                            <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[9pt] font-mono-code px-2 py-0.5 rounded-xs backdrop-blur-2xs">
                              {node.photoCredit}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-6 border-2 border-dashed border-[#bce3e4] bg-[#edf7f7]/40 rounded-xs text-center mb-3">
                          <ImageIcon className="w-8 h-8 text-[#008285] mx-auto mb-2" />
                          <p className="font-semibold text-black text-[11pt] mb-1">
                            등록된 보도 사진이 없습니다
                          </p>
                          <p className="text-neutral-500 text-[10pt] mb-3">
                            취재 자료 보관소에 등록된 이미지를 선택하거나 이미지 URL을 입력하세요.
                          </p>
                          <button
                            type="button"
                            onClick={() => setEditingImageNodeId(editingImageNodeId === node.id ? null : node.id)}
                            className="px-3.5 py-1.5 bg-[#008285] hover:bg-[#006b6e] text-white text-[10pt] font-medium rounded-xs inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>취재 자료 사진 선택 및 URL 입력</span>
                          </button>
                        </div>
                      )}

                      {/* Image Source / URL Selection Panel */}
                      {(editingImageNodeId === node.id || !node.imageUrl) && (
                        <div className="p-3 bg-white border border-neutral-200 rounded-xs mb-3 space-y-3 shadow-2xs">
                          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-200">
                            <span className="font-mono-code text-[10pt] font-bold text-black uppercase">
                              보도 사진 선택 및 교체
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingImageNodeId(null)}
                              className="text-[10pt] text-neutral-400 hover:text-black cursor-pointer"
                            >
                              닫기
                            </button>
                          </div>

                          {/* Quick pick from registered image materials */}
                          {materials.filter(m => m.type === 'image').length > 0 && (
                            <div>
                              <label className="block text-[10pt] font-medium text-black mb-1.5">
                                취재 자료 보관소 사진에서 선택:
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                {materials.filter(m => m.type === 'image').map((mat) => (
                                  <button
                                    key={mat.id}
                                    type="button"
                                    onClick={() => {
                                      const currentLinked = node.linkedSourceIds || [];
                                      const newLinked = currentLinked.includes(mat.id)
                                        ? currentLinked
                                        : [...currentLinked, mat.id];
                                      onUpdateNode(node.id, {
                                        imageUrl: mat.imageUrl || node.imageUrl,
                                        caption: node.caption || mat.caption || mat.title,
                                        photoCredit: node.photoCredit || mat.photoCredit || `사진=${mat.outletOrSpeaker}`,
                                        text: node.caption || mat.caption || mat.title,
                                        linkedSourceIds: newLinked
                                      });
                                      setEditingImageNodeId(null);
                                    }}
                                    className="p-2 border border-neutral-200 hover:border-[#008285] bg-white rounded-xs text-left flex items-start space-x-2 transition-all group/item cursor-pointer"
                                  >
                                    {mat.imageUrl && (
                                      <img
                                        src={mat.imageUrl}
                                        alt={mat.title}
                                        className="w-14 h-12 object-cover rounded-xs shrink-0 border border-neutral-100"
                                        referrerPolicy="no-referrer"
                                      />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10pt] font-semibold text-black truncate group-hover/item:text-[#008285]">
                                        {mat.title}
                                      </p>
                                      <p className="text-[9pt] text-neutral-500 truncate">
                                        {mat.photoCredit || mat.outletOrSpeaker}
                                      </p>
                                      <span className="text-[8.5pt] text-[#008285] font-mono-code font-medium">
                                        선택 적용 →
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Direct URL Input */}
                          <div>
                            <label className="block text-[10pt] font-medium text-black mb-1">
                              직접 이미지 URL 입력:
                            </label>
                            <input
                              type="url"
                              value={node.imageUrl || ''}
                              onChange={(e) => onUpdateNode(node.id, { imageUrl: e.target.value })}
                              placeholder="https://images.unsplash.com/..."
                              className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-xs text-[10pt] text-black focus:outline-none focus:border-[#008285]"
                            />
                          </div>
                        </div>
                      )}

                      {/* Photo Metadata: Photographer Credit & Alt Text */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2.5 bg-neutral-50 border border-neutral-200 rounded-xs text-[10pt] text-neutral-600 font-mono-code mb-2">
                        <div className="flex items-center space-x-2">
                          <Camera className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="text-neutral-500 shrink-0">사진 출처/크레딧:</span>
                          <input
                            type="text"
                            value={node.photoCredit || ''}
                            onChange={(e) => onUpdateNode(node.id, { photoCredit: e.target.value })}
                            placeholder="예: 사진=특별취재팀 박민우 기자"
                            className="bg-transparent text-black font-medium focus:outline-none border-b border-transparent focus:border-[#008285] flex-1 px-1 text-[10pt]"
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-neutral-500 shrink-0">웹 대체 텍스트:</span>
                          <input
                            type="text"
                            value={node.altText || ''}
                            onChange={(e) => onUpdateNode(node.id, { altText: e.target.value })}
                            placeholder="스크린리더용 이미지 설명"
                            className="bg-transparent text-black font-medium focus:outline-none border-b border-transparent focus:border-[#008285] flex-1 px-1 text-[10pt]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* QUOTE node extra metadata: Original interview source & timestamp */}
                  {node.type === 'QUOTE' && (
                    <div className="mb-3 p-2.5 bg-neutral-50 border border-neutral-200 rounded-xs flex flex-wrap items-center gap-3 text-[10pt] text-neutral-600 font-mono-code">
                      <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
                        <User className="w-4 h-4 text-neutral-400 shrink-0" />
                        <span className="text-neutral-500">취재원:</span>
                        <input
                          type="text"
                          value={node.interviewSource || ''}
                          onChange={(e) => onUpdateNode(node.id, { interviewSource: e.target.value })}
                          placeholder="인터뷰 대상자 이름, 직책..."
                          className="bg-transparent text-black font-semibold focus:outline-none border-b border-transparent focus:border-[#008285] flex-1 px-1 text-[10pt]"
                        />
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                        <span className="text-neutral-500">타임스탬프:</span>
                        <input
                          type="text"
                          value={node.timestamp || ''}
                          onChange={(e) => onUpdateNode(node.id, { timestamp: e.target.value })}
                          placeholder="예: 14:32"
                          className="w-24 bg-transparent text-black font-medium focus:outline-none border-b border-transparent focus:border-[#008285] px-1 text-[10pt]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Main Editable Text / Caption Area */}
                  {node.type === 'IMAGE' ? (
                    <div>
                      <label className="block text-[9.5pt] font-mono-code text-neutral-500 uppercase font-semibold mb-1">
                        보도 사진 캡션 (기사 본문 설명문)
                      </label>
                      <textarea
                        id={`node-text-${node.id}`}
                        value={node.caption || node.text}
                        onChange={(e) => onUpdateNode(node.id, { caption: e.target.value, text: e.target.value })}
                        rows={Math.max(2, Math.ceil((node.caption || node.text || '').length / 85))}
                        className="w-full resize-none text-[11pt] leading-relaxed font-editorial text-black bg-white p-2 border border-neutral-200 rounded-xs focus:outline-none focus:border-[#008285]"
                        placeholder="사진 설명 및 보도 캡션을 입력하세요 (예: 17일 국회 본청 회의실에서 열린 예산결산특별위원회 회의에서...)"
                      />
                    </div>
                  ) : (
                    <textarea
                      id={`node-text-${node.id}`}
                      value={node.text}
                      onChange={(e) => onUpdateNode(node.id, { text: e.target.value })}
                      rows={Math.max(2, Math.ceil(node.text.length / 85))}
                      className={`w-full resize-none text-[12pt] leading-relaxed font-editorial text-black bg-transparent border-none p-0 focus:outline-none focus:ring-0 placeholder:text-neutral-400 ${
                        node.type === 'QUOTE' ? 'italic text-black pl-3 border-l-2 border-[#008285]' : ''
                      }`}
                      placeholder="팩트 문장, 취재 배경, 주장 또는 진술 내용을 입력하세요..."
                    />
                  )}

                  {/* Linked Evidence Chips */}
                  {linkedMaterials.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-neutral-100 flex flex-wrap items-center gap-2">
                      <span className="text-[10pt] font-mono-code text-neutral-500 uppercase font-semibold">연계 출처:</span>
                      {linkedMaterials.map((mat) => (
                        <button
                          key={mat.id}
                          onClick={() => onOpenSourcePreview(mat.id)}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-[#edf7f7] hover:bg-[#e2f3f4] text-[#006b6e] text-[10pt] font-mono-code rounded-xs border border-[#bce3e4] transition-colors cursor-pointer"
                          title="클릭하여 원문 및 증거자료 미리보기"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#008285]" />
                          <span className="truncate max-w-[200px]">{mat.title}</span>
                          <ExternalLink className="w-3 h-3 text-[#008285]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inline Add Node Divider Control Between Nodes */}
                <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <div className="bg-white border border-neutral-300 shadow-sm rounded-full px-2.5 py-1 flex items-center space-x-1.5 text-[10pt] font-mono-code font-medium text-black">
                    <button
                      onClick={() => onAddNode('FACT', node.id)}
                      className="hover:text-[#008285] px-1 py-0.5 cursor-pointer"
                    >
                      + 팩트
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button
                      onClick={() => onAddNode('IMAGE', node.id)}
                      className="hover:text-[#008285] px-1 py-0.5 font-semibold text-[#006b6e] cursor-pointer"
                    >
                      + 사진
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button
                      onClick={() => onAddNode('QUOTE', node.id)}
                      className="hover:text-[#008285] px-1 py-0.5 cursor-pointer"
                    >
                      + 인용
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button
                      onClick={() => onAddNode('CONTEXT', node.id)}
                      className="hover:text-[#008285] px-1 py-0.5 cursor-pointer"
                    >
                      + 배경
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button
                      onClick={() => onAddNode('CLAIM', node.id)}
                      className="hover:text-[#008285] px-1 py-0.5 cursor-pointer"
                    >
                      + 주장
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Add Node Bar */}
        <div className="mt-8 pt-4 border-t border-dashed border-neutral-300 flex flex-col items-center justify-center p-4 bg-white rounded-xs">
          <p className="text-[10pt] text-neutral-500 font-mono-code uppercase tracking-wider mb-2.5 font-semibold">
            새 기사 노드 추가
          </p>
          <div className="flex items-center space-x-2">
            <button
              id="btn-add-fact-bottom"
              onClick={() => onAddNode('FACT')}
              className="px-3.5 py-1.5 bg-white hover:border-[#008285] hover:text-[#008285] text-black border border-neutral-200 rounded-xs text-[10.5pt] font-mono-code font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-black" />
              <span>+ 팩트(FACT)</span>
            </button>

            <button
              id="btn-add-image-bottom"
              onClick={() => onAddNode('IMAGE')}
              className="px-3.5 py-1.5 bg-[#edf7f7] hover:bg-[#008285] hover:text-white text-[#006b6e] border border-[#bce3e4] rounded-xs text-[10.5pt] font-mono-code font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer group"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#008285] group-hover:text-white" />
              <span>+ 보도 사진(IMAGE)</span>
            </button>

            <button
              id="btn-add-quote-bottom"
              onClick={() => onAddNode('QUOTE')}
              className="px-3.5 py-1.5 bg-white hover:border-[#008285] hover:text-[#008285] text-black border border-neutral-200 rounded-xs text-[10.5pt] font-mono-code font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Quote className="w-3.5 h-3.5 text-black" />
              <span>+ 인용(QUOTE)</span>
            </button>

            <button
              id="btn-add-context-bottom"
              onClick={() => onAddNode('CONTEXT')}
              className="px-3.5 py-1.5 bg-white hover:border-[#008285] hover:text-[#008285] text-black border border-neutral-200 rounded-xs text-[10.5pt] font-mono-code font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-black" />
              <span>+ 배경(CONTEXT)</span>
            </button>

            <button
              id="btn-add-claim-bottom"
              onClick={() => onAddNode('CLAIM')}
              className="px-3.5 py-1.5 bg-white hover:border-[#008285] hover:text-[#008285] text-black border border-neutral-200 rounded-xs text-[10.5pt] font-mono-code font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-black" />
              <span>+ 주장(CLAIM)</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
