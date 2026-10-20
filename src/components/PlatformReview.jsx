import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {validatePlatformDraft} from "../api/platform.js";
import {fingerprint,reviewLabel,reviewStatus,sourceText,sameGenerationSource,attachCurrentReview,reusableReview,articleId} from "../lib/platformState.js";

export default function PlatformReview({platform,draft,article,onChange,compact=false}) {
  const current=!!draft&&draft.article_id===articleId(article)&&sameGenerationSource(draft,article);
  const latest=useRef({draft,article});useLayoutEffect(()=>{latest.current={draft,article};},[draft,article]);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const inFlight=useRef(false);
  const run=async(force=false)=>{
    if(inFlight.current||!current)return;
    if(!force&&reusableReview(platform,draft,article)){setMessage('같은 원고와 조건의 완료된 검수 결과를 사용했습니다.');return;}
    const copy=structuredClone(draft),key=fingerprint(copy),source=sourceText(article),photos=fingerprint(article.photos);
    inFlight.current=true;setBusy(true);setMessage("");
    try{
      const result=await validatePlatformDraft(platform,copy);
      if(!mounted.current||key!==fingerprint(latest.current.draft)||source!==sourceText(latest.current.article)||photos!==fingerprint(latest.current.article.photos))throw Error("검수 도중 원고·사진 또는 원본 기사가 바뀌어 결과를 적용하지 않았습니다. 다시 검수해 주세요.");
      onChange(current=>fingerprint(current)===key?attachCurrentReview(platform,current,article,result):current);
      setMessage("현재 원고의 변환·요구사항 검수를 마쳤습니다.");
    }catch(error){setMessage(error.message);}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  };
  const record=draft?.validation_review;
  const cached=current&&reusableReview(platform,draft,article);
  // compact: 화면(로컬 앱 연결 탭)이 열리는 즉시 검수를 시작하고 결과를 한 줄로만 보여준다
  useEffect(()=>{if(compact&&current&&!cached)run();},[]);
  if(compact){
    const issues=record&&record.key===fingerprint(draft)?[...(record.result.fact?.issues||[]),...(record.result.requirement?.issues||[])]:[];
    const status=busy?'검수 중…':!draft?'원고 없음':!current?'이전 원문 결과 · 검수 제외':message&&!cached?message:`${reviewLabel(reviewStatus(draft))}${issues.length?` · ${issues.length}건 확인 필요`:''}`;
    const tone=busy||!draft||!current?'text-slate-500':cached&&!issues.length?'text-emerald-700':'text-amber-800';
    return <p role="status" data-testid="platform-review" title={issues.map(issue=>`${issue.location}: ${issue.reason}`).join(' / ')||status} className={`truncate text-[13px] font-bold ${tone}`}>플랫폼 원고 검수 · {status}</p>;
  }
  return <section className="mb-4 rounded-2xl border border-[#DDD6CB] p-4" data-testid="platform-review">
    <p className="text-sm font-bold">플랫폼 원고 검수 · {draft&&!current?'이전 원문 결과':reviewLabel(reviewStatus(draft))}</p>
    <p className="my-2 text-xs text-slate-500">기준 원문 대비 변환 왜곡과 요구사항을 확인합니다. 취재자료를 사용하는 기사 전체 팩트체크는 작성 화면에서 따로 실행합니다.</p>
    {draft?.generation_input?.article&&!sameGenerationSource(draft,article)&&<p role="alert" className="text-xs text-amber-700">원본 기사가 변경됐습니다. 검수 기준은 생성에 사용한 원문·고정본입니다. 현재 기사로 사용할 결과는 다시 생성해 주세요.</p>}
    <button type="button" data-testid="platform-validate" disabled={!current||busy||!!cached} onClick={()=>run()} className="rounded-full border px-3 py-2 text-xs font-bold disabled:opacity-50">{busy?"검수 중…":cached?"검수 완료":"현재 원고 검수"}</button>
    {cached&&<button type="button" disabled={busy} onClick={()=>run(true)} className="ml-2 rounded-full border px-3 py-2 text-xs">다시 검수</button>}
    {message&&<p role="status" className="mt-2 text-xs">{message}</p>}
    {record&&record.key===fingerprint(draft)&&[...(record.result.fact?.issues||[]),...(record.result.requirement?.issues||[])].map((issue,index)=><p key={index} className="mt-2 text-xs text-amber-800">{issue.location}: {issue.reason} {issue.suggestion}</p>)}
  </section>;
}
