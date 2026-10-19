// 생성·검수·화면이 공유하는 보수적인 말투 검사. 제목·직접 인용은 검사하지 않는다.
(function(root){
 const quoted=/“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"\n]*"|'[^'\n]*'/gu;
 const quotes=text=>String(text||'').match(quoted)||[];
 function usesDefault(requirements='') {
  const direction=typeof module!=='undefined'?require('./editorial-direction'):root.EditorialDirection;
  return direction.resolve('threads',requirements).styles.body==='casual';
 }
 function issues(paragraphs,requirements='') {
  if(!usesDefault(requirements)||!Array.isArray(paragraphs))return [];
  return paragraphs.flatMap((text,index)=>{
   const prose=String(text||'').replace(quoted,' ');
   const sentences=prose.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu)||[];
   const sentence=sentences.find(value=>/(?:다|습니다|입니다|합니다|됩니다|해요|돼요|에요|예요|어요|아요|나요|까요|세요|십시오)[.!?。！？\s]*$/u.test(value.trim()));
   return sentence?[{index,code:'THREADS_TONE',sentence:sentence.trim()}]:[];
  });
 }
 const api={usesDefault,issues,quotes};
 if(typeof module!=='undefined')module.exports=api;else root.ThreadsTone=api;
})(typeof globalThis!=='undefined'?globalThis:window);
