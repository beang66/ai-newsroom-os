// Threads 전용 Chrome 프로필을 Playwright로 제어합니다.
// 로그인은 공식 창에서 직접 진행합니다. prepare는 작성만, publish는 명시적 확인 후 게시합니다.
const path=require('path'),os=require('os'),fs=require('fs/promises'),crypto=require('crypto');
const {validateInput:validateInstagramInput}=require('./instagram-local-service');
const {SNS_ENDPOINTS}=require('./lib/api');
const THREADS_URL=SNS_ENDPOINTS.threads;
function validateThreadsInput(input){
 if(typeof input?.text!=='string'||!input.text.trim()||input.text.length>500)throw new Error('Threads 게시글은 줄바꿈·URL을 포함해 500자 이내로 작성해주세요.');
 if(!Array.isArray(input.assets)||input.assets.length>10)throw new Error('카드 이미지 목록은 0~10장이어야 합니다.');
 const text=input.text.replace(/\r\n?/g,'\n');
 return input.assets.length?validateInstagramInput({...input,text}):{text,files:[]};
}
async function clickNamed(scope,labels){
 for(const name of labels){
  for(const role of ['button','link','menuitem']){
   const l=scope.getByRole(role,{name,exact:true});if(await l.count()===1&&await l.isVisible()){await l.click({timeout:5000});return true;}
  }
  const icon=scope.locator(`svg[aria-label="${name}"]`);if(await icon.count()===1&&await icon.isVisible()){await icon.click({timeout:5000});return true;}
 }
 return false;
}
function createThreadsService({chromium,profileDir,clock=Date.now}={}){
 profileDir ||= path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'AI-Newsroom','threads-browser');
 let context,page,busy=false,pending=null,browserSession,releasing=Promise.resolve();
 async function exclusive(action){if(busy)throw new Error('이전 Threads 작업이 진행 중입니다.');busy=true;try{return await action();}finally{busy=false;}}
 async function account(){
  if(!context||!page||page.isClosed())return {connected:false,reason:'browser_closed'};
  if(!['threads.com','www.threads.com','threads.net','www.threads.net'].includes(new URL(page.url()).hostname))return {connected:false,reason:'threads_page_required'};
  const username=await page.evaluate(()=>{
   const candidates=[...document.querySelectorAll('a[href]')].filter(a=>/^(프로필|Profile)$/.test((a.getAttribute('aria-label')||a.innerText||'').trim())||[...a.querySelectorAll('svg')].some(svg=>/^(프로필|Profile)$/.test(svg.getAttribute('aria-label')||'')));
   const names=[...new Set(candidates.map(a=>/^\/@([A-Za-z0-9_.]+)\/?$/.exec(new URL(a.href).pathname)?.[1]).filter(Boolean))];return names.length===1?names[0]:null;
  });
  if(!username)return {connected:false,reason:'profile_not_identified'};
  return {connected:true,username,accountId:username.toLowerCase()};
 }
 async function dialog(){const d=page.getByRole('dialog');if(await d.count()!==1||!await d.isVisible())throw new Error('새 Threads 작성창 하나를 열어주세요.');return d;}
 function textbox(scope){return scope.locator('[contenteditable="true"][role="textbox"],textarea[placeholder]');}
 const read=field=>field.evaluate(el=>(el.tagName==='TEXTAREA'?el.value:el.innerText).replace(/\r\n?/g,'\n'));
 // 첨부 미리보기 서명이 바뀌면 준비한 묶음과 다른 것으로 판단합니다.
 const images=scope=>scope.locator('img[src^="blob:"],img[src^="data:image/"]');
 const signature=scope=>images(scope).evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src')));
 async function check(id){
  if(!pending||pending.id!==id||pending.status!=='ready')throw new Error('게시할 준비된 원고가 없습니다.');
  if(clock()-pending.preparedAt>15*60*1000)throw new Error('준비 후 15분이 지났습니다. 다시 준비해주세요.');
  const current=await account();if(!current.connected||current.accountId!==pending.accountId)throw new Error('연결 계정이 변경되었습니다.');
  const scope=await dialog(),field=textbox(scope);
  if(await field.count()!==1||await read(field)!==pending.text)throw new Error('Threads 창의 글이 준비한 원고와 다릅니다. 작성창을 닫고 다시 준비해주세요.');
  if(JSON.stringify(await signature(scope))!==JSON.stringify(pending.images))throw new Error('Threads 첨부 사진이 변경되었습니다. 다시 준비해주세요.');
  const button=scope.getByRole('button',{name:/^(게시|게시하기|Post)$/});
  if(await button.count()!==1||!await button.isEnabled())throw new Error('Threads 게시 버튼을 찾지 못했습니다.');
  return button;
 }
 return {
  connect:(input={})=>exclusive(async()=>{
   if(!context){
    await releasing;
    browserSession=await require('./sns-browser').launchSnsBrowser(chromium||require('playwright').chromium,profileDir,input.browser||process.env.NEWSROOM_THREADS_BROWSER||'auto');
    context=browserSession.context;
    const openedContext=context,session=browserSession;
    context.on('close',()=>{if(context===openedContext){context=null;page=null;pending=null;browserSession=null;}releasing=session.release().catch(()=>{});});
   }else if(input.browser&&input.browser!=='auto'&&input.browser!==browserSession.browser){throw new Error('브라우저를 바꾸려면 기존 전용 창을 먼저 닫아 주세요.');
   }
   if(!page||page.isClosed()){
    page=await context.newPage();const openedPage=page;
    page.on('close',()=>{if(page===openedPage){page=null;pending=null;}});
   }
   await page.bringToFront();
   if(page.url()==='about:blank')await page.goto(THREADS_URL,{waitUntil:'domcontentloaded',timeout:45000});
   return {success:true,message:'Threads 공식 창에서 직접 로그인해 주세요. 로그인 상태를 자동 확인하며 기존 작성창은 유지합니다.'};
  }),
  status:async()=>{let a;try{a=await account();}catch(error){if(!context||!page||page.isClosed())a={connected:false,reason:'browser_closed'};else throw error;}return {success:true,connected:a.connected,username:a.username||null,reason:a.reason||null,browser:browserSession?.browser||null,busy,pending:pending?{id:pending.id,status:pending.status,image_count:pending.imageCount,message:pending.message}:null};},
  prepare:input=>exclusive(async()=>{
   const {text,files}=validateThreadsInput(input),a=await account();if(!a.connected)throw new Error('Threads 로그인 연결을 먼저 확인해주세요.');
   if(pending&&['ready','posting','posted','post_requested','post_uncertain'].includes(pending.status))throw new Error('기존 작성·게시 결과를 확인한 뒤 전용 창을 닫고 다시 연결해주세요.');
   pending={id:crypto.randomUUID(),status:'preparing',text,imageCount:files.length,accountId:a.accountId,preparedAt:clock()};
   const preparingRequest=pending;
   try{
    await page.bringToFront();
    if(!await page.getByRole('dialog').count()){
     if(!await clickNamed(page,['만들기','Create','새 스레드','New thread','새 게시물','New post','무슨 생각을 하고 계신가요?','What\'s new?']))throw new Error('새 글 버튼을 찾지 못했습니다. Threads 창에서 새 게시물 작성창을 직접 열고 다시 준비해주세요.');
     await page.getByRole('dialog').waitFor({state:'visible',timeout:8000});
    }
    const scope=await dialog(),field=textbox(scope);
    if(await field.count()!==1||!await field.isVisible())throw new Error('Threads 글 입력칸을 찾지 못했습니다.');
    if((await read(field)).trim()||(await signature(scope)).length)throw new Error('비어 있는 새 작성창을 사용해주세요. 기존 내용을 덮어쓰지 않았습니다.');
    await field.focus();
    if(await field.evaluate(el=>el.tagName==='TEXTAREA'))await field.fill(text);
    else for(const [i,line] of text.split('\n').entries()){if(i)await page.keyboard.press('Shift+Enter');if(line)await page.keyboard.insertText(line);}
    if(await read(field)!==text)throw new Error('Threads 줄바꿈·본문이 원고와 다릅니다.');
    if(files.length){
     const input=scope.locator('input[type="file"]');
     if(await input.count()===1)await input.setInputFiles(files,{timeout:10000});
     else{
      const chooser=page.waitForEvent('filechooser',{timeout:10000});chooser.catch(()=>{});
      if(!await clickNamed(scope,['첨부','사진 또는 동영상 첨부','Attach media','Attach','미디어 첨부']))throw new Error('사진 첨부 버튼을 찾지 못했습니다.');
      await (await chooser).setFiles(files);
     }
     await images(scope).first().waitFor({state:'visible',timeout:15000});
     pending.images=await signature(scope);
     if(pending.images.length!==files.length)throw new Error('첨부 사진 장수를 확인하지 못했습니다. 전용 창을 확인해주세요.');
    }else pending.images=[];
    if(pending!==preparingRequest||!page||page.isClosed())throw new Error('Threads 창 또는 페이지가 닫혔습니다. 다시 로그인 연결한 뒤 작성창을 채워 주세요.');
    pending.status='ready';pending.preparedAt=clock();await check(pending.id);
    pending.message='Threads 작성창에 글과 카드 이미지를 준비했습니다. 계정·본문·사진 순서를 확인한 뒤 게시해주세요.';
    return {success:true,id:pending.id,status:'ready',image_count:files.length,username:a.username,message:pending.message};
   }catch(error){if(!context||!page||page.isClosed())error=new Error('Threads 창 또는 페이지가 닫혔습니다. 다시 로그인 연결한 뒤 작성창을 채워 주세요.');if(pending===preparingRequest){pending.status='prepare_failed';pending.message=error.message;}throw error;}
  }),
  publish:input=>exclusive(async()=>{
   if(input?.reviewed!==true)throw new Error('Threads 계정·글·사진을 확인한 뒤 게시해주세요.');
   const button=await check(input.id);pending.status='posting';
   try{
    await button.click({timeout:10000});let confirmed=false;
    try{await page.getByText(/^(게시됨|게시되었습니다[.!]?|Posted[.!]?|Your thread was posted[.!]?)$/i).first().waitFor({state:'visible',timeout:15000});confirmed=true;}catch{}
    pending.status=confirmed?'posted':'post_requested';pending.message=confirmed?'Threads 게시 완료 알림을 확인했습니다.':'게시 버튼을 눌렀습니다. 완료 알림을 확인하지 못했으니 Threads에서 실제 게시 여부를 확인해주세요. 자동 재시도하지 않습니다.';
    return {success:true,status:pending.status,confirmed,message:pending.message};
   }catch{pending.status='post_uncertain';throw new Error('게시 결과가 불확실합니다. Threads에서 확인해주세요. 자동 재시도하지 않습니다.');}
  }),
  close:()=>exclusive(async()=>{const session=browserSession;if(context)await context.close();await session?.release();await releasing;context=null;page=null;pending=null;browserSession=null;return {success:true};})
 };
}
module.exports={createThreadsService,validateThreadsInput};
