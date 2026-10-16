import React, { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Hash,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { freezeArticle, generatePlatform, suggestPlatformKeywords, getStudioArticle, renderStoredCard } from "../api/platform";
import {prepareCardImages} from '../lib/cardPreparation.js';

import PlatformReview from "./PlatformReview.jsx";
import PlatformCardEditor from "./PlatformCardEditor.jsx";
import PlatformDelivery from "./PlatformDelivery.jsx";
import ThreadsEditor from "./ThreadsEditor.jsx";
import PlatformArticlePicker from './PlatformArticlePicker.jsx';
import {appliedSource,applyCurrentSource,sourceReady,beginSourceTransition,claimSourceTransition,cancelSourceTransition} from '../lib/platformSource.js';
import {articleId, fingerprint, invalidateDraft, sourceText, subtitleLabel, supportedPlatforms, visibleDrafts,sameGenerationSource} from "../lib/platformState.js";
import {sourceVersion,conditionsCurrent,heldConditions as conditionsToHold,hasConditions,generationErrorCode,conditionValues,generationHistory} from '../lib/platformLifecycle.js';

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

function PlatformDraftEditor({ platform, draft, onChange, cards, article }) {
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
    return (
      <div className="space-y-4">
        <TextArea
          label="도입"
          value={draft.opening}
          onChange={(value) => changed((next) => { next.opening = value; })}
          rows={3}
          evidence={draft.block_evidence?.opening}
        />
        {(draft.paragraphs || []).map((paragraph, index) => (
          <TextArea
            key={index}
            label={`본문 ${index + 1}`}
            value={paragraph}
            onChange={(value) => changed((next) => { next.paragraphs[index] = value; })}
            evidence={draft.block_evidence?.paragraphs?.[index]}
          />
        ))}
        <TextArea
          label="마무리"
          value={draft.closing}
          onChange={(value) => changed((next) => { next.closing = value; })}
          rows={3}
          evidence={draft.block_evidence?.closing}
        />
        <TextArea
          label="해시태그 · 3~5개"
          value={(draft.hashtags || []).join(" ")}
          onChange={(value) => changed((next) => {
            next.hashtags = value.trim() ? value.trim().split(/\s+/u) : [];
          })}
          rows={2}
        />
      </div>
    );
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

export default function PlatformStudio({ article, setArticle, flush, onOpenArticles, onEditArticle, onApplyArticle,
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
  const [runHistory,setRunHistory]=useState(()=>generationHistory(savedConfig.run_history));
  const history=useRef(runHistory);
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
      setProgress({});setMessage('');setLastRun(null);setCustomKeyword('');
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
        setProgress({});setMessage('');setLastRun(null);
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
    let jpgNote='';
    const inputSource=sourceText(article),inputConfig=fingerprint({requirements,selectedKeywords,selectedPlatforms,includeCardNews});
    const run={id:crypto.randomUUID(),article_id:articleId(article),source_version:sourceVersion(article),started_at:new Date().toISOString()};
    const isCurrent=()=>mounted.current&&!live.current.sourceLoading&&!application.current&&articleId(live.current.article)===run.article_id&&sourceText(live.current.article)===inputSource&&inputConfig===fingerprint({requirements:live.current.requirements,selectedKeywords:live.current.selectedKeywords,selectedPlatforms:live.current.selectedPlatforms,includeCardNews:live.current.includeCardNews});
    const remember=(platform,stage,status,code)=>{
      if(!isCurrent())return;
      history.current=[...history.current,{...run,platform,stage,status,...(code?{code}:{}),at:new Date().toISOString()}].slice(-20);
      setRunHistory(history.current);
      persistRef.current(live.current.drafts,live.current.cardNews,{run_history:history.current});
    };
    const startingDrafts=Object.fromEntries(list.map(target=>[target,fingerprint(target==='card_news'?live.current.cardNews:live.current.drafts[target])]));
    let frozen;
    try { frozen = await freeze();run.snapshot_id=frozen.snapshotId;run.revision_no=frozen.revisionNo;setLastRun({...run});setRequestSource({title:frozen.article.title, snapshotId:frozen.snapshotId}); }
    catch (error) {
      pending.current = false;
      if (mounted.current) { setMessage(error.message); setGenerating(false); setRequestSource(null); setProgress({}); }
      return;
    }

    for (const target of list) {
      if (!isCurrent()) break;
      nextProgress[target] = "생성 중";
      setProgress({ ...nextProgress });
      let stage='generate';
      try {
        if(startingDrafts[target]!==fingerprint(target==='card_news'?live.current.cardNews:live.current.drafts[target])){
          nextProgress[target]='중단 · 편집한 결과를 보존했습니다.';remember(target,'generate','skipped','DRAFT_CHANGED');setProgress({...nextProgress});continue;
        }
        remember(target,'generate','started');
        const before=startingDrafts[target];
        let generated = await generatePlatform(
          target,
          frozen.article,
          selectedKeywords,
          requirements,
          frozen?.snapshotId,
          article,
          frozen.source_url,
        );
        if(!isCurrent())break;
        if (!generated) throw new Error("생성 결과가 비어 있습니다.");
        if(!generated.article_id)throw Error("기사 ID를 확인할 수 없습니다. 기사를 저장한 뒤 다시 생성해 주세요.");
        if(generated.article_id!==frozen.articleId || generated.snapshot_id!==frozen.snapshotId)throw Error("생성 결과의 기사·고정본이 요청과 다릅니다. 결과를 적용하지 않았습니다.");
        const current=live.current;
        if(!mounted.current||inputSource!==sourceText(current.article)||articleId(current.article)!==frozen.articleId||inputConfig!==fingerprint({requirements:current.requirements,selectedKeywords:current.selectedKeywords,selectedPlatforms:current.selectedPlatforms,includeCardNews:current.includeCardNews})||before!==fingerprint(target==='card_news'?current.cardNews:current.drafts[target]))throw Error("생성 중 원문·조건·원고가 바뀌어 결과를 적용하지 않았습니다. 다시 생성해 주세요.");
        generated={...generated,generation_run:{...run,platform:target}};
        remember(target,'generate','draft_ready');
        if(target==='card_news') {
          updateCardNews(generated);success.push(target);
          stage='jpg';
          nextProgress[target]='문안 생성 완료 · JPG 확인 중';setProgress({...nextProgress});
          const expected=fingerprint({cards:generated,photos:current.article.photos});
          const prepared=await prepareCardImages({draft:generated,article:current.article,render:renderStoredCard,
            isCurrent:()=>mounted.current&&inputSource===sourceText(live.current.article)&&expected===fingerprint({cards:live.current.cardNews,photos:live.current.article.photos}),
            onProgress:(index,total)=>{nextProgress[target]=`문안 생성 완료 · JPG 확인 ${index}/${total}`;if(mounted.current)setProgress({...nextProgress});},
            onCard:(id,patch)=>updateCardNews(value=>({...value,cards:value.cards.map(card=>card.card_id===id?{...card,...patch}:card)}))});
          nextProgress[target]=prepared.complete?'문안 생성 완료':'문안 생성 완료 · JPG 준비 실패';
          remember(target,'jpg',prepared.complete?'ready':'failed',prepared.complete?undefined:'JPG_RENDER_FAILED');
          jpgNote=` JPG 확인: 새 렌더 ${prepared.rendered}장 · 재사용 ${prepared.reused}장 · ${(prepared.elapsed_ms/1000).toFixed(1)}초.${prepared.complete?'':` ${prepared.errors.map(error=>`${error.index+1}번 카드: ${error.reason}`).join(' ')}`}`;
        } else {updateDraft(target,generated);nextProgress[target]="초안 생성 완료 · 검수 별도";success.push(target);}
      } catch (error) {
        if(!isCurrent())break;
        remember(target,stage,'failed',stage==='jpg'?'JPG_RENDER_FAILED':generationErrorCode(error));
        nextProgress[target] = `${stage==='jpg'?'문안 생성 완료 · JPG 확인 실패':'실패'} · ${error.message || "생성 오류"}`;
      }
      if (mounted.current) setProgress({ ...nextProgress });
    }
    pending.current = false;
    if (!mounted.current) return;
    if(!isCurrent()){setGenerating(false);setRequestSource(null);setProgress({});setMessage('원문 또는 입력 조건이 바뀌어 이전 작업의 후속 호출과 결과 적용을 중단했습니다. 기존 결과는 보존했습니다.');return;}
    if (success.length) {
      setActiveView(success[0]);
    }
    setMessage(
      success.length
        ? `${success.length}/${list.length}개 결과를 실제 생성 엔진에서 받아왔습니다.${
            frozen ? ` (저장 ${frozen.revisionNo}번 버전의 글 기준)` : " (고정본을 만들지 못해 현재 글로 생성했습니다)"
          }${jpgNote}`
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
  const currentResult=!!currentDraft&&currentDraft.article_id===articleId(article)&&sameGenerationSource(currentDraft,article);

  return (
    <div className="w-full space-y-5 animate-float-in text-[#292929]" data-testid="format-converter">
      <div className="flex flex-col gap-3 border-b border-[#E7E2D9] pb-4 sm:flex-row sm:items-end sm:justify-end">
        <button
          type="button"
          onClick={() => runGeneration()}
          disabled={!ready || applying || generating || keywordLoading || sourceLoading || !article.title?.trim() || !article.content?.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#292929] px-5 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "선택 항목 생성 중" : "선택 항목 생성"}
        </button>
      </div>

      {pickerOpen&&<PlatformArticlePicker onSelect={selectPreview} onClose={()=>setPickerOpen(false)}/>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-[#DDD6CB] bg-white/90 p-5 shadow-sm">
            <div className="flex items-start gap-3 border-b border-[#EFECE6] pb-4">
              <FileText className="mt-0.5 h-4 w-4 text-[#8E8982]" />
              <div className="min-w-0">
                <h3 className="text-xs font-black">불러온 기사</h3>
                <button type="button" data-testid="choose-studio-article" disabled={applying||sourceLoading} onClick={()=>setPickerOpen(true)} className="mt-3 rounded-xl border px-3 py-2 text-xs font-bold">저장 기사에서 선택</button>
                {previewLoading||sourceLoading ? <p role="status">기사 불러오는 중…</p> : <div data-testid="loaded-article" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  <span className="mt-3 block text-[10px] font-bold">기사 제목</span>
                  <p data-testid="loaded-title" className="mt-0.5 text-sm font-black leading-6">{preview?.article.title || "기사 미선택"}</p>
                  <span className="mt-3 block text-[10px] font-bold">부제목</span>
                  <p data-testid="loaded-subtitle" className="mt-0.5 text-xs leading-6">{subtitleLabel({subtitle:preview?.subtitle})}</p>
                  <p className="mt-2 text-[10px] leading-5 text-[#8E8982]">부제는 기사 화면의 표시 정보입니다. 생성 입력의 부제 전달은 미연결입니다.</p>
                  {!preview?.article.content?.trim() && <p role="status" className="mt-2 text-xs">{preview?.article.title ? "기사 본문 없음 · 기사 편집 화면에서 확인해 주세요." : "DB 기사를 선택해 주세요."}</p>}
                  {/^https?:\/\//iu.test(preview?.article.url || "") && <a href={preview.article.url} target="_blank" rel="noreferrer" className="mt-2 block text-xs underline">원문 출처 링크</a>}
                  <span className="mt-2 block text-[10px] text-[#8E8982]">본문 {(preview?.article.content || '').length.toLocaleString()}자</span>
                </div>}
                {previewError&&<p role="alert" className="mt-2 text-xs text-red-700">기사 조회 실패: {previewError}</p>}
                <button type="button" data-testid="apply-studio-article" disabled={applying||previewLoading||sourceLoading||!preview?.article.articleId||!preview.article.content?.trim()} onClick={applyPreview} className="mt-3 rounded-xl bg-[#292929] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{applying?'기사 적용 중…':'이 기사로 콘텐츠 제작'}</button>
                {applyError&&<p role="alert" className="mt-2 text-xs text-red-700">적용 실패: {applyError}</p>}
                <p role="status" data-testid="applied-source" className="mt-3 whitespace-pre-wrap break-words text-xs leading-6">
                  {ready?`적용 완료 · ${applied.title}`:applied?'원문이 변경됐습니다. 재적용이 필요합니다.':'생성 원문 미적용 · 기사를 확인한 뒤 이 기사로 콘텐츠 제작을 눌러 주세요.'}
                  {preview&&ready&&articleId(preview.article)!==applied.id&&<><br/>미리보기 기사와 적용 기사가 다릅니다. 생성은 적용 기사로 진행합니다.</>}
                </p>
                {sourceError && <p role="alert" className="mt-2 text-xs text-red-700">{sourceError}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {onEditArticle && <button onClick={onEditArticle} className="underline">기사 편집</button>}
                  {onOpenArticles && <button onClick={onOpenArticles} className="underline">저장 기사 목록</button>}
                </div>
                {requestSource && <div role="status" data-testid="request-source" className="mt-3 whitespace-pre-wrap break-words text-xs leading-6">
                  처리 기준 기사: {requestSource.title}<br />{requestSource.snapshotId ? "Core 고정본의 제목·본문으로 처리 중" : "저장·고정본 확인 중"}
                </div>}
              </div>
            </div>

            <div className="pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-black">배포 플랫폼</h3>
                <span className="text-[10px] text-[#8E8982]">다중 선택</span>
              </div>
              <div className="space-y-2">
                {PLATFORM_LIST.map((platform) => {
                  const selected = selectedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition ${
                        selected
                          ? "border-[#292929] bg-[#292929] text-white"
                          : "border-[#DDD6CB] bg-[#FAF8F5] text-[#292929]"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-extrabold">{platform.label}</div>
                        <div className={`text-[10px] ${selected ? "text-white/60" : "text-[#8E8982]"}`}>
                          {platform.badge}
                        </div>
                      </div>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        selected ? "border-white bg-white text-[#292929]" : "border-[#CFC7BC] bg-white"
                      }`}>
                        {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-2xl border border-[#DDD6CB] bg-[#FAF8F5] p-3">
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
            </div>
          </section>

          <section className="rounded-3xl border border-[#DDD6CB] bg-white/90 p-5 shadow-sm space-y-3">
            {previousConditions&&hasConditions(previousConditions)&&<div data-testid="previous-conditions" className="rounded-xl border border-amber-300 p-3 text-xs">
              <p>이전 원문의 입력 조건을 보존했습니다. 현재 생성에는 자동 적용하지 않습니다.</p>
              <details><summary>보존한 조건 보기</summary><p>{(previousConditions.selectedKeywords||[]).join(', ')}</p><p>{previousConditions.requirements}</p></details>
              <button type="button" disabled={generating||keywordLoading||applying} data-testid="reuse-conditions" onClick={()=>{
                const held=previousConditions;setSelectedKeywords(held.selectedKeywords||[]);setRequirements(held.requirements||'');setPreviousConditions(null);
                persist(drafts,cardNews,{selectedKeywords:held.selectedKeywords||[],requirements:held.requirements||'',previous_conditions:null});
              }} className="mt-2 underline">확인 후 현재 원문에 다시 사용</button>
            </div>}
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

          {(Object.keys(progress).length > 0 || message || runHistory.length>0) && (
            <section className="rounded-3xl border border-[#DDD6CB] bg-[#FAF8F5] p-4 text-[11px]">
              {lastRun&&<p data-testid="generation-run" className="mb-2">이번 생성 시도 · {lastRun.id.slice(0,8)} · 저장 {lastRun.revision_no}번 고정본 기준</p>}
              {Object.entries(progress).map(([id, status]) => (
                <div key={id} className="flex justify-between gap-3 py-1">
                  <span className="font-bold">{VIEW_LABELS[id]}</span>
                  <span className={status.startsWith("실패") ? "text-red-600" : "text-[#756F67]"}>
                    {status}
                  </span>
                </div>
              ))}
              {message && <p className="mt-2 border-t border-[#DDD6CB] pt-2 leading-5 text-[#57514A]">{message}</p>}
              {runHistory.length>0&&<details data-testid="generation-history" className="mt-2 border-t pt-2"><summary>최근 작업 기록 · 원문과 AI 응답은 기록하지 않음</summary>{runHistory.map((entry,index)=><p key={index}>
                {entry.id.slice(0,8)} · {entry.source_version===sourceVersion(article)?'현재 원문':'이전 원문'} · {VIEW_LABELS[entry.platform]||entry.platform} · {entry.stage} · {entry.code||entry.status} · {entry.at}
              </p>)}</details>}
            </section>
          )}
        </aside>

        <main className="min-w-0 rounded-3xl border border-[#DDD6CB] bg-white/90 p-4 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap gap-2 border-b border-[#EFECE6] pb-4">
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

          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8982]">
                GENERATED DRAFT
              </span>
              <h3 className="mt-0.5 text-lg font-black">
                {VIEW_LABELS[activeView] || "플랫폼 원고"} 편집
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-[#8E8982]">
                {currentDraft&&!currentResult?'이전 원문으로 생성한 보존본입니다. 현재 원문의 생성 성공·검수·SNS 준비 결과가 아닙니다.':currentDraft?.validation_status === "needs_recheck"
                  ? "생성 뒤 수정된 내용입니다. 원문 근거 재검수가 필요합니다."
                  : currentDraft
                  ? "실제 생성 엔진 결과입니다. 발행 전 사람이 최종 검토해야 합니다."
                  : "아직 생성 결과가 없습니다."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD6CB] bg-white px-3 py-2 text-[11px] font-bold"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied === activeView ? "복사됨" : "전체 복사"}
              </button>
            )}
            </div>
          </div>

          {currentDraft&&<p role={currentResult?'status':'alert'} data-testid="draft-origin-status" className={`mb-4 rounded-xl border p-3 text-xs ${currentResult?'text-slate-600':'border-amber-300 text-amber-800'}`}>
            {currentResult?'현재 원문 결과':'이전 원문 결과 · SNS 준비에서 제외'} · 기준 원문: {currentDraft.generation_input?.article?.title||'연결 확인 필요'}
            {currentDraft.generation_run?.revision_no!=null&&` · 저장 ${currentDraft.generation_run.revision_no}번 고정본`}
            {!currentResult&&' · 새 생성이 실패해도 이 보존본은 삭제하지 않습니다.'}
          </p>}

          {activeView === "card_news" ? (
            <CardViewBoundary key={articleId(article)} draft={cardNews}>
              <PlatformReview platform={activeView} draft={cardNews} article={article} onChange={updateCardNews}/>
              <PlatformDelivery platform={activeView} draft={cardNews} cards={cardNews} article={article} onCards={updateCardNews} preparing={generating}/>
              <PlatformCardEditor draft={cardNews} article={article} onChange={updateCardNews} onAddPhoto={addCardPhoto} preparing={generating} />
            </CardViewBoundary>
          ) : (
            <>
              <PlatformReview key={"review:"+activeView+articleId(article)} platform={activeView} draft={currentDraft} article={article} onChange={change=>updateDraft(activeView,change)}/>
              <PlatformDelivery key={"delivery:"+activeView+articleId(article)} platform={activeView} draft={currentDraft} cards={cardNews} article={article} onCards={updateCardNews} preparing={generating}/>
              <PlatformDraftEditor
                platform={activeView}
                draft={drafts[activeView]}
                onChange={(next) => updateDraft(activeView, next)}
                cards={cardNews?.cards || []}
                article={article}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
