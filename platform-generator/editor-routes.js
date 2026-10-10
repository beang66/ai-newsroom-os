// server.js: require('./editor-routes')(app); after express.json middleware.
const path=require('path');
const fs=require('fs');
const {randomUUID}=require('crypto');
const {chromium}=require('playwright');
const template=require('./public/card-template');
const CardModel=require('./public/card-model');
module.exports=function(app){
 if(fs.existsSync(path.join(__dirname,'.env')))require('dotenv').config({path:path.join(__dirname,'.env')});
 app.post('/editor/render',async(req,res)=>{let browser;try{
  const raw=req.body.card;
  if(!raw||typeof raw!=='object'||['keyword','headline','body','answer','detail','farewell','service_message'].some(k=>raw[k]!==undefined&&(typeof raw[k]!=='string'||raw[k].length>5000)))return res.status(400).json({error:'카드 텍스트를 확인해주세요.'});
  const c=CardModel.normalize(raw),service=CardModel.isService(c);
  if(service&&!c.service_message.trim())return res.status(400).json({error:'서비스 안내 문구를 입력해주세요.'});
  if(!service&&!c.headline.trim())return res.status(400).json({error:'제목을 입력해주세요.'});
  if(c.image?.url&&!template.validImage(c.image.url))return res.status(400).json({error:'지원하지 않는 사진 주소입니다.'});
  // 비교형은 두 항목, 목록·단계형은 2~4개 항목으로 출력합니다.
  const layoutError=CardModel.layoutError(c);
  if(layoutError)return res.status(400).json({error:layoutError});
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.protocol==='https:'&&u.hostname==='images.unsplash.com'?route.continue():route.abort()});
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+'</style>'+template.markup(c)+'</html>',{waitUntil:'load',timeout:20000});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
  // 화면과 JPG에서 같은 글 맞춤 함수를 실행합니다.
  const fit=await page.evaluate(template.fitCard);
  if(!fit.measured||fit.overflow)return res.status(400).json({error:'텍스트가 카드 영역을 넘습니다. 문장을 줄이거나 카드를 나눠주세요.'});
  if(fit.overlap)return res.status(400).json({error:'텍스트 박스가 겹칩니다. 위치를 조정하거나 텍스트 위치를 초기화해주세요.'});
  const dir=path.join(__dirname,'output');fs.mkdirSync(dir,{recursive:true});const name='editor_'+randomUUID()+'.jpg';await page.screenshot({path:path.join(dir,name),type:'jpeg',quality:95});res.json({success:true,file_name:name,image_url:'/output/'+name});
 }catch(e){res.status(500).json({error:'카드 출력 실패: '+e.message})}finally{if(browser)await browser.close()}});
};
