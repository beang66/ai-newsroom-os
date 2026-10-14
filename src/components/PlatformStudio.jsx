import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Hash,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Type,
  BookOpen,
  ArrowRight,
  FolderOpen,
} from "lucide-react";
import { freezeArticle, generatePlatform, suggestPlatformKeywords, getStudioArticle } from "../api/platform";

import PlatformReview from "./PlatformReview.jsx";
import PlatformCardEditor from "./PlatformCardEditor.jsx";
import PlatformDelivery from "./PlatformDelivery.jsx";
import ThreadsEditor from "./ThreadsEditor.jsx";
import InstagramEditor from "./InstagramEditor.jsx";
import PlatformArticlePicker from './PlatformArticlePicker.jsx';
import {appliedSource,applyCurrentSource,sourceReady,beginSourceTransition,claimSourceTransition,cancelSourceTransition} from '../lib/platformSource.js';
import {articleId, fingerprint, invalidateDraft, sourceText, subtitleLabel, supportedPlatforms, visibleDrafts} from "../lib/platformState.js";

const PLATFORM_LIST = [
  { id: "instagram", label: "Instagram", badge: "피드 원고" },
  { id: "threads", label: "Threads", badge: "짧은 요약" },
];

const PLATFORM_KO = { instagram: "인스타그램", threads: "스레드" };

const VIEW_LABELS = {
  instagram: "Instagram",
  threads: "Threads",
  card_news: "카드뉴스",
};

function DraftActionTabBar({ onSave, onLoad, onMyDocs }) {
  const [activeTab, setActiveTab] = useState("save");
  const [bubbleStyle, setBubbleStyle] = useState({ left: 0, width: 0, isReady: false });
  const containerRef = useRef(null);
  const buttonRefs = useRef({});

  const updateBubblePosition = useCallback(() => {
    const currentBtn = buttonRefs.current[activeTab];
    const container = containerRef.current;
    if (currentBtn && container) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = currentBtn.getBoundingClientRect();
      setBubbleStyle({
        left: btnRect.left - containerRect.left,
        width: btnRect.width,
        isReady: true,
      });
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    updateBubblePosition();
  }, [updateBubblePosition]);

  useEffect(() => {
    updateBubblePosition();
    const timer = setTimeout(updateBubblePosition, 50);
    window.addEventListener("resize", updateBubblePosition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateBubblePosition);
    };
  }, [updateBubblePosition]);

  const handleSelect = (tabKey) => {
    setActiveTab(tabKey);
    if (tabKey === "save") onSave?.();
    else if (tabKey === "load") onLoad?.();
    else if (tabKey === "myDocs") onMyDocs?.();
  };

  return (
    <div className="border-b border-slate-200/80 pb-2.5">
      <div
        ref={containerRef}
        className="relative flex items-center justify-between pt-1 pb-0.5 px-0.5 select-none whitespace-nowrap"
      >
        {/* 부드러운 물방울 형태의 투명감 있는 이동 인디케이터 (기사작성 사진 서랍 디자인 동일) */}
        {bubbleStyle.isReady && (
          <span
            className="absolute h-7 rounded-full pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
            style={{
              left: `${bubbleStyle.left}px`,
              width: `${bubbleStyle.width}px`,
              backgroundColor: "rgba(15, 23, 42, 0.08)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04), inset 0 1px 1.5px rgba(255, 255, 255, 0.8)",
            }}
          />
        )}

        {/* 1) 초안 저장 */}
        <button
          ref={(el) => (buttonRefs.current["save"] = el)}
          type="button"
          onClick={() => handleSelect("save")}
          className={`relative z-10 px-2.5 py-1 text-[11px] tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full ${
            activeTab === "save"
              ? "text-slate-950 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          초안 저장
        </button>

        {/* 구분선 ㅣ */}
        <span className="text-slate-300 select-none text-[11px] font-light z-0">ㅣ</span>

        {/* 2) 초안 불러오기 */}
        <button
          ref={(el) => (buttonRefs.current["load"] = el)}
          type="button"
          onClick={() => handleSelect("load")}
          className={`relative z-10 px-2.5 py-1 text-[11px] tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full ${
            activeTab === "load"
              ? "text-slate-950 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          초안 불러오기
        </button>

        {/* 구분선 ㅣ */}
        <span className="text-slate-300 select-none text-[11px] font-light z-0">ㅣ</span>

        {/* 3) 내 문서에서 초안 불러오기 */}
        <button
          ref={(el) => (buttonRefs.current["myDocs"] = el)}
          type="button"
          onClick={() => handleSelect("myDocs")}
          className={`relative z-10 px-2 py-1 text-[11px] tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full ${
            activeTab === "myDocs"
              ? "text-slate-950 font-bold"
              : "text-slate-500 hover:text-slate-800 font-medium"
          }`}
        >
          내 문서에서 초안 불러오기
        </button>
      </div>
    </div>
  );
}

function Evidence({ quotes, valid }) {
  const list = Array.isArray(quotes) ? quotes.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <details className="mt-2 rounded-xl border border-[#DDD6CB] bg-[#FAF8F5] px-3 py-2 text-[11px] text-[#6F685F]">
      <summary className="cursor-pointer font-bold text-[#57514A]">
        원문 근거 {valid === false ? "· 확인 필요" : ""}
      </summary>
      <ul className="mt-2 space-y-1.5 list-disc pl-4">
        {list.map((quote, index) => (
          <li key={index} className="leading-relaxed">{quote}</li>
        ))}
      </ul>
    </details>
  );
}

function TextArea({ label, value, onChange, rows = 4, evidence, valid }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-extrabold text-[#57514A]">{label}</label>
      <textarea
        value={value || ""}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-2xl border border-[#DDD6CB] bg-white px-4 py-3 text-sm leading-7 text-[#292929] outline-none transition focus:border-[#292929]"
      />
      <Evidence quotes={evidence} valid={valid} />
    </div>
  );
}

function draftToText(platform, draft) {
  if (!draft) return "";
  if (platform === "instagram") {
    return [
      draft.opening,
      ...(draft.paragraphs || []),
      draft.closing,
      (draft.hashtags || []).join(" "),
    ].filter(Boolean).join("\n\n");
  }
  if (platform === "threads") {
    return [draft.opening, ...(draft.paragraphs || []), draft.closing]
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function PlatformDraftEditor({ platform, draft, onChange, cards, article, showCards = true }) {
  if (!draft) {
    return (
      <div className="rounded-3xl border border-dashed border-[#D7D0C6] bg-white/70 p-10 text-center">
        <Sparkles className="mx-auto mb-3 h-7 w-7 text-[#8E8982]" />
        <p className="text-sm font-bold text-[#57514A]">
          아직 {VIEW_LABELS[platform]} 원고가 없습니다.
        </p>
        <p className="mt-1 text-xs text-[#8E8982]">
          왼쪽에서 키워드를 선택한 뒤 실제 생성 엔진을 실행하세요.
        </p>
      </div>
    );
  }

  const changed = (mutate) => {
    const next = structuredClone(draft);
    mutate(next);
    next.validation_status = "needs_recheck";
    next.evidence_status = "needs_recheck";
    onChange(next);
  };

  if (platform === "instagram") {
    return <InstagramEditor draft={draft} changed={changed} Evidence={Evidence} cards={cards} article={article} showCards={showCards} />;
  }

  if (platform === "threads") {
    return <ThreadsEditor draft={draft} changed={changed} Evidence={Evidence} cards={cards} article={article} showCards={showCards} />;
  }

  return null;
}

export default function PlatformStudio({ article, setArticle, flush, onOpenArticles, onEditArticle, onApplyArticle,
  sourceLoading = false, sourceError = "" }) {
  const savedConfig = article.platformGeneration || {};
  const [selectedPlatforms, setSelectedPlatforms] = useState(
    supportedPlatforms(savedConfig.selectedPlatforms).length
      ? supportedPlatforms(savedConfig.selectedPlatforms)
      : ["instagram", "threads"],
  );
  const [includeCardNews, setIncludeCardNews] = useState(savedConfig.includeCardNews === true);
  const [requirements, setRequirements] = useState(savedConfig.requirements || "");
  const [keywordCandidates, setKeywordCandidates] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState(savedConfig.selectedKeywords || []);
  const [drafts, setDrafts] = useState(visibleDrafts(article.platformDrafts));
  const initialCardNews = article.cardNews && !Array.isArray(article.cardNews) ? article.cardNews : null;
  const [cardNews, setCardNews] = useState(initialCardNews);
  const [activeView, setActiveView] = useState(
    Object.keys(visibleDrafts(article.platformDrafts))[0] || (initialCardNews ? "card_news" : "instagram"),
  );
  // 왼쪽에서 플랫폼을 고르면 메인 박스 상단에 선택칸(인스타그램·스레드·카드뉴스)이 생기고, 거기서 고른 항목의 편집 화면이 열린다
  const [viewPicked, setViewPicked] = useState(
    Object.keys(visibleDrafts(article.platformDrafts)).length > 0 || Boolean(initialCardNews),
  );
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({});
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const [requestSource, setRequestSource] = useState(null);
  const [customKeyword, setCustomKeyword] = useState("");
  // 미리보기와 적용 원문은 편집실 전용 상태다. 목록 선택은 팀 작업 기사를 바꾸지 않는다.
  const [pickerOpen,setPickerOpen]=useState(false),[preview,setPreview]=useState({article:structuredClone(article),subtitle:article.subtitle});
  const [previewLoading,setPreviewLoading]=useState(false),[previewError,setPreviewError]=useState('');
  const [applying,setApplying]=useState(false),[applyError,setApplyError]=useState('');
  const [applyReturned,setApplyReturned]=useState(0);
  const [applied,setApplied]=useState(()=>appliedSource(article));
  const lookup=useRef({epoch:0,controller:null}),application=useRef(null),previewLive=useRef(preview);
  useLayoutEffect(()=>{previewLive.current=preview;},[preview]);
  useLayoutEffect(()=>{
    const claimed=claimSourceTransition(article);
    if(claimed?.record){setApplied(claimed.record);setPreview({article:structuredClone(article),subtitle:claimed.display.subtitle});}
    if(claimed?.error)setApplyError(claimed.error);
  },[article]);
  useLayoutEffect(()=>{
    const operation=application.current;
    // 기존 전환 함수가 종료됐는데 같은 편집실이 남아 있으면 취소/실패다. 성공은 새 마운트의 확인을 기다린다.
    if(operation?.returned&&operation.transition&&!sourceLoading&&mounted.current)cancelSourceTransition(operation.transition);
  },[sourceLoading,applyReturned]);
  const ready=sourceReady(applied,article);
  const selectPreview=async id=>{
    lookup.current.controller?.abort();const controller=new AbortController(),ticket=++lookup.current.epoch;
    lookup.current.controller=controller;setPreview(null);previewLive.current=null;setPreviewLoading(true);setPreviewError('');setApplyError('');
    try{
      const result=await getStudioArticle(id,controller.signal);
      if(!controller.signal.aborted&&ticket===lookup.current.epoch){previewLive.current=result;setPreview(result);}
    }catch(error){if(!controller.signal.aborted&&ticket===lookup.current.epoch)setPreviewError(error.message);}
    finally{if(!controller.signal.aborted&&ticket===lookup.current.epoch)setPreviewLoading(false);}
  };
  const applyPreview=async()=>{
    if(applying||previewLoading||sourceLoading||!preview?.article?.articleId||!preview.article.content?.trim())return;
    const selected=preview,controller=new AbortController(),operation={controller,transition:null,returned:false};application.current=operation;
    setApplying(true);setApplyError('');let transition;
    try{
      // 적용은 조회·기존 작업 전환만 한다. 고정본과 AI는 실제 생성 시 실행한다.
      if(articleId(live.current.article)===selected.article.articleId){
        if(!flush)throw Error('기존 저장 큐 연결이 없어 현재 기사 적용을 차단했습니다.');
        const savedId=await flush();
        if(!mounted.current||controller.signal.aborted)throw Error('편집실을 떠나 원문 적용을 취소했습니다.');
        if(savedId!==selected.article.articleId)throw Error('저장 대상이 선택한 기사와 다릅니다. 적용하지 않았습니다.');
      }
      const checked=await getStudioArticle(selected.article.articleId,controller.signal);
      if(!mounted.current||controller.signal.aborted)throw Error('편집실을 떠나 원문 적용을 취소했습니다.');
      if(previewLive.current!==selected)throw Error('선택 기사가 변경됐습니다. 현재 미리보기를 다시 적용해 주세요.');
      const current=structuredClone(live.current.article);
      if(articleId(current)===checked.article.articleId){
        if(sourceText(selected.article)!==sourceText(current))throw Error('미리보기와 현재 기사 편집 내용이 다릅니다. 기사 편집 화면에서 확인한 뒤 다시 적용해 주세요.');
        // 같은 기사의 미저장 편집은 DB 값으로 덮지 않는다. 기존 저장 큐가 생성 시 고정한다.
        setApplied(applyCurrentSource(structuredClone(current)));
        const currentPreview={article:structuredClone(current),subtitle:current.subtitle===checked.article.subtitle?checked.subtitle:current.subtitle};
        previewLive.current=currentPreview;setPreview(currentPreview);
      }else{
        if(sourceText(checked.article)!==sourceText(selected.article))throw Error('선택한 원문이 변경됐습니다. 다시 불러온 뒤 적용해 주세요.');
        if(!onApplyArticle)throw Error('기존 기사 전환 연결이 없어 다른 기사 적용을 차단했습니다.');
        transition=beginSourceTransition(checked.article,{subtitle:checked.subtitle});operation.transition=transition;
        await onApplyArticle(checked.article.articleId);operation.returned=true;
        if(mounted.current)setApplyReturned(value=>value+1);
        // 시간 추정 대신 새 편집실의 실제 마운트 또는 기존 편집실의 취소 확인을 기다린다.
        const outcome=await transition.completed;if(!outcome.ok)throw Error(outcome.error);
      }
    }catch(error){if(transition)cancelSourceTransition(transition);if(mounted.current)setApplyError(error.message);}
    finally{if(application.current===operation)application.current=null;if(mounted.current)setApplying(false);}
  };
  const mounted = useRef(true), pending = useRef(false);
  useLayoutEffect(() => {
    const lookups=lookup.current;mounted.current=true;
    // 적용 조회 중 화면을 떠나면 이전 콜백이 새 작업 기사를 바꾸지 못하도록 즉시 취소한다.
    return()=>{mounted.current=false;lookups.controller?.abort();application.current?.controller.abort();};
  }, []);

  const live=useRef({article,drafts,cardNews,requirements,selectedKeywords,selectedPlatforms,includeCardNews});
  useLayoutEffect(()=>{live.current={article,drafts,cardNews,requirements,selectedKeywords,selectedPlatforms,includeCardNews};},[article,drafts,cardNews,requirements,selectedKeywords,selectedPlatforms,includeCardNews]);
  const origin=useRef({id:articleId(article),source:sourceText(article),photos:fingerprint(article.photos||[])});


  const targets = useMemo(
    () => [...supportedPlatforms(selectedPlatforms), ...(includeCardNews ? ["card_news"] : [])],
    [selectedPlatforms, includeCardNews],
  );

  const persist = useCallback((nextDrafts = drafts, nextCardNews = cardNews, configPatch = {}) => {
    if (!setArticle) return;
    const expected=live.current.article;
    setArticle((previous) => articleId(previous)!==articleId(expected)||sourceText(previous)!==sourceText(expected)?previous:({
      ...previous,
      // 미지원 과거 기록은 편집·노출하지 않고 원래 저장값 그대로 보존한다.
      platformDrafts: { ...(previous.platformDrafts || {}), ...nextDrafts },
      cardNews: nextCardNews,
      platformGeneration: {
        ...(previous.platformGeneration || {}),
        selectedPlatforms,
        includeCardNews,
        selectedKeywords,
        requirements,
        ...configPatch,
      },
    }));
  },[setArticle,drafts,cardNews,selectedPlatforms,includeCardNews,selectedKeywords,requirements]);

  const persistRef=useRef(persist);
  useLayoutEffect(()=>{persistRef.current=persist;},[persist]);
  useEffect(()=>{
    const next={id:articleId(article),source:sourceText(article),photos:fingerprint(article.photos||[])};
    const previous=origin.current;origin.current=next;
    if(previous.id!==next.id && (previous.id || previous.source!==next.source)){
      setDrafts(visibleDrafts(article.platformDrafts));setCardNews(article.cardNews||null);
      setActiveView(Object.keys(visibleDrafts(article.platformDrafts))[0] || (article.cardNews ? "card_news" : "instagram"));
      setSelectedPlatforms(supportedPlatforms(article.platformGeneration?.selectedPlatforms));
      setIncludeCardNews(article.platformGeneration?.includeCardNews === true);
      setSelectedKeywords(article.platformGeneration?.selectedKeywords||[]);setRequirements(article.platformGeneration?.requirements||'');
      setKeywordCandidates([]);return;
    }
    if(previous.source!==next.source || previous.photos!==next.photos){
      const current=live.current;
      const nextDrafts=Object.fromEntries(Object.entries(current.drafts).map(([key,value])=>[key,invalidateDraft(value)]));
      const nextCards=current.cardNews?invalidateDraft(current.cardNews):null;
      live.current={...current,drafts:nextDrafts,cardNews:nextCards};setDrafts(nextDrafts);setCardNews(nextCards);
      persistRef.current(nextDrafts,nextCards);
    }
  },[article]);

  const togglePlatform = (id) => {
    setSelectedPlatforms((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      if (!current.length && next.length) setViewPicked(false); // 처음 고르면 위 선택칸에서 편집할 항목을 다시 고르게 한다
      if (!next.includes(activeView) && activeView !== "card_news") {
        setActiveView(next[0] || (includeCardNews ? "card_news" : "instagram"));
      }
      if (setArticle) {
        setArticle((previous) => ({
          ...previous,
          platformGeneration: {
            ...(previous.platformGeneration || {}),
            selectedPlatforms: next,
            includeCardNews,
            selectedKeywords,
            requirements,
          },
        }));
      }
      return next;
    });
  };

  const toggleKeyword = (keyword) => {
    setSelectedKeywords((current) => {
      const next = current.includes(keyword)
        ? current.filter((item) => item !== keyword)
        : [...current, keyword];
      if (setArticle) {
        setArticle((previous) => ({
          ...previous,
          platformGeneration: {
            ...(previous.platformGeneration || {}),
            selectedPlatforms,
            includeCardNews,
            selectedKeywords: next,
            requirements,
          },
        }));
      }
      return next;
    });
  };

  // 변환을 시작할 때 지금 글을 저장해 고정본으로 만든다. 한 생성 작업의 모든 결과는 같은 고정본을 쓴다.
  // 고정본을 만들지 못하면 중단한다. 저장 큐와 표시 중인 원문이 일치해야 한다.
  const freeze = async () => {
    if(!sourceReady(applied,live.current.article))throw Error('생성 원문을 먼저 적용해 주세요. 원문 변경 후에는 재적용이 필요합니다.');
    const frozen = await freezeArticle(article, {flush, strict:true});
    if (!mounted.current || sourceText(article) !== sourceText(live.current.article)) throw Error("고정 중 기사가 변경됐습니다. 다시 실행해 주세요.");
    if (frozen?.articleId && frozen.articleId !== article.articleId && setArticle) {
      setArticle((previous) => articleId(previous)!==articleId(article)||sourceText(previous)!==sourceText(article)?previous:({ ...previous, articleId: frozen.articleId }));
    }
    return frozen;
  };

  const suggestKeywords = async () => {
    if (pending.current) return;
    if (!article.title?.trim() || !article.content?.trim()) {
      setMessage("기사 제목과 본문을 먼저 작성해 주세요.");
      return;
    }
    pending.current = true; setKeywordLoading(true); setRequestSource({title:article.title});
    setMessage("");
    try {
      const frozen = await freeze();
      const source=sourceText(article);
      setRequestSource({title:frozen.article.title, snapshotId:frozen.snapshotId});
      const candidates = await suggestPlatformKeywords(frozen.article, frozen.snapshotId);
      if(!mounted.current || source!==sourceText(live.current.article) || frozen.articleId!==articleId(live.current.article))throw Error("키워드 추천 중 원본이 변경됐습니다. 다시 추천해 주세요.");
      setKeywordCandidates(candidates);
      if (!candidates.length) setMessage("추천할 키워드를 찾지 못했습니다.");
    } catch (error) {
      if (mounted.current) setMessage(error.message || "키워드 추천에 실패했습니다.");
    } finally {
      pending.current = false; if (mounted.current) { setKeywordLoading(false); setRequestSource(null); }
    }
  };

  // only: 한 항목만 만들 때(["instagram"] / ["card_news"]). 없으면 왼쪽에서 체크한 항목 전부
  const runGeneration = async (only) => {
    if (pending.current) return;
    const list = Array.isArray(only) ? only : targets;
    if (!article.title?.trim() || !article.content?.trim()) {
      setMessage("기사 제목과 본문을 먼저 작성해 주세요.");
      return;
    }
    if (!list.length) {
      setMessage("생성할 플랫폼 또는 카드뉴스를 선택해 주세요.");
      return;
    }

    pending.current = true; setGenerating(true); setRequestSource({title:article.title});
    setMessage("");
    const nextProgress = Object.fromEntries(list.map((id) => [id, "대기 중"]));
    setProgress({ ...nextProgress });
    const success = [];
    const inputSource=sourceText(article),inputConfig=fingerprint({requirements,selectedKeywords,selectedPlatforms,includeCardNews});
    const startingDrafts=Object.fromEntries(list.map(target=>[target,fingerprint(target==='card_news'?live.current.cardNews:live.current.drafts[target])]));
    let frozen;
    try { frozen = await freeze(); setRequestSource({title:frozen.article.title, snapshotId:frozen.snapshotId}); }
    catch (error) {
      pending.current = false;
      if (mounted.current) { setMessage(error.message); setGenerating(false); setRequestSource(null); setProgress({}); }
      return;
    }

    for (const target of list) {
      if (!mounted.current) break;
      nextProgress[target] = "생성 중";
      setProgress({ ...nextProgress });
      try {
        const before=startingDrafts[target];
        const generated = await generatePlatform(
          target,
          frozen.article,
          selectedKeywords,
          requirements,
          frozen?.snapshotId,
          article,
          frozen.source_url,
        );
        if (!generated) throw new Error("생성 결과가 비어 있습니다.");
        if(!generated.article_id)throw Error("기사 ID를 확인할 수 없습니다. 기사를 저장한 뒤 다시 생성해 주세요.");
        if(generated.article_id!==frozen.articleId || generated.snapshot_id!==frozen.snapshotId)throw Error("생성 결과의 기사·고정본이 요청과 다릅니다. 결과를 적용하지 않았습니다.");
        const current=live.current;
        if(!mounted.current||inputSource!==sourceText(current.article)||articleId(current.article)!==frozen.articleId||inputConfig!==fingerprint({requirements:current.requirements,selectedKeywords:current.selectedKeywords,selectedPlatforms:current.selectedPlatforms,includeCardNews:current.includeCardNews})||before!==fingerprint(target==='card_news'?current.cardNews:current.drafts[target]))throw Error("생성 중 원문·조건·원고가 바뀌어 결과를 적용하지 않았습니다. 다시 생성해 주세요.");
        if(target==='card_news')updateCardNews(generated);else updateDraft(target,generated);
        nextProgress[target] = "완료";
        success.push(target);
      } catch (error) {
        nextProgress[target] = `실패 · ${error.message || "생성 오류"}`;
      }
      if (mounted.current) setProgress({ ...nextProgress });
    }
    pending.current = false;
    if (!mounted.current) return;
    if (success.length) {
      setActiveView(success[0]);
      setViewPicked(true);
    }
    setMessage(
      success.length
        ? `${success.length}/${list.length}개 결과를 실제 생성 엔진에서 받아왔습니다.${
            frozen ? ` (저장 ${frozen.revisionNo}번 버전의 글 기준)` : " (고정본을 만들지 못해 현재 글로 생성했습니다)"
          }`
        : "생성된 결과가 없습니다. 오류 내용을 확인해 주세요.",
    );
    setGenerating(false);
    setRequestSource(null);
  };

  const updateDraft = (platform, change) => {
    const current=live.current,next=typeof change==='function'?change(current.drafts[platform]):change;
    if(!next||next===current.drafts[platform])return;
    const nextDrafts={...current.drafts,[platform]:next};live.current={...current,drafts:nextDrafts};
    setDrafts(nextDrafts);persist(nextDrafts,current.cardNews);
  };
  const updateCardNews = change => {
    const current=live.current,next=typeof change==='function'?change(current.cardNews):change;
    if(!next||next===current.cardNews)return;
    live.current={...current,cardNews:next};setCardNews(next);persist(current.drafts,next);
  };
  const addCardPhoto=(photo,cardId)=>{
    if(!live.current.cardNews?.cards.some(card=>card.card_id===cardId))return;
    updateCardNews(current=>invalidateDraft({...current,cards:current.cards.map(card=>card.card_id===cardId?{...card,photoId:photo.id,image:undefined}:card)}));
    const expectedId=articleId(live.current.article);
    setArticle(previous=>articleId(previous)!==expectedId?previous:{...previous,photos:[...(previous.photos||[]).filter(item=>item.id!==photo.id),photo]});
  };

  const copyDraft = async (platform) => {
    await navigator.clipboard.writeText(draftToText(platform, drafts[platform]));
    setCopied(platform);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const currentDraft = activeView === "card_news" ? cardNews : drafts[activeView];

  // 같은 화면 요소를 배치에 따라 다른 자리에 놓는다(Threads 는 오른쪽 사이드)
  const reviewPanel = (
    <PlatformReview key={"review:"+activeView+articleId(article)} platform={activeView} draft={currentDraft} article={article} onChange={change=>activeView==='card_news'?updateCardNews(change):updateDraft(activeView,change)}/>
  );
  const deliveryPanel = (
    <PlatformDelivery key={"delivery:"+activeView+articleId(article)} platform={activeView} draft={currentDraft} cards={cardNews} article={article} onCards={updateCardNews}/>
  );
  const cardEditor = (
    <PlatformCardEditor key={articleId(article)} draft={cardNews} article={article} onChange={updateCardNews} onAddPhoto={addCardPhoto} />
  );
  const [cardNewsMode, setCardNewsMode] = useState({
    instagram: true,
    threads: true,
  });

  const draftEditor = (
    <PlatformDraftEditor
      platform={activeView}
      draft={drafts[activeView]}
      onChange={(next) => updateDraft(activeView, next)}
      cards={cardNews?.cards || []}
      article={article}
      showCards={cardNewsMode[activeView] ?? true}
    />
  );

  return (
    <div className="w-full space-y-5 animate-float-in text-[#292929]" data-testid="format-converter">

      {pickerOpen&&<PlatformArticlePicker onSelect={selectPreview} onClose={()=>setPickerOpen(false)}/>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* 왼쪽: 불러온 기사 박스 */}
        <aside className="space-y-4">
          {/* 왼쪽 메뉴(디자인만): 한 장의 흰 카드 안에 불러온 기사 · 플랫폼 선택 및 제작 · 배포 플랫폼을 얇은 선으로 나눈다 */}
          <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)]" data-testid="studio-side">
            {/* 1. 불러온 기사 */}
            <div className="border-b border-[#F0EFEA] pb-4">
              {/* 저장된 기사 불러오기(불러온 뒤에는 '기사 다시 불러오기') — 테두리 없는 아이콘 버튼 */}
              <div className="flex justify-end">
                <button type="button" data-testid="choose-studio-article" disabled={applying||sourceLoading} onClick={()=>setPickerOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#57514A] hover:text-[#101010] disabled:opacity-50 cursor-pointer">{preview?.article?.title
                  ? <><RefreshCw className="h-3.5 w-3.5" />기사 다시 불러오기</>
                  : <><FolderOpen className="h-3.5 w-3.5" />저장된 기사 불러오기</>}</button>
              </div>
              {previewLoading||sourceLoading ? <p role="status" className="mt-2 text-xs text-[#8E8982]">기사 불러오는 중…</p> : <div data-testid="loaded-article" className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                <p data-testid="loaded-title" className="text-left break-keep text-[13.5px] font-bold leading-snug text-[#18181B]">{preview?.article.title || "기사 미선택"}</p>
                <p data-testid="loaded-subtitle" title="부제는 기사 화면의 표시 정보입니다. 생성 입력의 부제 전달은 미연결입니다." className="mt-1 text-left break-keep text-[11.5px] font-normal leading-normal text-[#57514A]">{subtitleLabel({subtitle:preview?.subtitle})}</p>
                {!preview?.article.content?.trim() && <p role="status" className="mt-2 text-[11px] text-[#B0AAA2]">{preview?.article.title ? "기사 본문 없음 · 기사 편집 화면에서 확인해 주세요." : "DB 기사를 선택해 주세요."}</p>}
                {/^https?:\/\//iu.test(preview?.article.url || "") && <a href={preview.article.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-[#3B82C4] underline">원문 출처 링크</a>}
                <span className="mt-1 block text-[10px] text-[#B0AAA2]">본문 {(preview?.article.content || '').length.toLocaleString()}자</span>
              </div>}
              {previewError&&<p role="alert" className="mt-2 text-xs text-red-700">기사 조회 실패: {previewError}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                {onEditArticle && <button type="button" onClick={onEditArticle} className="inline-flex items-center gap-1.5 font-bold text-xs text-[#18181B] hover:opacity-80 transition cursor-pointer"><BookOpen className="h-4 w-4 text-[#38BDF8]" />기사 전문 보기<ArrowRight className="h-3.5 w-3.5 text-[#38BDF8]" /></button>}
                {onOpenArticles && <button type="button" onClick={onOpenArticles} className="text-[11px] text-[#8E8982] hover:underline">저장 기사 목록</button>}
              </div>
            </div>

            {/* 2. 플랫폼 선택 및 제작 */}
            <div className="border-b border-[#F0EFEA] py-4">
              <h3 className="text-xs font-black text-[#101010]">플랫폼 선택 및 제작</h3>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-[#E7E2D9] px-3.5 py-3">
                <span className="text-xs font-bold text-[#292929]">생성 원문</span>
                <button type="button" data-testid="apply-studio-article" disabled={applying||previewLoading||sourceLoading||!preview?.article.articleId||!preview.article.content?.trim()} onClick={applyPreview} className="shrink-0 rounded-full bg-[#292929] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">{applying?'기사 적용 중…':'이 기사로 콘텐츠 제작'}</button>
              </div>
              {applyError&&<p role="alert" className="mt-2 text-xs text-red-700">적용 실패: {applyError}</p>}
              <p role="status" data-testid="applied-source" className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-[#8E8982]">
                  {ready?`적용 완료 · ${applied.title}`:applied?'원문이 변경됐습니다. 재적용이 필요합니다.':'생성 원문 미적용 · 기사를 확인한 뒤 이 기사로 콘텐츠 제작을 눌러 주세요.'}
                  {preview&&ready&&articleId(preview.article)!==applied.id&&<><br/>미리보기 기사와 적용 기사가 다릅니다. 생성은 적용 기사로 진행합니다.</>}
                </p>
              {sourceError && <p role="alert" className="mt-2 text-xs text-red-700">{sourceError}</p>}
              {requestSource && <div role="status" data-testid="request-source" className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-[#8E8982]">
                  처리 기준 기사: {requestSource.title}<br />{requestSource.snapshotId ? "Core 고정본의 제목·본문으로 처리 중" : "저장·고정본 확인 중"}
                </div>}
              <label title="배포 플랫폼이 아닌 별도 제작 결과물" className={`mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 transition ${includeCardNews ? "border-[#7DB9E8] bg-[#F3F9FE]" : "border-[#E7E2D9] hover:bg-[#FAF8F5]"}`}>
                <input
                  type="checkbox"
                  checked={includeCardNews}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setIncludeCardNews(checked);
                    if (checked && !selectedPlatforms.length) setActiveView("card_news");
                    if (setArticle) {
                      setArticle((previous) => ({
                        ...previous,
                        platformGeneration: {
                          ...(previous.platformGeneration || {}),
                          selectedPlatforms,
                          includeCardNews: checked,
                          selectedKeywords,
                          requirements,
                        },
                      }));
                    }
                  }}
                  className="sr-only"
                />
                <span className="text-xs font-bold text-[#292929]">카드뉴스도 생성</span>
                <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${includeCardNews ? "bg-[#292929] text-white" : "border border-[#DDD6CB] text-[#57514A]"}`}>{includeCardNews ? "포함" : "제작하기"}</span>
              </label>
            </div>

            {/* 3. 배포 플랫폼 */}
            <div className="pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-black text-[#101010]">배포 플랫폼</h3>
                <span className="text-[10px] text-[#8E8982]">SNS 연동</span>
              </div>
              <div className="space-y-2">
                {PLATFORM_LIST.map((platform) => {
                  const selected = selectedPlatforms.includes(platform.id);
                  const editing = viewPicked && activeView === platform.id;
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      aria-pressed={selected}
                      className={`flex w-full items-center gap-2.5 rounded-2xl border bg-white px-3 py-2.5 text-left transition ${
                        editing ? "border-[#7DB9E8] ring-1 ring-[#7DB9E8]/40" : "border-[#E7E2D9] hover:bg-[#FAF8F5]"
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        selected ? "border-[#4A9BD6] bg-[#4A9BD6] text-white" : "border-[#CFC7BC] bg-white"
                      }`}>
                        {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </span>
                      <span className="min-w-0 flex-1 text-xs font-extrabold text-[#292929]">
                        {PLATFORM_KO[platform.id] || platform.label} <span className="font-normal text-[#B0AAA2]">({platform.label})</span>
                      </span>
                      {editing
                        ? <span className="rounded-full bg-[#E3F0FA] px-2 py-0.5 text-[10px] font-bold text-[#2F6E9E]">편집 화면</span>
                        : <span className="text-[10px] text-[#8E8982]">{platform.badge}</span>}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                data-testid="generate-active"
                onClick={() => runGeneration()}
                disabled={!ready || applying || generating || keywordLoading || sourceLoading || !article.title?.trim() || !article.content?.trim() || (selectedPlatforms.length === 0 && !includeCardNews)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#292929] px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "선택 항목 생성 중" : "선택 항목 생성"}
              </button>
            </div>
          </section>
          {viewPicked && (activeView === "threads" || activeView === "instagram") && deliveryPanel}
        </aside>

        {(() => {
          const availablePlatforms = PLATFORM_LIST.filter((platform) =>
            selectedPlatforms.includes(platform.id) || drafts[platform.id]
          );
          const hasAnySelected = availablePlatforms.length > 0 || includeCardNews || cardNews;

          return (
            <main className={`min-w-0 ${activeView === "threads" || activeView === "instagram" || activeView === "card_news" ? "space-y-4" : "rounded-3xl border border-[#DDD6CB] bg-white/90 p-4 shadow-sm md:p-6"}`}>
              {hasAnySelected ? (
                <>
                  {/* 편집 화면 상단 바: 좌측에 플랫폼 탭(현재 플랫폼은 탭이 눌린 모양으로 표시), 우측에 카드뉴스 불러오기 형태 토글 */}
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#EFECE6] pb-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        {availablePlatforms.map((platform) => (
                          <button
                            key={platform.id}
                            type="button"
                            onClick={() => { setActiveView(platform.id); setViewPicked(true); }}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                              viewPicked && activeView === platform.id
                                ? "bg-[#292929] text-white"
                                : "bg-[#EFECE6] text-[#57514A]"
                            }`}
                          >
                            {platform.label}
                            {drafts[platform.id] && <span className="ml-1.5 opacity-60">●</span>}
                          </button>
                        ))}
                        {(includeCardNews || cardNews) && (
                          <button
                            type="button"
                            onClick={() => { setActiveView("card_news"); setViewPicked(true); }}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                              viewPicked && activeView === "card_news"
                                ? "bg-[#292929] text-white"
                                : "bg-[#EFECE6] text-[#57514A]"
                            }`}
                          >
                            카드뉴스
                            {cardNews && <span className="ml-1.5 opacity-60">●</span>}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 오른쪽: 카드뉴스 불러오기/텍스트 전용 전환 · 이 항목 생성 · 전체 복사(아이콘 버튼, 이름은 마우스를 올리면 보인다) */}
                    {viewPicked && (
                      <div className="flex items-center gap-2">
                        {(activeView === "instagram" || activeView === "threads") && (
                          <div className="flex items-center gap-0.5 rounded-full border border-[#DDD6CB] bg-[#FAF8F5] p-0.5">
                            <button
                              type="button"
                              title="카드뉴스 불러오기"
                              aria-label="카드뉴스 불러오기"
                              aria-pressed={!!cardNewsMode[activeView]}
                              onClick={() => setCardNewsMode((prev) => ({ ...prev, [activeView]: true }))}
                              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${cardNewsMode[activeView] ? "bg-[#292929] text-white shadow-sm" : "text-[#756F67] hover:text-[#101010]"}`}
                            >
                              <ImageIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="텍스트 전용"
                              aria-label="텍스트 전용"
                              aria-pressed={!cardNewsMode[activeView]}
                              onClick={() => setCardNewsMode((prev) => ({ ...prev, [activeView]: false }))}
                              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${!cardNewsMode[activeView] ? "bg-[#292929] text-white shadow-sm" : "text-[#756F67] hover:text-[#101010]"}`}
                            >
                              <Type className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => runGeneration([activeView])}
                          disabled={!ready || applying || generating || keywordLoading || sourceLoading || !article.title?.trim() || !article.content?.trim()}
                          title={activeView === "card_news"
                              ? (cardNews ? "카드뉴스 다시 생성" : "카드뉴스만 생성")
                              : `${VIEW_LABELS[activeView] || "플랫폼"} ${drafts[activeView] ? "다시 생성" : "원고 생성"}`}
                          aria-label={activeView === "card_news"
                              ? (cardNews ? "카드뉴스 다시 생성" : "카드뉴스만 생성")
                              : `${VIEW_LABELS[activeView] || "플랫폼"} ${drafts[activeView] ? "다시 생성" : "원고 생성"}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#292929] text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </button>
                        {activeView !== "card_news" && drafts[activeView] && (
                          <button
                            type="button"
                            onClick={() => copyDraft(activeView)}
                            title={copied === activeView ? "복사됨" : "전체 복사"}
                            aria-label={copied === activeView ? "복사됨" : "전체 복사"}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DDD6CB] bg-white text-[#292929]"
                          >
                            {copied === activeView ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {!viewPicked ? (
                    <div className="rounded-2xl border border-dashed border-[#DDD6CB] bg-[#FAF8F5] px-6 py-10 text-center" data-testid="pick-platform-hint">
                      <p className="text-sm font-bold text-[#292929]">편집할 항목을 선택하세요</p>
                      <p className="mt-1 text-xs text-[#8E8982]">위의 선택칸에서 인스타그램·스레드·카드뉴스 중 하나를 누르면 그 편집 화면이 열립니다.</p>
                    </div>
                  ) : (
                  <>
                  {activeView === "threads" || activeView === "instagram" ? (
                    // Threads·Instagram: 중간 화면에는 게시물 작성 화면 편집 배치
                    <div className="w-full flex min-w-0 justify-center" data-testid="threads-layout">
                      {draftEditor}
                    </div>
                  ) : activeView === "card_news" ? (
                    <div className="w-full flex min-w-0 justify-center" data-testid="card-news-layout">
                      {cardEditor}
                    </div>
                  ) : (
                    <>
                      {reviewPanel}
                      {deliveryPanel}
                      {draftEditor}
                    </>
                  )}
                  </>
                  )}
                </>
              ) : (
                /* 플랫폼이 아직 선택되지 않았을 때 안내 화면 */
                <div className="rounded-3xl border border-dashed border-[#DDD6CB] bg-[#FAF8F5] p-12 text-center">
                  <Sparkles className="mx-auto mb-3 h-8 w-8 text-[#8E8982]" />
                  <h4 className="text-sm font-bold text-[#292929]">선택된 배포 플랫폼이 없습니다</h4>
                  <p className="mt-1 text-xs text-[#8E8982]">
                    왼쪽의 &apos;배포 플랫폼&apos;에서 인스타그램, 스레드 등을 선택하면 편집 화면과 상단 전환 버튼이 생성됩니다.
                  </p>
                </div>
              )}
            </main>
          );
        })()}

        {/* 오른쪽 사이드 박스: 텍스트 입력 영역 (키워드 및 추가 요구사항) */}
        <aside className="space-y-4">
          {/* 상단: 초안 관리 탭 바 (선 위에 배치) */}
          <DraftActionTabBar
            onSave={() => {
              persist(drafts, cardNews, { requirements });
              setMessage("현재 초안이 저장되었습니다.");
            }}
            onLoad={() => {
              // "초안 저장"(persist)이 기사에 넣어 둔 원고·카드뉴스를 다시 읽는다
              const saved = visibleDrafts(article.platformDrafts);
              if (!Object.keys(saved).length && !article.cardNews) {
                setMessage("저장된 초안이 없습니다.");
                return;
              }
              setDrafts(saved);
              setCardNews(article.cardNews || null);
              setMessage("저장된 초안을 불러왔습니다.");
            }}
            onMyDocs={() => {
              setPickerOpen(true);
            }}
          />

          <section className="rounded-3xl border border-[#DDD6CB] bg-white/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-black">
                <Hash className="h-3.5 w-3.5" /> 핵심 키워드
              </h3>
              <button
                type="button"
                onClick={suggestKeywords}
                disabled={!ready || applying || keywordLoading || generating || sourceLoading || !article.content?.trim()}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#57514A] disabled:opacity-50"
              >
                {keywordLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                추천
              </button>
            </div>

            {keywordCandidates.length ? (
              <div className="space-y-2">
                {keywordCandidates.map((candidate, index) => {
                  const keyword = candidate.keyword || String(candidate);
                  const selected = selectedKeywords.includes(keyword);
                  return (
                    <button
                      key={keyword + index}
                      type="button"
                      onClick={() => toggleKeyword(keyword)}
                      className={`w-full rounded-xl border px-3 py-2 text-left ${
                        selected
                          ? "border-[#292929] bg-[#EFECE6]"
                          : "border-[#E7E2D9] bg-white"
                      }`}
                      title={candidate.reason || ""}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${selected ? "bg-[#292929]" : "bg-[#D7D0C6]"}`} />
                        <span className="text-xs font-bold">{keyword}</span>
                      </div>
                      {candidate.reason && (
                        <p className="mt-1 line-clamp-2 pl-4 text-[10px] leading-4 text-[#8E8982]">
                          {candidate.reason}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-[#FAF8F5] p-3 text-[10px] leading-4 text-[#8E8982]">
                ‘추천’을 누르면 불러온 기사에서 핵심 키워드를 제안합니다.
              </p>
            )}

            <label className="block text-xs" htmlFor="platform-keyword">사용자 키워드 (선택)</label>
            <div className="flex gap-2">
              <input id="platform-keyword" value={customKeyword} maxLength={100} onChange={event => setCustomKeyword(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border px-2 py-2 text-xs" placeholder="키워드 입력" />
              <button type="button" onClick={() => { const word=customKeyword.trim(); if(word && !selectedKeywords.includes(word) && selectedKeywords.length<20) toggleKeyword(word); setCustomKeyword(""); }} className="text-xs">추가</button>
            </div>
            {selectedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedKeywords.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => toggleKeyword(keyword)}
                    className="rounded-full bg-[#292929] px-2.5 py-1 text-[10px] font-bold text-white"
                  >
                    {keyword} ×
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[10px] font-bold text-[#8E8982]">추가 요구사항</label>
              <textarea
                value={requirements}
                onChange={(event) => setRequirements(event.target.value.slice(0, 3000))}
                onBlur={() => persist(drafts, cardNews, { requirements })}
                rows={4}
                placeholder="톤, 분량, 반드시 포함할 조건 등을 입력"
                className="w-full resize-y rounded-xl border border-[#DDD6CB] bg-[#FAF8F5] px-3 py-2 text-xs leading-5 outline-none focus:border-[#292929]"
              />
            </div>
          </section>

          {/* 스레드·인스타그램 화면: 플랫폼 원고 검수 박스를 오른쪽 핵심 키워드 하단에 배치(로컬 앱 연결 박스는 왼쪽 메뉴 아래) */}
          {(activeView === "threads" || activeView === "instagram") && (
            <div className="space-y-4" data-testid="threads-side">
              {reviewPanel}
            </div>
          )}

          {(Object.keys(progress).length > 0 || message) && (
            <section className="rounded-3xl border border-[#DDD6CB] bg-[#FAF8F5] p-4 text-[11px]">
              {Object.entries(progress).map(([id, status]) => (
                <div key={id} className="flex justify-between gap-3 py-1">
                  <span className="font-bold">{VIEW_LABELS[id]}</span>
                  <span className={status.startsWith("실패") ? "text-red-600" : "text-[#756F67]"}>
                    {status}
                  </span>
                </div>
              ))}
              {message && <p className="mt-2 border-t border-[#DDD6CB] pt-2 leading-5 text-[#57514A]">{message}</p>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
