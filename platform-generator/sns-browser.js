// SNS 로그인 브라우저는 렌더 브라우저와 별도로 선택한다. 플랫폼별 로그인 프로필을 보존한다.
const fs=require('node:fs/promises'),path=require('node:path');
const supported=['auto','chrome','msedge','chromium'];
async function launchSnsBrowser(engine,profileDir,choice='auto'){
 if(!supported.includes(choice))throw new Error('SNS 브라우저는 자동·Chrome·Edge·Chromium 중 선택해 주세요.');
 await fs.mkdir(profileDir,{recursive:true,mode:0o700});
 const lockFile=path.join(profileDir,'newsroom-owner.json');let lock;
 for(let attempt=0;attempt<2;attempt++){
  try{lock=await fs.open(lockFile,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid}));break;}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   let owner;try{owner=JSON.parse(await fs.readFile(lockFile,'utf8'));}catch{throw new Error('전용 SNS 프로필이 사용 중입니다. 다른 앱의 전용 창을 닫고 다시 연결해 주세요.');}
   if(!Number.isInteger(owner.pid)||owner.pid<1)throw new Error('SNS 프로필 잠금 정보를 확인해 주세요.');
   try{process.kill(owner.pid,0);throw new Error('다른 앱에서 전용 SNS 브라우저를 사용 중입니다. 그 창을 닫고 다시 연결해 주세요.');}
   catch(check){if(check.code!=='ESRCH')throw check;}
   await fs.unlink(lockFile);
  }
 }
 if(!lock)throw new Error('전용 SNS 프로필을 잠그지 못했습니다. 다시 연결해 주세요.');
 let releasePromise;
 const release=()=>releasePromise||=(async()=>{await lock.close();const owner=JSON.parse(await fs.readFile(lockFile,'utf8').catch(()=>'{}'));if(owner.pid===process.pid)await fs.unlink(lockFile).catch(()=>{});})();
 try{
  const choices=choice==='auto'?['chrome','msedge','chromium']:[choice];
  for(const [i,browser] of choices.entries()){
   try{
    const context=await engine.launchPersistentContext(browser==='chrome'?profileDir:path.join(profileDir,browser),{headless:false,viewport:null,acceptDownloads:false,...(browser==='chromium'?{}:{channel:browser})});
    return {context,browser,release};
   }catch(error){
    // 프로필 사용 중·실행 오류는 다른 브라우저를 중복 실행해서 우회하지 않는다.
    if(!/Executable doesn't exist|not found|not installed|distribution .*not found|executable.*missing/i.test(error.message||'')||i===choices.length-1)throw new Error('SNS 전용 브라우저를 열지 못했습니다. 선택한 Chrome/Edge를 설치하거나 다른 브라우저를 선택해 주세요. 전용 창이 이미 열렸다면 먼저 닫아 주세요. Chromium은 개발 환경에서 npx playwright install chromium으로 설치할 수 있습니다.');
   }
  }
 }catch(error){await release();throw error;}
}
module.exports={launchSnsBrowser,supported};
