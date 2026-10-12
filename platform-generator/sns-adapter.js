// Core 수명과 함께 유지하는 SNS 전용 서비스. 이 경로는 작성창 준비까지만 노출한다.
const readline=require('node:readline'),path=require('node:path');
const {createInstagramService}=require('./instagram-local-service'),{createThreadsService}=require('./threads-local-service');
const root=process.env.NEWSROOM_SNS_PROFILE_ROOT;
const services={instagram:createInstagramService(root?{profileDir:path.join(root,'instagram-browser')}:{ }),threads:createThreadsService(root?{profileDir:path.join(root,'threads-browser')}:{ })};
const lines=readline.createInterface({input:process.stdin});let queue=Promise.resolve(),closing=false;
async function close(){if(closing)return;closing=true;await queue.catch(()=>{});await Promise.allSettled(Object.values(services).map(service=>service.close()));}
lines.on('line',line=>{queue=queue.then(async()=>{
 let input;try{input=JSON.parse(line);const service=services[input.platform];if(!service||!['connect','status','prepare','close'].includes(input.action))throw Error('지원하지 않는 SNS 작업입니다.');const result=await service[input.action](input.payload||{});process.stdout.write(JSON.stringify({id:input.id,ok:true,result})+'\n');}
 catch(error){process.stdout.write(JSON.stringify({id:input?.id,ok:false,error:error.message})+'\n');}
});});
lines.on('close',()=>{close().finally(()=>process.exit(0));});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{lines.close();});
