// server.js: require('./editor-routes')(app); after express.json middleware.
const path=require('path');
const fs=require('fs');
const {randomUUID}=require('crypto');
const {chromium}=require('playwright');
const template=require('./public/card-template');
module.exports=function(app){
 if(fs.existsSync(path.join(__dirname,'.env')))require('dotenv').config({path:path.join(__dirname,'.env')});
 async function unsplash(endpoint){
  if(!process.env.UNSPLASH_ACCESS_KEY)throw new Error('Unsplash 키가 없습니다. .env에 UNSPLASH_ACCESS_KEY를 설정하고 서버를 다시 실행해주세요.');
  const r=await fetch('https://api.unsplash.com'+endpoint,{headers:{Authorization:'Client-ID '+process.env.UNSPLASH_ACCESS_KEY,'Accept-Version':'v1'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Unsplash 요청 실패 ('+r.status+'). 키 또는 사용 한도를 확인해주세요.');return r.json();
 }
 app.get('/editor/photos',async(req,res)=>{try{const q=String(req.query.q||'').trim().slice(0,100);if(!q)return res.status(400).json({error:'검색어를 입력해주세요.'});const data=await unsplash('/search/photos?per_page=12&query='+encodeURIComponent(q));res.json({photos:data.results.map(p=>({id:p.id,url:p.urls.regular,thumb:p.urls.small,photographer:p.user.name,profile:p.user.links.html}))})}catch(e){res.status(502).json({error:e.message})}});
 app.post('/editor/photos/select',async(req,res)=>{try{const id=String(req.body.id||'');if(!/^[\w-]{1,100}$/.test(id))return res.status(400).json({error:'사진 ID가 잘못되었습니다.'});await unsplash('/photos/'+id+'/download');res.json({success:true})}catch(e){res.status(502).json({error:e.message})}});
 app.post('/editor/render',async(req,res)=>{let browser;try{
  const c=req.body.card;if(!c||typeof c.headline!=='string'||!c.headline.trim())return res.status(400).json({error:'제목을 입력해주세요.'});
  if(['keyword','headline','body'].some(k=>typeof c[k]!=='string'||c[k].length>5000))return res.status(400).json({error:'카드 텍스트를 확인해주세요.'});
  if(c.image?.url&&!template.validImage(c.image.url))return res.status(400).json({error:'지원하지 않는 사진 주소입니다.'});
  // 비교형은 두 항목, 목록·단계형은 2~4개 항목으로 출력합니다.
  const layout=template.normalizeDesign(c).layout;
  const lines=c.body.split('\n').filter(line=>line.trim()).length;
  if((layout==='comparison'&&lines!==2)||(['list','steps'].includes(layout)&&(lines<2||lines>4)))return res.status(400).json({error:'배치에 맞게 본문 줄바꿈을 조정하거나 설명형으로 변경해주세요.'});
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.protocol==='https:'&&u.hostname==='images.unsplash.com'?route.continue():route.abort()});
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+'</style>'+template.markup(c)+'</html>',{waitUntil:'load',timeout:20000});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
  // 화면과 JPG에서 같은 글 맞춤 함수를 실행합니다.
  const fit=await page.evaluate(template.fitCard);
  if(!fit.measured||fit.overflow)return res.status(400).json({error:'텍스트가 카드 영역을 넘습니다. 문장을 줄이거나 카드를 나눠주세요.'});
  const dir=path.join(__dirname,'output');fs.mkdirSync(dir,{recursive:true});const name='editor_'+randomUUID()+'.jpg';await page.screenshot({path:path.join(dir,name),type:'jpeg',quality:95});res.json({success:true,file_name:name,image_url:'/output/'+name});
 }catch(e){res.status(500).json({error:'카드 출력 실패: '+e.message})}finally{if(browser)await browser.close()}});
};
