import {articleId,sourceText} from './platformState.js';

// UI의 조건 연결 키다. Core 고정본/소유권 검사나 근거 인용문을 대체하지 않는다.
export function sourceVersion(article) {
 const text=JSON.stringify([articleId(article),sourceText(article)]);
 const values=[2166136261,2246822507,3266489909,668265263],primes=[16777619,3266489917,668265263,374761393];
 for(let i=0;i<text.length;i++)for(let j=0;j<4;j++)values[j]=Math.imul(values[j]^text.charCodeAt(i),primes[j])>>>0;
 return 'v1:'+values.map(value=>value.toString(16).padStart(8,'0')).join('');
}
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const restoredPlatformFields=draft=>({
 platformDrafts:object(draft.platformDrafts)?draft.platformDrafts:{},
 cardNews:object(draft.cardNews)?draft.cardNews:null,
 platformGeneration:object(draft.platformGeneration)?draft.platformGeneration:{},
});
export const conditionValues=config=>({selectedKeywords:Array.isArray(config?.selectedKeywords)?config.selectedKeywords.filter(value=>typeof value==='string'&&value.trim()):[],requirements:typeof config?.requirements==='string'?config.requirements:''});
export const hasConditions=config=>{const values=conditionValues(config);return !!(values.selectedKeywords.length||values.requirements.trim());};
export const conditionsCurrent=(config,article)=>!hasConditions(config)||config.source_version===sourceVersion(article);
export const heldConditions=(config,article)=>!conditionsCurrent(config,article)?{
 ...conditionValues(config),source_version:config.source_version||null,
}:hasConditions(config.previous_conditions)?{...conditionValues(config.previous_conditions),source_version:config.previous_conditions.source_version||null}:null;
export const generationHistory=value=>Array.isArray(value)?value.filter(entry=>entry&&typeof entry.id==='string'&&typeof entry.at==='string'&&['instagram','threads','card_news'].includes(entry.platform)&&typeof entry.stage==='string'&&typeof entry.status==='string'&&(entry.code===undefined||typeof entry.code==='string')).slice(-20):[];
export function generationErrorCode(error) {
 const text=error?.message||'';
 if(/해시태그/.test(text))return 'HASHTAG_FORMAT';
 if(/closing|opening|작성 기준/.test(text))return 'WRITING_FORMAT';
 if(/비교형|배치|줄바꿈/.test(text))return 'CARD_LAYOUT';
 if(/고정본|원문.*바뀌|원본.*변경|결과를 적용하지/.test(text))return 'SOURCE_CHANGED';
 if(/근거|인용/.test(text))return 'EVIDENCE';
 return 'GENERATION_FAILED';
}
