import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { MaterialsPanel } from './components/MaterialsPanel';
import { ArticleEditor } from './components/ArticleEditor';
import { IntelligencePanel } from './components/IntelligencePanel';
import { SourcePreviewModal } from './components/SourcePreviewModal';
import { AddMaterialModal } from './components/AddMaterialModal';
import { ExportModal } from './components/ExportModal';
import { ArticlesView } from './components/ArticlesView';
import { SourcesLibraryView } from './components/SourcesLibraryView';
import { 
  Article, 
  ArticleNode, 
  ArticleStatus, 
  CritiqueCard, 
  MaterialItem, 
  MaterialType, 
  NavSection, 
  NodeType 
} from './types';
import { 
  INITIAL_ARTICLE, 
  INITIAL_MATERIALS, 
  INITIAL_CRITIQUES 
} from './data/mockData';

export default function App() {
  const [currentNav, setCurrentNav] = useState<NavSection>('workspace');
  const [article, setArticle] = useState<Article>(INITIAL_ARTICLE);
  const [materials, setMaterials] = useState<MaterialItem[]>(INITIAL_MATERIALS);
  const [critiques, setCritiques] = useState<CritiqueCard[]>(INITIAL_CRITIQUES);

  // Modal / Drawer states
  const [previewMaterial, setPreviewMaterial] = useState<MaterialItem | null>(null);
  const [addMaterialState, setAddMaterialState] = useState<{ isOpen: boolean; type: MaterialType }>({
    isOpen: false,
    type: 'source',
  });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // Autosave simulation updater
  const triggerAutosave = useCallback(() => {
    setArticle(prev => ({
      ...prev,
      lastSaved: '방금 전',
    }));
  }, []);

  // Update Article Title
  const handleUpdateTitle = (title: string) => {
    setArticle(prev => ({
      ...prev,
      title,
      lastSaved: '저장 중...',
    }));
    setTimeout(triggerAutosave, 600);
  };

  // Update Article Status
  const handleUpdateStatus = (status: ArticleStatus) => {
    setArticle(prev => ({
      ...prev,
      status,
      lastSaved: '방금 전',
    }));
  };

  // Update specific node
  const handleUpdateNode = (nodeId: string, updates: Partial<ArticleNode>) => {
    setArticle(prev => ({
      ...prev,
      lastSaved: '저장 중...',
      nodes: prev.nodes.map(node => 
        node.id === nodeId ? { ...node, ...updates } : node
      ),
    }));
    setTimeout(triggerAutosave, 600);
  };

  // Add new node (optionally after specific node)
  const handleAddNode = (type: NodeType, afterNodeId?: string) => {
    const newNode: ArticleNode = {
      id: `node-${Date.now()}`,
      type,
      text: type === 'QUOTE' 
        ? '취재원 직접 발언 및 심층 인터뷰 속기록 발췌 인용구입니다.' 
        : type === 'CLAIM'
        ? '피취재 기관의 공식 해명 또는 아직 검증되지 않은 주장입니다.'
        : '확인된 사실 보도 내용 또는 배경 설명 문장입니다.',
      linkedSourceIds: [],
      interviewSource: type === 'QUOTE' ? '취재원 (실명 또는 직책)' : undefined,
      timestamp: type === 'QUOTE' ? '00:00' : undefined,
      status: 'needs_review',
    };

    setArticle(prev => {
      if (!afterNodeId) {
        return {
          ...prev,
          nodes: [...prev.nodes, newNode],
          lastSaved: '방금 전',
        };
      }
      const index = prev.nodes.findIndex(n => n.id === afterNodeId);
      if (index === -1) {
        return { ...prev, nodes: [...prev.nodes, newNode], lastSaved: '방금 전' };
      }
      const updated = [...prev.nodes];
      updated.splice(index + 1, 0, newNode);
      return { ...prev, nodes: updated, lastSaved: '방금 전' };
    });
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setArticle(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      lastSaved: '방금 전',
    }));
  };

  // Reorder node
  const handleMoveNode = (index: number, direction: 'up' | 'down') => {
    setArticle(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.nodes.length) return prev;
      const updated = [...prev.nodes];
      const [moved] = updated.splice(index, 1);
      updated.splice(targetIndex, 0, moved);
      return { ...prev, nodes: updated, lastSaved: '방금 전' };
    });
  };

  // Run AI Review
  const handleRunReview = async () => {
    setIsReviewing(true);
    try {
      const response = await fetch('/api/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title,
          nodes: article.nodes,
          materials: materials.map(m => ({
            id: m.id,
            title: m.title,
            speaker: m.outletOrSpeaker,
            summary: m.summary,
            content: m.content.slice(0, 800),
          })),
        }),
      });

      const data = await response.json();
      if (data.critiques && Array.isArray(data.critiques) && data.critiques.length > 0) {
        setCritiques(data.critiques);
      }
    } catch (err) {
      console.error('Review check error:', err);
    } finally {
      setIsReviewing(false);
    }
  };

  // Dismiss critique
  const handleDismissCritique = (critiqueId: string) => {
    setCritiques(prev => prev.map(c => 
      c.id === critiqueId ? { ...c, dismissed: true } : c
    ));
  };

  // Focus node in workspace
  const handleSelectNode = (nodeId: string) => {
    setHighlightedNodeId(nodeId);
    const element = document.getElementById(`article-node-${nodeId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => setHighlightedNodeId(null), 3000);
  };

  // Find evidence action from critique
  const handleFindEvidence = (critique: CritiqueCard) => {
    // If critique mentions Dr. Vance or interview, open mat-2; if audit/epa, open mat-1; else first
    if (critique.description.toLowerCase().includes('vance') || critique.title.toLowerCase().includes('vance')) {
      const mat = materials.find(m => m.id === 'mat-2') || materials[0];
      setPreviewMaterial(mat);
    } else if (critique.description.toLowerCase().includes('epa') || critique.description.toLowerCase().includes('audit')) {
      const mat = materials.find(m => m.id === 'mat-1') || materials[0];
      setPreviewMaterial(mat);
    } else {
      setPreviewMaterial(materials[0]);
    }
  };

  // Apply suggested fix from critique
  const handleApplyFix = (critique: CritiqueCard) => {
    if (!critique.nodeId || !critique.suggestedFix) {
      if (critique.nodeId) handleSelectNode(critique.nodeId);
      return;
    }
    const node = article.nodes.find(n => n.id === critique.nodeId);
    if (!node) return;

    handleUpdateNode(node.id, { text: critique.suggestedFix, status: 'verified' });
    handleDismissCritique(critique.id);
    handleSelectNode(node.id);
  };

  // Add excerpt from source preview directly to article
  const handleAddExcerptToArticle = (
    type: NodeType, 
    text: string, 
    speaker?: string, 
    timestamp?: string, 
    materialId?: string
  ) => {
    const newNode: ArticleNode = {
      id: `node-${Date.now()}`,
      type,
      text,
      linkedSourceIds: materialId ? [materialId] : [],
      interviewSource: speaker || (type === 'QUOTE' ? '취재원 (실명)' : undefined),
      timestamp: timestamp || (type === 'QUOTE' ? '00:00' : undefined),
      status: 'verified',
    };

    setArticle(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      materialIds: materialId && !prev.materialIds.includes(materialId) 
        ? [...prev.materialIds, materialId] 
        : prev.materialIds,
      lastSaved: '방금 전',
    }));

    // Auto-scroll to newly appended node
    setTimeout(() => {
      const el = document.getElementById(`article-node-${newNode.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  // Add new material to archive
  const handleAddMaterial = (material: MaterialItem) => {
    setMaterials(prev => [material, ...prev]);
    setArticle(prev => ({
      ...prev,
      materialIds: [...prev.materialIds, material.id],
    }));
  };

  // Update existing material (e.g. edited caption, photo credit)
  const handleUpdateMaterial = (id: string, updates: Partial<MaterialItem>) => {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    setPreviewMaterial(prev => prev && prev.id === id ? { ...prev, ...updates } : prev);
  };

  // Insert image material directly into article as an IMAGE node
  const handleInsertImageToArticle = (material: MaterialItem) => {
    const newNode: ArticleNode = {
      id: `node-img-${Date.now()}`,
      type: 'IMAGE',
      text: material.caption || material.title || '현장 보도 사진',
      linkedSourceIds: [material.id],
      imageUrl: material.imageUrl || 'https://images.unsplash.com/photo-1574482620811-1aa16ffe3c82?auto=format&fit=crop&w=1200&q=80',
      caption: material.caption || material.title,
      photoCredit: material.photoCredit || material.outletOrSpeaker,
      altText: material.title,
      status: 'verified',
    };

    setArticle(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      materialIds: !prev.materialIds.includes(material.id) ? [...prev.materialIds, material.id] : prev.materialIds,
      lastSaved: '방금 전',
    }));

    setTimeout(() => {
      const el = document.getElementById(`article-node-${newNode.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  // Switch active story from Articles view
  const handleSelectArticle = (articleId: string) => {
    setCurrentNav('workspace');
  };

  // Create new blank story draft
  const handleNewArticle = () => {
    setArticle({
      id: `art-${Date.now()}`,
      title: '제목 없는 새 심층 취재 기사',
      status: 'DRAFT',
      lastSaved: '방금 전',
      author: '사라 린 심층탐사팀 기자',
      desk: '전국 특별취재본부',
      materialIds: ['mat-1', 'mat-2'],
      nodes: [
        {
          id: `node-${Date.now()}-1`,
          type: 'FACT',
          text: '확인된 공공 기록 및 취재 사료를 기반으로 작성된 첫 번째 사실(FACT) 문장입니다.',
          linkedSourceIds: ['mat-1'],
          status: 'verified',
        },
      ],
    });
    setCurrentNav('workspace');
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans selection:bg-[#edf7f7] selection:text-[#008285]">
      {/* Top Header */}
      <Header
        article={article}
        currentNav={currentNav}
        onNavigate={setCurrentNav}
        onRunReview={handleRunReview}
        onOpenExport={() => setIsExportOpen(true)}
        isReviewing={isReviewing}
        critiqueCount={critiques.filter(c => !c.dismissed).length}
      />

      {/* Main Workspace Layout */}
      {currentNav === 'workspace' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar — Materials */}
          <MaterialsPanel
            materials={materials}
            selectedMaterialId={previewMaterial?.id || null}
            onSelectMaterial={setPreviewMaterial}
            onAddSource={() => setAddMaterialState({ isOpen: true, type: 'source' })}
            onUploadFile={() => setAddMaterialState({ isOpen: true, type: 'file' })}
            onUploadAudio={() => setAddMaterialState({ isOpen: true, type: 'audio' })}
          />

          {/* Center — Node-based Article Editor */}
          <ArticleEditor
            article={article}
            materials={materials}
            highlightedNodeId={highlightedNodeId}
            onUpdateTitle={handleUpdateTitle}
            onUpdateStatus={handleUpdateStatus}
            onUpdateNode={handleUpdateNode}
            onAddNode={handleAddNode}
            onDeleteNode={handleDeleteNode}
            onMoveNode={handleMoveNode}
            onOpenSourcePreview={(id) => {
              const mat = materials.find(m => m.id === id);
              if (mat) setPreviewMaterial(mat);
            }}
            onRunReview={handleRunReview}
            onOpenExport={() => setIsExportOpen(true)}
            isReviewing={isReviewing}
          />

          {/* Right Sidebar — AI Intelligence */}
          <IntelligencePanel
            critiques={critiques}
            article={article}
            materials={materials}
            isReviewing={isReviewing}
            onDismissCritique={handleDismissCritique}
            onSelectNode={handleSelectNode}
            onFindEvidence={handleFindEvidence}
            onApplyFix={handleApplyFix}
            onRunReview={handleRunReview}
          />
        </div>
      )}

      {/* Articles View (Navigation) */}
      {currentNav === 'articles' && (
        <ArticlesView
          currentArticleId={article.id}
          currentArticle={article}
          onSelectArticle={handleSelectArticle}
          onNewArticle={handleNewArticle}
        />
      )}

      {/* Sources View (Navigation) */}
      {currentNav === 'sources' && (
        <SourcesLibraryView
          materials={materials}
          onOpenPreview={(mat) => {
            setPreviewMaterial(mat);
          }}
          onAddMaterial={() => setAddMaterialState({ isOpen: true, type: 'source' })}
        />
      )}

      {/* In-Workspace Source & Transcript Preview Modal / Drawer */}
      <SourcePreviewModal
        material={previewMaterial}
        onClose={() => setPreviewMaterial(null)}
        onAddExcerptToArticle={handleAddExcerptToArticle}
        onInsertImageToArticle={handleInsertImageToArticle}
        onUpdateMaterial={handleUpdateMaterial}
      />

      {/* Add Material Modal */}
      <AddMaterialModal
        initialType={addMaterialState.type}
        isOpen={addMaterialState.isOpen}
        onClose={() => setAddMaterialState(prev => ({ ...prev, isOpen: false }))}
        onAddMaterial={handleAddMaterial}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        article={article}
        materials={materials}
      />
    </div>
  );
}
