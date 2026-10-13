const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {launchSnsBrowser}=require('../sns-browser');
test('SNS 자동 선택은 설치 누락에만 Edge 대체, 프로필 재사용·중복 실행 차단',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sns-browser-test-'));const calls=[];
 const engine={launchPersistentContext:async(dir,options)=>{calls.push({dir,options});if(options.channel==='chrome')throw Error("Executable doesn't exist");return {close:async()=>{}};}};
 try{
  const first=await launchSnsBrowser(engine,root);assert.equal(first.browser,'msedge');assert.equal(calls.length,2);
  await assert.rejects(launchSnsBrowser(engine,root),/다른 앱/);
  await first.release();const again=await launchSnsBrowser(engine,root,'msedge');assert.equal(calls[1].dir,calls[2].dir);await again.release();
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('로그인 브라우저 오류를 렌더 fallback으로 우회하거나 중복 실행하지 않음',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sns-browser-test-'));let calls=0;
 try{
  await assert.rejects(launchSnsBrowser({launchPersistentContext:async()=>{calls++;throw Error('profile locked');}},root),/전용 창/);assert.equal(calls,1);
  await assert.rejects(launchSnsBrowser({},root,'unknown'),/선택/);
  assert.equal((await fs.readdir(root)).includes('newsroom-owner.json'),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
