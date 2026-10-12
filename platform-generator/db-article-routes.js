// 개발용 편집실 → 팀 Core 계약. 별도 DB, 기사 복사 저장소, URL 수집을 만들지 않는다.
const {pathToFileURL} = require('url');
const path = require('path');
module.exports = function registerDbArticleRoutes(app, injectedCore) {
  const corePromise = injectedCore ? Promise.resolve(injectedCore) : (async () => {
    const base = new URL(process.env.NEWSROOM_CORE_ORIGIN || 'http://127.0.0.1:8765');
    if (base.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(base.hostname)
      || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Core 주소는 로컬 HTTP Origin이어야 합니다.');
    const {createCoreApi} = await import(pathToFileURL(path.resolve(__dirname,'../src/api/core-api.js')).href);
    return createCoreApi({
      async json(route,payload,signal) {
        const response = await fetch(new URL(route,base), {method:payload == null ? 'GET':'POST',
          headers:payload == null ? {}:{'Content-Type':'application/json',Origin:base.origin},
          body:payload == null ? undefined:JSON.stringify(payload), signal:signal || AbortSignal.timeout(180000)});
        const data = await response.json();
        if (!response.ok) throw Object.assign(Error(data.error || 'Core 요청 실패'),{status:response.status});
        return data;
      },
      bytes() { throw Error('이 연결에서는 기사 JSON만 조회합니다.'); },
    });
  })();
  // 시작 시 연결 실패도 각 요청에서 안내한다(unhandled rejection을 만들지 않는다).
  corePromise.catch(()=>{});
  const route = (method,url,run) => app[method](url, async (req,res) => {
    // 기존 로컬 SNS와 같은 loopback/Origin 정책을 거친 뒤 Core로 중계한다.
    const host=req.headers.host || '';
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
      || (req.headers.origin && req.headers.origin!==`http://${host}`)) return res.status(403).json({success:false,error:'같은 컴퓨터의 편집실에서만 요청할 수 있습니다.'});
    if(method==='post' && !/^application\/json(?:;|$)/iu.test(req.headers['content-type'] || ''))return res.status(415).json({success:false,error:'JSON 요청이 필요합니다.'});
    try { res.json(await run(await corePromise,req)); }
    catch(error) {res.status(error.status || 502).json({success:false,error:error.status?error.message:'팀 Core를 실행하고 로그인한 뒤 다시 시도해주세요. '+error.message});}
  });
  route('get','/api/core/articles',core=>core.listArticles());
  route('get','/api/core/articles/:id',(core,req)=>core.getArticle(req.params.id));
  route('post','/api/core/freeze',async(core,req)=>{
    const article=req.body?.article;
    if (!/^[a-f0-9]{32}$/.test(article?.article_id || '')) throw Object.assign(Error('DB 기사를 선택해주세요.'),{status:400});
    const snap=await core.createSnapshot(article.article_id);
    if (snap.title.trim() !== article.title?.trim() || snap.subtitle.trim() !== (article.subtitle || '').trim()
      || snap.url.trim() !== (article.url || '').trim()
      || snap.body_text.replace(/\s+/gu,' ').trim() !== (article.content || '').replace(/\s+/gu,' ').trim()) {
      throw Object.assign(Error('DB 원문이 변경됐습니다. 기사를 다시 불러온 뒤 생성해주세요.'),{status:409});
    }
    return snap;
  });
  route('post','/api/core/generate',async(core,req)=>{
    const {platform,payload,snapshot_id}=req.body || {};
    const snap=await core.getSnapshot(snapshot_id);
    if (snap.article_id!==payload?.article?.article_id) throw Object.assign(Error('다른 기사의 고정본입니다.'),{status:409});
    const result=await core.generatePlatform(platform,payload,snapshot_id);
    return {...result,draft:{...result.draft,snapshot_id:snap.id}};
  });
  route('post','/api/core/validate',async(core,req)=>{
    const {snapshot_id,...payload}=req.body || {};
    const snap=await core.getSnapshot(snapshot_id);
    if(snap.article_id!==payload.article?.article_id) throw Object.assign(Error('다른 기사의 고정본입니다.'),{status:409});
    return core.validatePlatform(payload,snapshot_id);
  });
};
