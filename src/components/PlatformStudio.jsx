import React, { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  FolderOpen,
  Hash,
  Loader2,
  RefreshCw,
  Save,
  Sliders,
  Sparkles,
} from "lucide-react";
import { freezeArticle, suggestPlatformKeywords, getStudioArticle, startPlatformRun, listPlatformRuns, getPlatformRun } from "../api/platform";
import { saveLocalDraft, loadLocalDraft, toPlatformDraftSnapshot, fromPlatformDraftSnapshot } from "../api/platformDraftStorage.js";

import PlatformReview from "./PlatformReview.jsx";
import PlatformCardEditor from "./PlatformCardEditor.jsx";
import PlatformDelivery from "./PlatformDelivery.jsx";
import ThreadsEditor from "./ThreadsEditor.jsx";
import PageHeader from "./PageHeader.jsx";
import InstagramEditor from "./InstagramEditor.jsx";
import PlatformArticlePicker from './PlatformArticlePicker.jsx';
import LocalDraftPicker from './LocalDraftPicker.jsx';
import {appliedSource,applyCurrentSource,sourceReady,beginSourceTransition,claimSourceTransition,cancelSourceTransition} from '../lib/platformSource.js';
import {articleId, fingerprint, invalidateDraft, sourceText, subtitleLabel, supportedPlatforms, visibleDrafts,sameGenerationSource,attachCurrentReview} from "../lib/platformState.js";
import SaveBar from './SaveBar.jsx';
import {sourceVersion,conditionsCurrent,heldConditions as conditionsToHold,hasConditions,conditionValues,generationHistory} from '../lib/platformLifecycle.js';
import {EditorialDirection} from '../lib/editorialDirection.js';

const PLATFORM_LIST = [
  { id: "instagram", label: "Instagram", badge: "피드 원고" },
  { id: "threads", label: "Threads", badge: "짧은 요약" },
];

const VIEW_LABELS = {
  instagram: "Instagram",
  threads: "Threads",
  card_news: "카드뉴스",
};

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

function PlatformDraftEditor({ platform, draft, onChange, cards, article }) {
  if (!draft) {
    return (
      <div className="rounded-3xl border border-dashed border-[#D7D0C6] bg-white/70 p-10 text-center">
        <Sparkles className="mx-auto mb-3 h-7 w-7 text-[#8E8982]" />
        <p className="text-sm font-bold text-[#57514A]">
          아직 {VIEW_LABELS[platform]} 원고가 없습니다.
        </p>
        <p className="mt-1 text-xs text-[#8E8982]">
          기사를 적용하고 생성할 항목을 선택하면, 원문의 흐름과 핵심 내용을 읽어 정리합니다.
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
    return <InstagramEditor draft={draft} changed={changed} Evidence={Evidence} cards={cards} article={article} />;
  }

  if (platform === "threads") {
    return <ThreadsEditor draft={draft} changed={changed} Evidence={Evidence} cards={cards} article={article} />;
  }

  return null;
}

class CardViewBoundary extends Component {
  state = { failed: false, draft: this.props.draft };
  static getDerivedStateFromProps(props, state) {
    return props.draft !== state.draft ? { failed: false, draft: props.draft } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="alert" className="rounded-2xl border border-rose-300 p-4 text-sm text-rose-700">카드뉴스 화면을 표시하지 못했습니다. 생성된 결과는 보존되어 있습니다. 다른 플랫폼 탭은 계속 확인할 수 있습니다.</p>
      : this.props.children;
  }
}

export default function PlatformStudio({ article, setArticle, flush, onOpenArticles, onEditArticle, onApplyArticle, onSave,
  sourceLoading = false, sourceError = "" }) {
  const savedConfig = article.platformGeneration || {};
  const savedValues=conditionValues(savedConfig);
  const savedCurrent=conditionsCurrent(savedConfig,article);
  const [selectedPlatforms, setSelectedPlatforms] = useState(
    supportedPlatforms(savedConfig.selectedPlatforms).length
      ? supportedPlatforms(savedConfig.selectedPlatforms)
      : ["instagram", "threads"],
  );
  const [includeCardNews, setIncludeCardNews] = useState(savedConfig.includeCardNews === true);
  const [requirements, setRequirements] = useState(savedCurrent?savedValues.requirements:"");
  const [previousConditions,setPreviousConditions]=useState(()=>conditionsToHold(savedConfig,article));
  const [keywordCandidates, setKeywordCandidates] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState(savedCurrent?savedValues.selectedKeywords:[]);
  const [drafts, setDrafts] = useState(visibleDrafts(article.platformDrafts));
  const initialCardNews = article.cardNews && !Array.isArray(article.cardNews) ? article.cardNews : null;
  const [cardNews, setCardNews] = useState(initialCardNews);
  const [activeView, setActiveView] = useState(
    Object.keys(visibleDrafts(article.platformDrafts))[0] || (initialCardNews ? "card_news" : "instagram"),
  );
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({});
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const [requestSource, setRequestSource] = useState(null);
  const [lastRun,setLastRun]=useState(null);
  const [storedRun,setStoredRun]=useState(null);
  const [runHistory,setRunHistory]=useState(()=>generationHistory(savedConfig.run_history));
  const history=useRef(runHistory);
  const [runSignal,setRunSignal]=useState(0);
  const [customKeyword, setCustomKeyword] = useState("");
  const [localDraftPickerOpen, setLocalDraftPickerOpen] = useState(false);
  const [savingLocalDraft, setSavingLocalDraft] = useState(false);
  const [localDraftNotice, setLocalDraftNotice] = useState(null);
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

  const live=useRef({article,drafts,cardNews,requirements,selectedKeywords,selectedPlatforms,includeCardNews,sourceLoading});
  useLayoutEffect(()=>{live.current={article,drafts,cardNews,requirements,selectedKeywords,selectedPlatforms,includeCardNews,sourceLoading};},[article,drafts,cardNews,requirements,selectedKeywords,selectedPlatforms,includeCardNews,sourceLoading]);
  const origin=useRef({id:articleId(article),source:sourceText(article),version:sourceVersion(article),photos:fingerprint(article.photos||[])});


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
        source_version:sourceVersion(expected),
        previous_conditions:previousConditions,
        ...configPatch,
      },
    }));
  },[setArticle,drafts,cardNews,selectedPlatforms,includeCardNews,selectedKeywords,requirements,previousConditions]);

  const persistRef=useRef(persist);
  useLayoutEffect(()=>{persistRef.current=persist;},[persist]);
  useEffect(()=>{
    const next={id:articleId(article),source:sourceText(article),version:sourceVersion(article),photos:fingerprint(article.photos||[])};
    const previous=origin.current;origin.current=next;
    if(previous.id!==next.id && (previous.id || previous.source!==next.source)){
      setDrafts(visibleDrafts(article.platformDrafts));setCardNews(article.cardNews||null);
      setActiveView(Object.keys(visibleDrafts(article.platformDrafts))[0] || (article.cardNews ? "card_news" : "instagram"));
      setSelectedPlatforms(supportedPlatforms(article.platformGeneration?.selectedPlatforms));
      setIncludeCardNews(article.platformGeneration?.includeCardNews === true);
      const config=article.platformGeneration||{},current=conditionsCurrent(config,article),values=conditionValues(config);
      setSelectedKeywords(current?values.selectedKeywords:[]);setRequirements(current?values.requirements:'');
      setPreviousConditions(conditionsToHold(config,article));history.current=generationHistory(config.run_history);setRunHistory(history.current);
      setProgress({});setMessage('');setLastRun(null);setStoredRun(null);setCustomKeyword('');
      setKeywordCandidates([]);return;
    }
    if(previous.source!==next.source || previous.photos!==next.photos){
      const current=live.current;
      const nextDrafts=Object.fromEntries(Object.entries(current.drafts).map(([key,value])=>[key,invalidateDraft(value)]));
      const nextCards=current.cardNews?invalidateDraft(current.cardNews):null;
      let patch={};
      if(previous.source!==next.source){
        const held=hasConditions(current)?{selectedKeywords:current.selectedKeywords,requirements:current.requirements,source_version:previous.version}:previousConditions;
        setPreviousConditions(held);setSelectedKeywords([]);setRequirements('');setKeywordCandidates([]);setCustomKeyword('');
        setProgress({});setMessage('');setLastRun(null);setStoredRun(null);
        if(articleId(previewLive.current?.article)===next.id){const view={article:structuredClone(article),subtitle:article.subtitle};previewLive.current=view;setPreview(view);}
        patch={selectedKeywords:[],requirements:'',previous_conditions:held,source_version:sourceVersion(article)};
      }
      live.current={...current,drafts:nextDrafts,cardNews:nextCards,...(previous.source!==next.source?{selectedKeywords:[],requirements:''}:{})};setDrafts(nextDrafts);setCardNews(nextCards);
      persistRef.current(nextDrafts,nextCards,patch);
    }
  },[article,previousConditions]);

  const togglePlatform = (id) => {
    const next=selectedPlatforms.includes(id)?selectedPlatforms.filter((item)=>item!==id):[...selectedPlatforms,id];
    setSelectedPlatforms(next);
    if(!next.includes(activeView)&&activeView!=="card_news")setActiveView(next[0]||(includeCardNews?"card_news":"instagram"));
    persist(drafts,cardNews,{
      selectedPlatforms:next,selectedKeywords,requirements,
    });
  };

  const toggleKeyword = (keyword) => {
    const next=selectedKeywords.includes(keyword)?selectedKeywords.filter((item)=>item!==keyword):[...selectedKeywords,keyword];
    setSelectedKeywords(next);
    persist(drafts,cardNews,{selectedKeywords:next,requirements});
  };

  // 변환을 시작할 때 지금 글을 저장해 고정본으로 만든다. 한 생성 작업의 모든 결과는 같은 고정본을 쓴다.
  // 고정본을 만들지 못하면 중단한다. 저장 큐와 표시 중인 원문이 일치해야 한다.
  const freeze = async (allowMenuChange=false) => {
    if(!sourceReady(applied,live.current.article))throw Error('생성 원문을 먼저 적용해 주세요. 원문 변경 후에는 재적용이 필요합니다.');
    const frozen = await freezeArticle(article, {flush, strict:true});
    if ((!mounted.current&&!allowMenuChange) || (mounted.current&&sourceText(article) !== sourceText(live.current.article))) throw Error("고정 중 기사가 변경됐습니다. 다시 실행해 주세요.");
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
    if (!article.title?.trim() || !article.content?.trim()) { setMessage('기사 제목과 본문을 먼저 작성해 주세요.'); return; }
    if (!list.length) { setMessage('생성할 플랫폼 또는 카드뉴스를 선택해 주세요.'); return; }
    pending.current=true;setGenerating(true);setMessage('');setRequestSource({title:article.title});
    setProgress(Object.fromEntries(list.map(target=>[target,'고정본 준비 중'])));
    const source=sourceText(article);
    const bases=Object.fromEntries(list.map(target=>[target,fingerprint(target==='card_news'?live.current.cardNews:live.current.drafts[target])||'']));
    try {
      const frozen=await freeze(true);
      const run=await startPlatformRun({articleId:frozen.articleId,snapshotId:frozen.snapshotId,revisionNo:frozen.revisionNo,
        sourceSignature:source,targets:list,selectedKeywords,requirements,baseFingerprints:bases});
      if(!mounted.current)return;
      setLastRun({id:run.id,revision_no:frozen.revisionNo,snapshot_id:frozen.snapshotId});
      setRequestSource({title:frozen.article.title,snapshotId:frozen.snapshotId});
      setProgress(Object.fromEntries(run.targets.map(target=>[target,'대기 중'])));
      setMessage('생성 작업을 시작했습니다. 다른 메뉴로 이동해도 계속 진행됩니다.');
      persistRef.current(live.current.drafts,live.current.cardNews);
      setRunSignal(value=>value+1);
    } catch(error) {
      if(mounted.current){setMessage(error.message||'생성 작업을 시작하지 못했습니다.');setGenerating(false);setRequestSource(null);setProgress({});}
    } finally { pending.current=false; }
  };

  useEffect(() => {
    const watchedId=articleId(article);
    if(!watchedId)return undefined;
    let cancelled=false,timer;
    const poll=async()=>{
      try{
        const listed=await listPlatformRuns(watchedId);
        const latest=listed.runs?.[0];
        if(cancelled||!latest)return;
        const run=await getPlatformRun(latest.id);
        if(cancelled)return;
        setStoredRun(run);
        const active=run.status==='queued'||run.status==='running';
        setLastRun({id:run.id,revision_no:run.revision_no,snapshot_id:run.snapshot_id});
        setGenerating(active);
        setProgress(Object.fromEntries(Object.entries(run.progress).map(([target,status])=>{
          const label=({pending:'대기 중',running:'생성 중',rendering:'JPG 준비 중',succeeded:'완료',
            jpg_failed:'원고 완료 · JPG 확인 필요',failed:'실패'})[status]||status;
          const error=run.results?.[target]?.error||run.results?.[target]?.draft?.cards?.find(card=>card.render_error)?.render_error?.reason;
          return [target,error?`${label} · ${error}`:label];
        })));
        const current=live.current;
        const sameArticle=articleId(current.article)===run.article_id;
        const sameSource=sameArticle&&sourceText(current.article)===run.source_signature;
        if(!sameSource){
          setMessage('이 작업의 결과는 시작 당시 기사·고정본에 보관되어 있습니다. 현재 수정한 기사에는 적용하지 않습니다.');
        }else{
          for(const target of run.targets){
            const entry=run.results?.[target],draft=entry?.draft;
            if(!draft?.generation_review_binding||draft.validation_review)continue;
            const {generation_run:_run,...boundDraft}=draft;
            if(await globalThis.ContentReviewBinding.reviewMatches({...draft.generation_input,platform:target},boundDraft))
              entry.draft=attachCurrentReview(target,draft,current.article,draft.generation_review);
          }
          if(cancelled)return;
          const bases=run.options?.base_fingerprints||{};
          let nextDrafts=current.drafts,nextCards=current.cardNews,changed=false,skipped=false;
          for(const target of run.targets){
            const entry=run.results?.[target];
            if(!entry?.draft||!['succeeded','jpg_failed'].includes(entry.status))continue;
            const present=target==='card_news'?nextCards:nextDrafts[target];
            if(present?.generation_run?.id===run.id)continue;
            if((fingerprint(present)||'')!==(bases[target]||'')){skipped=true;continue;}
            if(target==='card_news')nextCards=entry.draft;
            else nextDrafts={...nextDrafts,[target]:entry.draft};
            changed=true;
          }
          if(changed){
            live.current={...current,drafts:nextDrafts,cardNews:nextCards};
            setDrafts(nextDrafts);setCardNews(nextCards);
            setArticle?.(previous=>{
              if(articleId(previous)!==run.article_id||sourceText(previous)!==run.source_signature)return previous;
              let platformDrafts={...(previous.platformDrafts||{})},cardResult=previous.cardNews,applied=false;
              for(const target of run.targets){
                const entry=run.results?.[target];
                if(!entry?.draft||!['succeeded','jpg_failed'].includes(entry.status))continue;
                const present=target==='card_news'?cardResult:platformDrafts[target];
                if(present?.generation_run?.id===run.id||(fingerprint(present)||'')!==(bases[target]||''))continue;
                if(target==='card_news')cardResult=entry.draft;
                else platformDrafts[target]=entry.draft;
                applied=true;
              }
              return applied?{...previous,platformDrafts,cardNews:cardResult}:previous;
            });
          }
          if(skipped)setMessage('생성 결과는 시작 당시 고정본에 보관했습니다. 이후 수정한 원고는 덮어쓰지 않았습니다.');
          else if(!active)setMessage(run.status==='completed'?'생성 작업이 끝났습니다. 결과를 확인해 주세요.':'생성 작업을 완료하지 못했습니다.');
        }
        if(active)timer=setTimeout(poll,1500);
      }catch(error){
        if(!cancelled){setMessage(error.message||'생성 작업 상태를 확인하지 못했습니다.');timer=setTimeout(poll,3000);}
      }
    };
    poll();
    return()=>{cancelled=true;clearTimeout(timer);};
  },[articleId(article),sourceText(article),runSignal,setArticle]);

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
  const currentResult=!!currentDraft&&currentDraft.article_id===articleId(article)&&sameGenerationSource(currentDraft,article);

  const handleSaveLocalDraft = async () => {
    if (savingLocalDraft) return;
    setSavingLocalDraft(true);
    setLocalDraftNotice(null);
    try {
      const snapshot = toPlatformDraftSnapshot({
        article,
        drafts,
        cardNews,
        selectedPlatforms,
        includeCardNews,
        selectedKeywords,
        requirements,
      });
      const result = await saveLocalDraft(snapshot);
      setLocalDraftNotice({
        type: 'success',
        message: `내 문서에 초안이 저장되었습니다.\n저장 위치: ${result.file_path}`,
        filePath: result.file_path,
      });
    } catch (err) {
      setLocalDraftNotice({
        type: 'error',
        message: `초안 저장 실패: ${err.message}`,
      });
    } finally {
      setSavingLocalDraft(false);
    }
  };

  const handleSelectLocalDraft = async (draftId, draftTitle) => {
    if (!window.confirm(`'${draftTitle || '선택한 초안'}'을(를) 불러와 현재 편집 내용을 교체하시겠습니까?`)) {
      return;
    }
    setLocalDraftPickerOpen(false);
    setLocalDraftNotice(null);
    try {
      const rawDraft = await loadLocalDraft(draftId);
      const restored = fromPlatformDraftSnapshot(rawDraft);

      if (restored.drafts && Object.keys(restored.drafts).length > 0) {
        setDrafts(restored.drafts);
      }
      if (restored.cardNews !== null) {
        setCardNews(restored.cardNews);
      }
      if (restored.selectedPlatforms?.length) {
        setSelectedPlatforms(restored.selectedPlatforms);
      }
      setIncludeCardNews(restored.includeCardNews);
      if (restored.selectedKeywords) {
        setSelectedKeywords(restored.selectedKeywords);
      }
      if (restored.requirements !== undefined) {
        setRequirements(restored.requirements);
      }
      if (restored.article && setArticle) {
        setArticle(previous => ({
          ...previous,
          ...restored.article,
          platformDrafts: restored.drafts,
          cardNews: restored.cardNews,
        }));
      }
      persist(restored.drafts, restored.cardNews, {
        selectedPlatforms: restored.selectedPlatforms,
        includeCardNews: restored.includeCardNews,
        selectedKeywords: restored.selectedKeywords,
        requirements: restored.requirements,
      });

      setLocalDraftNotice({
        type: 'success',
        message: `초안 '${draftTitle || '초안'}'을(를) 성공적으로 불러왔습니다.`,
      });
    } catch (err) {
      setLocalDraftNotice({
        type: 'error',
        message: `초안 불러오기 실패: ${err.message}`,
      });
    }
  };

  // 왼쪽 패널 탭 상태: "settings" (원고 & 배포 설정) | "delivery" (로컬 앱 연결 & 전송)
  const [leftPanelTab, setLeftPanelTab] = useState("settings");
  // 왼쪽 설정 패널 너비: 오른쪽 가장자리를 끌거나(또는 키보드 ←/→) 조절하고, 더블클릭하면 처음 크기로 돌아온다. 마지막 크기는 기억한다.
  const PANEL_MIN = 300, PANEL_MAX = 620, PANEL_DEFAULT = 360;
  const clampPanel = (value) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(value)));
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("newsroom_convert_panel_width"));
      return saved >= PANEL_MIN && saved <= PANEL_MAX ? saved : PANEL_DEFAULT;
    } catch {
      return PANEL_DEFAULT;
    }
  });
  const rememberPanelWidth = (value) => {
    try {
      localStorage.setItem("newsroom_convert_panel_width", String(value));
    } catch {}
  };
  const startPanelResize = (event) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = panelWidth;
    let latest = startWidth;
    const move = (moveEvent) => {
      latest = clampPanel(startWidth + moveEvent.clientX - startX);
      setPanelWidth(latest);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      document.body.style.userSelect = "";
      rememberPanelWidth(latest);
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };
  const nudgePanel = (delta) => {
    const next = clampPanel(panelWidth + delta);
    setPanelWidth(next);
    rememberPanelWidth(next);
  };

  return (
    <div className="relative w-full space-y-4 animate-float-in text-[#292929]" data-testid="format-converter">
      <div className="[&>header]:mb-2!">
        <PageHeader page="convert" />
      </div>
      {/* 제목 줄 오른쪽 끝에 초안 저장/불러오기 버튼 배치 */}
      <div className="flex items-center justify-end select-none lg:absolute lg:right-0 lg:top-0 lg:z-10">
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="save-local-draft"
            disabled={savingLocalDraft || applying || generating}
            onClick={handleSaveLocalDraft}
            title="현재 원고와 카드뉴스 편집 내용을 내 문서 로컬 초안 파일로 저장합니다."
            className="relative px-3 py-1.5 text-xs tracking-tight transition-all duration-200 cursor-pointer whitespace-nowrap rounded-full text-slate-700 hover:text-slate-950 hover:bg-slate-900/5 font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-3.5 w-3.5 text-slate-600" />
            <span>{savingLocalDraft ? "초안 저장 중…" : "초안 저장"}</span>
          </button>

          <span className="text-slate-300 select-none text-xs font-light">ㅣ</span>

          <button
            type="button"
            data-testid="load-local-draft"
            disabled={savingLocalDraft || applying || generating}
            onClick={() => setLocalDraftPickerOpen(true)}
            title="내 문서에 저장된 로컬 초안을 선택해 복원합니다."
            className="relative px-3 py-1.5 text-xs tracking-tight transition-all duration-200 cursor-pointer whitespace-nowrap rounded-full text-slate-700 hover:text-slate-950 hover:bg-slate-900/5 font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderOpen className="h-3.5 w-3.5 text-slate-600" />
            <span>초안 불러오기</span>
          </button>
        </div>
      </div>

      {pickerOpen&&<PlatformArticlePicker onSelect={selectPreview} onClose={()=>setPickerOpen(false)}/>}
      {localDraftPickerOpen && (
        <LocalDraftPicker
          onSelect={handleSelectLocalDraft}
          onClose={() => setLocalDraftPickerOpen(false)}
        />
      )}
      <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[var(--panel-w)_minmax(0,1fr)] items-start" style={{ "--panel-w": `${panelWidth}px` }}>
        {/* 설정 패널 너비 조절 손잡이: 화면 세로 중앙(sticky top-1/2 -translate-y-1/2)에 고정 배치되어 헤더 위치 및 스크롤과 관계없이 보이는 화면 중앙에 위치 */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="설정 패널 너비 조절"
          aria-valuemin={PANEL_MIN}
          aria-valuemax={PANEL_MAX}
          aria-valuenow={panelWidth}
          tabIndex={0}
          data-testid="panel-resize-handle"
          title="끌어서 설정 패널 너비 조절 (더블클릭: 처음 크기)"
          onPointerDown={startPanelResize}
          onDoubleClick={() => { setPanelWidth(PANEL_DEFAULT); rememberPanelWidth(PANEL_DEFAULT); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); nudgePanel(-16); }
            else if (event.key === "ArrowRight") { event.preventDefault(); nudgePanel(16); }
            else if (event.key === "Home") { event.preventDefault(); setPanelWidth(PANEL_DEFAULT); rememberPanelWidth(PANEL_DEFAULT); }
          }}
          style={{ left: "calc(var(--panel-w) + 12px)" }}
          className="group absolute inset-y-0 z-30 hidden w-6 -translate-x-1/2 cursor-col-resize touch-none outline-none lg:flex justify-center"
        >
          {/* 사용자에게 보이는 화면 중앙에 항상 위치하는 캡슐 조절 손잡이 */}
          <div className="sticky top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-10 rounded-full bg-white border border-zinc-300 shadow-sm transition-all duration-150 group-hover:border-zinc-500 group-hover:shadow-md group-focus-visible:border-zinc-500 group-active:scale-95 group-active:border-sky-500 group-active:bg-sky-50">
            <span className="h-4 w-1 rounded-full bg-zinc-400 group-hover:bg-zinc-600 group-active:bg-sky-500" />
          </div>
        </div>
        {/* 거대한 독립형 카드 형태 (부드러운 대형 곡률 rounded-[36px], 넓게 번지는 드롭 섀도우, 넉넉한 안쪽 여백) */}
        <aside className="sticky top-4 self-start max-h-[calc(100vh-80px)] minimal-scroll overflow-y-auto w-full shrink-0 space-y-4 rounded-[28px] bg-white p-5 md:p-6 shadow-[0_18px_48px_-14px_rgba(24,24,27,0.14),0_2px_8px_rgba(24,24,27,0.04)] border border-zinc-200/80">
          {/* 상단 사이드 도킹 패널 헤더 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-[0_2px_6px_rgba(24,24,27,0.05)]">
                <Sliders className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[17px] font-bold tracking-tight text-zinc-900">
                  {leftPanelTab === "settings"
                    ? "원고 & 배포 설정"
                    : leftPanelTab === "review"
                    ? "원고 검수 · 이전 결과"
                    : "로컬 앱 연결"}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                  {leftPanelTab === "settings"
                  ? "변환 원문 및 발행 채널 옵션"
                  : leftPanelTab === "review"
                  ? "원문 근거 일치성 검수 및 이전 원문 결과"
                  : "Instagram 로컬 전송 및 앱 연동"}
                </p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold tracking-wide ${ready ? "bg-lime-100 text-lime-800" : "bg-zinc-100 text-zinc-500"}`}>
              {ready ? "준비 완료" : "원문 확인"}
            </span>
          </div>

          {/* 상단 탭 전환 세그먼트 버튼 ([원고 & 설정] / [원고 검수 · 결과] / [로컬 앱 연결]) */}
          <div className="flex rounded-full bg-zinc-100 p-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setLeftPanelTab("settings")}
              className={`flex-1 rounded-full py-1.5 transition text-center ${
                leftPanelTab === "settings"
                  ? "bg-[#18181B] text-white shadow-[0_2px_6px_rgba(24,24,27,0.25)]"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              원고 & 설정
            </button>
            <button
              type="button"
              onClick={() => setLeftPanelTab("review")}
              className={`flex-1 rounded-full py-1.5 transition text-center ${
                leftPanelTab === "review"
                  ? "bg-[#18181B] text-white shadow-[0_2px_6px_rgba(24,24,27,0.25)]"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              원고 검수 · 결과
            </button>
            <button
              type="button"
              onClick={() => setLeftPanelTab("delivery")}
              className={`flex-1 rounded-full py-1.5 transition text-center ${
                leftPanelTab === "delivery"
                  ? "bg-[#18181B] text-white shadow-[0_2px_6px_rgba(24,24,27,0.25)]"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              로컬 앱 연결
            </button>
          </div>

          {leftPanelTab === "settings" ? (
            <>

          {/* 1. 불러온 기사 */}
          <section className="space-y-3 border-b border-zinc-100 pb-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 text-[#8E8982]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black">불러온 기사</h3>
                  <button type="button" data-testid="choose-studio-article" disabled={applying||sourceLoading} onClick={()=>setPickerOpen(true)} className="rounded-xl border border-[#DDD6CB] bg-white px-2.5 py-1 text-[11px] font-bold text-[#292929] hover:bg-[#F2EFE9] transition">저장 기사에서 선택</button>
                </div>
                {previewLoading||sourceLoading ? <p role="status" className="mt-2 text-xs">기사 불러오는 중…</p> : <div data-testid="loaded-article" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  <span className="mt-3 block text-[10px] font-bold text-[#756F67]">기사 제목</span>
                  <p data-testid="loaded-title" className="mt-0.5 text-sm font-black leading-6 text-[#292929]">{preview?.article.title || "기사 미선택"}</p>
                  <span className="mt-2 block text-[10px] font-bold text-[#756F67]">부제목</span>
                  <p data-testid="loaded-subtitle" className="mt-0.5 text-xs leading-5 text-[#57514A]">{subtitleLabel({subtitle:preview?.subtitle})}</p>
                  <p className="mt-1.5 text-[10px] leading-4 text-[#8E8982]">부제는 기사 화면의 표시 정보입니다. 생성 입력의 부제 전달은 미연결입니다.</p>
                  {!preview?.article.content?.trim() && <p role="status" className="mt-2 text-xs text-amber-800">{preview?.article.title ? "기사 본문 없음 · 기사 편집 화면에서 확인해 주세요." : "DB 기사를 선택해 주세요."}</p>}
                  {/^https?:\/\//iu.test(preview?.article.url || "") && <a href={preview.article.url} target="_blank" rel="noreferrer" className="mt-2 block text-xs underline text-[#292929]">원문 출처 링크</a>}
                  <span className="mt-2 block text-[10px] text-[#8E8982]">본문 {(preview?.article.content || '').length.toLocaleString()}자</span>
                </div>}
                {previewError&&<p role="alert" className="mt-2 text-xs text-red-700">기사 조회 실패: {previewError}</p>}
                <button type="button" data-testid="apply-studio-article" disabled={applying||previewLoading||sourceLoading||!preview?.article.articleId||!preview.article.content?.trim()} onClick={applyPreview} className="mt-3 w-full rounded-xl bg-[#292929] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#403B35] disabled:opacity-50">{applying?'기사 적용 중…':'이 기사로 콘텐츠 제작'}</button>
                {applyError&&<p role="alert" className="mt-2 text-xs text-red-700">적용 실패: {applyError}</p>}
                <p role="status" data-testid="applied-source" className="mt-2.5 whitespace-pre-wrap break-words text-[11px] leading-5 text-[#756F67]">
                  {ready?`적용 완료 · ${applied.title}`:applied?'원문이 변경됐습니다. 재적용이 필요합니다.':'생성 원문 미적용 · 기사를 확인한 뒤 이 기사로 콘텐츠 제작을 눌러 주세요.'}
                  {preview&&ready&&articleId(preview.article)!==applied.id&&<><br/>미리보기 기사와 적용 기사가 다릅니다. 생성은 적용 기사로 진행합니다.</>}
                </p>
                {sourceError && <p role="alert" className="mt-2 text-xs text-red-700">{sourceError}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {onEditArticle && <button onClick={onEditArticle} className="underline text-[#57514A] hover:text-[#292929]">기사 편집</button>}
                  {onOpenArticles && <button onClick={onOpenArticles} className="underline text-[#57514A] hover:text-[#292929]">저장 기사 목록</button>}
                </div>
                {requestSource && <div role="status" data-testid="request-source" className="mt-2.5 whitespace-pre-wrap break-words text-[11px] leading-5 text-[#756F67]">
                  처리 기준 기사: {requestSource.title}<br />{requestSource.snapshotId ? "Core 고정본의 제목·본문으로 처리 중" : "저장·고정본 확인 중"}
                </div>}
              </div>
            </div>
          </section>

          {/* 2. 배포 플랫폼 선택 */}
          <section className="space-y-3 border-b border-zinc-100 pb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black">배포 플랫폼</h3>
              <span className="text-[10px] text-[#8E8982]">다중 선택</span>
            </div>
            <div className="space-y-1.5">
              {PLATFORM_LIST.map((platform) => {
                const selected = selectedPlatforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                      selected
                        ? "border border-zinc-900 bg-zinc-900 text-white shadow-xs"
                        : "border border-zinc-200/70 bg-zinc-50/50 text-zinc-800 hover:bg-zinc-100/70"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-extrabold">{platform.label}</div>
                      <div className={`text-[10px] ${selected ? "text-zinc-300" : "text-zinc-400"}`}>
                        {platform.badge}
                      </div>
                    </div>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                      selected ? "border-white bg-white text-zinc-900" : "border-zinc-300 bg-white"
                    }`}>
                      {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-zinc-50/60 p-2.5 hover:bg-zinc-100/60 transition">
              <input
                type="checkbox"
                checked={includeCardNews}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setIncludeCardNews(checked);
                  if (checked && !selectedPlatforms.length) setActiveView("card_news");
                  persist(drafts,cardNews,{includeCardNews:checked});
                }}
                className="mt-0.5"
              />
              <span>
                <strong className="block text-xs">카드뉴스도 생성</strong>
                <span className="text-[10px] leading-4 text-[#8E8982]">
                  배포 플랫폼이 아닌 별도 제작 결과물
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => runGeneration()}
              disabled={!ready || applying || generating || keywordLoading || sourceLoading || !article.title?.trim() || !article.content?.trim()}
              className="mt-2 flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#292929] px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#403B35] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "선택 항목 생성 중" : "선택 항목 생성"}
            </button>
          </section>

          {/* 3. 편집 방향 추가 (선택) */}
          <section className="space-y-3 pb-1">
            <details className="group" data-testid="optional-editorial-direction">
              <summary className="cursor-pointer text-xs font-black">
                편집 방향 추가 <span className="font-normal text-[#8E8982]">(선택)</span>
                {hasConditions({selectedKeywords,requirements})&&<span className="ml-2 text-[10px] font-medium text-[#756F67]">다음 생성에 반영</span>}
              </summary>
              <p className="mt-2 text-[11px] leading-5 text-[#8E8982]">비워 두면 원문을 기준으로 정리합니다. 별도로 강조하거나 남기고 싶은 내용이 있을 때만 덧붙이세요.</p>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="platform-editorial-direction" className="mb-1.5 block text-xs font-bold">덧붙일 편집 방향 (선택)</label>
                  <textarea
                    id="platform-editorial-direction"
                    value={requirements}
                    onChange={(event) => setRequirements(event.target.value.slice(0, 3000))}
                    onBlur={() => persist(drafts, cardNews, { requirements })}
                    rows={4}
                    placeholder="예: 지원 금액보다 신청 자격을 먼저 설명하고, 제외 대상은 꼭 남겨 주세요."
                    className="w-full resize-y rounded-xl border border-[#DDD6CB] bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-[#292929]"
                  />
                  {requirements.trim()&&<div role="status" className="mt-2 space-y-1 text-[11px] leading-5 text-[#756F67]">
                    <p className="font-bold">다음 생성에 반영할 문체</p>
                    {supportedPlatforms(selectedPlatforms).map(platform=><p key={platform}>{EditorialDirection.summary(platform,requirements)}</p>)}
                    <p>명시한 문체만 변경하며, 사실·근거와 중요한 조건은 유지합니다. 기존 결과는 다시 생성해야 반영됩니다.</p>
                  </div>}
                  <button type="button" title="선택한 Instagram·Threads 원고를 다시 생성합니다. 기존 원고와 수정 내용은 새 결과로 바뀝니다." disabled={!requirements.trim()||!ready||applying||generating||keywordLoading||sourceLoading||!article.title?.trim()||!article.content?.trim()||!selectedPlatforms.length} onClick={()=>runGeneration(supportedPlatforms(selectedPlatforms))} className="mt-3 w-full rounded-xl bg-[#292929] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#403B35] disabled:opacity-50">편집 방향 반영해 다시 생성</button>
                </div>
                {hasConditions({selectedKeywords,requirements})&&<button type="button" disabled={generating||keywordLoading||applying} className="text-xs text-[#756F67] underline" onClick={()=>{
                  setSelectedKeywords([]);setRequirements('');setCustomKeyword('');
                  persist(drafts,cardNews,{selectedKeywords:[],requirements:''});
                }}>추가 방향 지우기</button>}
                {previousConditions&&hasConditions(previousConditions)&&<div data-testid="previous-conditions" className="rounded-xl border border-amber-300 p-3 text-xs bg-white">
                  <p>이전 원문의 입력 조건을 보존했습니다. 현재 생성에는 자동 적용하지 않습니다.</p>
                  <details><summary>보존한 조건 보기</summary><p>{(previousConditions.selectedKeywords||[]).join(', ')}</p><p>{previousConditions.requirements}</p></details>
                  <button type="button" disabled={generating||keywordLoading||applying} data-testid="reuse-conditions" onClick={()=>{
                    const held=previousConditions;setSelectedKeywords(held.selectedKeywords||[]);setRequirements(held.requirements||'');setPreviousConditions(null);
                    persist(drafts,cardNews,{selectedKeywords:held.selectedKeywords||[],requirements:held.requirements||'',previous_conditions:null});
                  }} className="mt-2 underline">확인 후 현재 원문에 다시 사용</button>
                </div>}
                <details className="rounded-xl border border-[#E7E2D9] bg-white p-3">
                  <summary className="cursor-pointer text-xs font-bold">특정 주제 강조 (선택){selectedKeywords.length>0&&` · ${selectedKeywords.length}개`}</summary>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-xs font-black">
                        <Hash className="h-3.5 w-3.5" /> 강조할 키워드
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
                              className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                                selected
                                  ? "border-[#292929] bg-[#EFECE6]"
                                  : "border-[#E7E2D9] bg-white hover:bg-[#FAF8F5]"
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
                        필요할 때만 ‘추천’으로 강조할 주제 후보를 확인하세요. 선택하지 않아도 생성할 수 있습니다.
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
                  </div>
                </details>
              </div>
            </details>
          </section>

          {/* 4. 작업 진행 현황 및 고정본 기록 */}
          {(Object.keys(progress).length > 0 || message || runHistory.length>0) && (
            <section className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 text-[11px]">
              {lastRun&&<p data-testid="generation-run" className="mb-2">이번 생성 시도 · {lastRun.id.slice(0,8)} · 저장 {lastRun.revision_no}번 고정본 기준</p>}
              {Object.entries(progress).map(([id, status]) => (
                <div key={id} className="flex justify-between gap-3 py-1">
                  <span className="font-bold">{VIEW_LABELS[id]}</span>
                  <span className={status.startsWith("실패") ? "text-red-600" : "text-[#756F67]"}>
                    {status}
                  </span>
                </div>
              ))}
              {cardNews&&progress.card_news?.startsWith('실패')&&<p role="status" className="mt-2 text-amber-700">현재 보이는 카드뉴스와 JPG 준비 수는 이번 생성 결과가 아닌 이전 성공 결과입니다.</p>}
              {message && <p className="mt-2 border-t border-[#DDD6CB] pt-2 leading-5 text-[#57514A]">{message}</p>}
              {storedRun?.targets?.some(target=>storedRun.results?.[target]?.draft)&&<details className="mt-2 border-t border-[#DDD6CB] pt-2">
                <summary className="cursor-pointer font-bold">고정본에 보관된 생성 결과 보기</summary>
                <p className="mt-2">기사 {storedRun.article_id.slice(0,8)} · 저장 {storedRun.revision_no}번 고정본</p>
                {storedRun.targets.map(target=>{
                  const draft=storedRun.results?.[target]?.draft;
                  if(!draft)return null;
                  const value=target==='card_news'?(draft.cards||[]).map(card=>[card.content?.keyword,card.content?.headline,card.content?.body].filter(Boolean).join(' · ')).join('\n\n'):draftToText(target,draft);
                  return <div key={target} className="mt-3"><p className="font-bold">{VIEW_LABELS[target]}</p><pre className="mt-1 max-h-48 minimal-scroll overflow-auto whitespace-pre-wrap break-words">{value}</pre></div>;
                })}
              </details>}
              {runHistory.length>0&&<details data-testid="generation-history" className="mt-2 border-t pt-2"><summary>최근 작업 기록 · 원문과 AI 응답은 기록하지 않음</summary>{runHistory.map((entry,index)=><p key={index}>
                {entry.id.slice(0,8)} · {entry.source_version===sourceVersion(article)?'현재 원문':'이전 원문'} · {VIEW_LABELS[entry.platform]||entry.platform} · {entry.stage} · {entry.code||entry.status} · {entry.at}
              </p>)}</details>}
            </section>
          )}
            </>
          ) : leftPanelTab === "review" ? (
            /* 원고 검수 · 이전 원문 결과 탭 화면 */
            <div className="space-y-4">
              {currentDraft && (
                <div role={currentResult ? "status" : "alert"} data-testid="draft-origin-status" className={`rounded-2xl border p-4 text-xs leading-5 ${currentResult ? "border-[#DDD6CB] bg-[#FAF8F5] text-slate-700" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                  <div className="font-extrabold text-[12px] mb-1">
                    {currentResult ? "현재 원문 결과" : "이전 원문 결과 · SNS 준비에서 제외"}
                  </div>
                  <div>기준 원문: {currentDraft.generation_input?.article?.title || "연결 확인 필요"}</div>
                  {currentDraft.generation_run?.revision_no != null && (
                    <div className="text-[11px] text-slate-500">저장 {currentDraft.generation_run.revision_no}번 고정본 기준</div>
                  )}
                  {!currentResult && (
                    <div className="mt-1 text-[11px] text-amber-700">새 생성이 실패해도 이 보존본은 삭제하지 않습니다.</div>
                  )}
                </div>
              )}

              {/* 플랫폼 원고 검수 UI */}
              <section className="space-y-3 pt-1">
                <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-2">
                  <h3 className="text-xs font-black">플랫폼 원고 검수</h3>
                  <span className="rounded-full bg-[#292929] px-2 py-0.5 text-[10px] font-bold text-white">
                    {VIEW_LABELS[activeView] || activeView}
                  </span>
                </div>
                {activeView === "card_news" ? (
                  <PlatformReview platform={activeView} draft={cardNews} article={article} onChange={updateCardNews}/>
                ) : (
                  <PlatformReview key={"panel-review:"+activeView+articleId(article)} platform={activeView} draft={currentDraft} article={article} onChange={change=>updateDraft(activeView,change)}/>
                )}
              </section>

              {/* 고정본 기록 및 작업 진행 이력 */}
              {(Object.keys(progress).length > 0 || message || runHistory.length > 0) && (
                <section className="rounded-2xl border border-[#DDD6CB] bg-[#FAF8F5] p-3.5 text-[11px]">
                  {lastRun && <p data-testid="generation-run" className="mb-2 font-bold">이번 생성 시도 · {lastRun.id.slice(0,8)} · 저장 {lastRun.revision_no}번 고정본 기준</p>}
                  {Object.entries(progress).map(([id, status]) => (
                    <div key={id} className="flex justify-between gap-3 py-1">
                      <span className="font-bold">{VIEW_LABELS[id]}</span>
                      <span className={status.startsWith("실패") ? "text-red-600" : "text-[#756F67]"}>
                        {status}
                      </span>
                    </div>
                  ))}
                  {cardNews && progress.card_news?.startsWith('실패') && <p role="status" className="mt-2 text-amber-700">현재 보이는 카드뉴스와 JPG 준비 수는 이번 생성 결과가 아닌 이전 성공 결과입니다.</p>}
                  {message && <p className="mt-2 border-t border-[#DDD6CB] pt-2 leading-5 text-[#57514A]">{message}</p>}
                  {storedRun?.targets?.some(target=>storedRun.results?.[target]?.draft)&&<details className="mt-2 border-t border-[#DDD6CB] pt-2">
                    <summary className="cursor-pointer font-bold">고정본에 보관된 생성 결과 보기</summary>
                    <p className="mt-2">기사 {storedRun.article_id.slice(0,8)} · 저장 {storedRun.revision_no}번 고정본</p>
                    {storedRun.targets.map(target=>{
                      const draft=storedRun.results?.[target]?.draft;
                      if(!draft)return null;
                      const value=target==='card_news'?(draft.cards||[]).map(card=>[card.content?.keyword,card.content?.headline,card.content?.body].filter(Boolean).join(' · ')).join('\n\n'):draftToText(target,draft);
                      return <div key={target} className="mt-3"><p className="font-bold">{VIEW_LABELS[target]}</p><pre className="mt-1 max-h-48 minimal-scroll overflow-auto whitespace-pre-wrap break-words">{value}</pre></div>;
                    })}
                  </details>}
                  {runHistory.length>0&&<details data-testid="generation-history" className="mt-2 border-t pt-2"><summary>최근 작업 기록 · 원문과 AI 응답은 기록하지 않음</summary>{runHistory.map((entry,index)=><p key={index}>
                    {entry.id.slice(0,8)} · {entry.source_version===sourceVersion(article)?'현재 원문':'이전 원문'} · {VIEW_LABELS[entry.platform]||entry.platform} · {entry.stage} · {entry.code||entry.status} · {entry.at}
                  </p>)}</details>}
                </section>
              )}
            </div>
          ) : (
            /* 로컬 앱 연결 탭 화면 (PlatformDelivery 컴포넌트) */
            <div className="space-y-4">
              {activeView === "card_news" ? (
                <PlatformDelivery
                  platform={activeView}
                  draft={cardNews}
                  cards={cardNews}
                  article={article}
                  onCards={updateCardNews}
                  preparing={generating}
                />
              ) : (
                <PlatformDelivery
                  key={"delivery:" + activeView + articleId(article)}
                  platform={activeView}
                  draft={currentDraft}
                  cards={cardNews}
                  article={article}
                  onCards={updateCardNews}
                  preparing={generating}
                />
              )}
            </div>
          )}
        </aside>

        {/* 메인 편집 화면: 뒤에 존재하는 흰색 박스 제거 — 전체 배경 위에 플랫폼 편집이 직접 위치 */}
        <main className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2 border-b border-[#EFECE6] pb-3">
            {PLATFORM_LIST.filter((platform) =>
              selectedPlatforms.includes(platform.id) || drafts[platform.id]
            ).map((platform) => (
              <button
                key={platform.id}
                type="button"
                onClick={() => setActiveView(platform.id)}
                className={`rounded-full px-4 py-2 text-xs font-extrabold transition ${
                  activeView === platform.id
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
                onClick={() => setActiveView("card_news")}
                className={`rounded-full px-4 py-2 text-xs font-extrabold transition ${
                  activeView === "card_news"
                    ? "bg-[#292929] text-white"
                    : "bg-[#EFECE6] text-[#57514A]"
                }`}
              >
                카드뉴스
                {cardNews && <span className="ml-1.5 opacity-60">●</span>}
              </button>
            )}
          </div>

          <div className="mb-3 flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid="generate-active"
              onClick={() => runGeneration([activeView])}
              disabled={!ready || applying || generating || keywordLoading || sourceLoading || !article.title?.trim() || !article.content?.trim()}
              title="이 항목만 생성합니다. 이미 있는 결과와 수정 내용은 새 결과로 바뀝니다."
              className="inline-flex items-center gap-1.5 rounded-full bg-[#292929] px-3 py-2 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {activeView === "card_news"
                ? (cardNews ? "카드뉴스 다시 생성" : "카드뉴스만 생성")
                : `${VIEW_LABELS[activeView] || "플랫폼"} ${drafts[activeView] ? "다시 생성" : "원고 생성"}`}
            </button>
            {activeView !== "card_news" && drafts[activeView] && (
              <button
                type="button"
                onClick={() => copyDraft(activeView)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD6CB] bg-white px-3 py-2 text-[11px] font-bold text-[#292929] hover:bg-[#FAF8F5] transition"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied === activeView ? "복사됨" : "전체 복사"}
              </button>
            )}
          </div>

          {localDraftNotice && (
            <div
              role="status"
              data-testid="local-draft-notice"
              className={`mb-4 flex items-start justify-between rounded-xl border p-3 text-xs leading-5 ${
                localDraftNotice.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <span className="whitespace-pre-wrap break-all">{localDraftNotice.message}</span>
              <button
                type="button"
                onClick={() => setLocalDraftNotice(null)}
                className="ml-3 shrink-0 text-xs font-bold opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {activeView === "card_news" ? (
            <CardViewBoundary key={articleId(article)} draft={cardNews}>
              <PlatformCardEditor draft={cardNews} article={article} onChange={updateCardNews} onAddPhoto={addCardPhoto} preparing={generating} />
            </CardViewBoundary>
          ) : (
            <PlatformDraftEditor
              platform={activeView}
              draft={drafts[activeView]}
              onChange={(next) => updateDraft(activeView, next)}
              cards={cardNews?.cards || []}
              article={article}
            />
          )}
          {onSave && <SaveBar onSave={onSave} testId="convert-save" />}
        </main>
      </div>
    </div>
  );
}
