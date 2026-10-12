import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {validatePlatformDraft} from "../api/platform.js";
import {fingerprint,reviewLabel,reviewStatus,sourceText} from "../lib/platformState.js";

export default function PlatformReview({platform,draft,article,onChange}) {
  const latest=useRef({draft,article});useLayoutEffect(()=>{latest.current={draft,article};},[draft,article]);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const run=async()=>{
    const copy=structuredClone(draft),key=fingerprint(copy),source=sourceText(article),photos=fingerprint(article.photos);
    setBusy(true);setMessage("");
    try{
      const result=await validatePlatformDraft(platform,copy);
      if(!mounted.current||key!==fingerprint(latest.current.draft)||source!==sourceText(latest.current.article)||photos!==fingerprint(latest.current.article.photos))throw Error("검수 도중 원고·사진 또는 원본 기사가 바뀌어 결과를 적용하지 않았습니다. 다시 검수해 주세요.");
      onChange(current=>fingerprint(current)===key?{...current,validation_status:result.status,validation_review:{key,result}}:current);
      setMessage("현재 원고의 변환·요구사항 검수를 마쳤습니다.");
    }catch(error){setMessage(error.message);}finally{setBusy(false);}
  };
  const record=draft?.validation_review;
  return <section className="mb-4 rounded-2xl border border-[#DDD6CB] p-4" data-testid="platform-review">
    <p className="text-sm font-bold">플랫폼 원고 검수 · {reviewLabel(reviewStatus(draft))}</p>
    <p className="my-2 text-xs text-slate-500">기준 원문 대비 변환 왜곡과 요구사항을 확인합니다. 취재자료를 사용하는 기사 전체 팩트체크는 작성 화면에서 따로 실행합니다.</p>
    {draft?.generation_input?.article&&sourceText(draft.generation_input.article)!==sourceText(article)&&<p role="alert" className="text-xs text-amber-700">원본 기사가 변경됐습니다. 검수 기준은 생성에 사용한 원문·고정본입니다. 현재 기사로 사용할 결과는 다시 생성해 주세요.</p>}
    <button type="button" data-testid="platform-validate" disabled={!draft||busy||platform==='blog'} onClick={run} className="rounded-full border px-3 py-2 text-xs font-bold disabled:opacity-50">{busy?"검수 중…":"현재 원고 검수"}</button>
    {message&&<p role="status" className="mt-2 text-xs">{message}</p>}
    {record&&record.key===fingerprint(draft)&&[...(record.result.fact?.issues||[]),...(record.result.requirement?.issues||[])].map((issue,index)=><p key={index} className="mt-2 text-xs text-amber-800">{issue.location}: {issue.reason} {issue.suggestion}</p>)}
  </section>;
}
