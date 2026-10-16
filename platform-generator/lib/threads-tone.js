// 생성·검수·화면이 공유하는 보수적인 말투 검사. 제목·직접 인용은 검사하지 않는다.
(function(root){
 const quoted=/“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"\n]*"|'[^'\n]*'/gu;
 const quotes=text=>String(text||'').match(quoted)||[];
 function usesDefault(requirements='') {
  const request=String(requirements).replace(/(?:기사체|한다체|다\s*체|해요체|습니다체|합니다체|존댓말|높임말)\s*(?:은|는|을|를)?\s*(?:금지|말고|쓰지|사용하지|빼고|아닌|대신|반말로\s*(?:바꿔|변경|교정))/g,'');
  return !/(?:기사체|한다체|다\s*체|해요체|습니다체|합니다체|존댓말|높임말|반말\s*(?:은|는|을|로)?\s*(?:금지|말고|쓰지|사용하지))/.test(request);
 }
 function issues(paragraphs,requirements='') {
  if(!usesDefault(requirements)||!Array.isArray(paragraphs))return [];
  return paragraphs.flatMap((text,index)=>{
   const prose=String(text||'').replace(quoted,' ');
   const sentences=prose.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu)||[];
   return sentences.some(sentence=>/(?:다|습니다|입니다|합니다|됩니다|해요|돼요|에요|예요|어요|아요|나요|까요|세요|십시오)[.!?。！？\s]*$/u.test(sentence.trim()))?[{index,code:'THREADS_TONE'}]:[];
  });
 }
 const api={usesDefault,issues,quotes};
 if(typeof module!=='undefined')module.exports=api;else root.ThreadsTone=api;
})(typeof globalThis!=='undefined'?globalThis:window);
