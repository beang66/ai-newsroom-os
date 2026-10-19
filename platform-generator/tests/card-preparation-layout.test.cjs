const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {buildHtml,renderCardJpeg}=require('../card-renderer');
const template=require('../lib/card-template');
// 실패 화면에서 확인한 생성 문안. 기사 원문·계정·근거 자료는 포함하지 않는다.
const card={card_id:'C3',role:'body',page:3,total_pages:4,content_version:2,
 content:{keyword:'국내 AI 반도체 개발 현황',headline:'국내 기업과 연구진의 AI 반도체 개발 및 전문가 조언',
 answer:'국내 주요 기업과 연구진은 초거대 AI 모델을 지원하는 고성능 AI 반도체를 자체 개발하고 있다.',
 detail:'이들은 데이터 병목 현상을 해결하고 전력 소비를 최대 70% 줄이는 성과를 냈다.\n전문가들은 단순한 칩 제조를 넘어 인공지능 알고리즘과 최적화 소프트웨어가 반도체 경쟁의 결정적 요소라고 조언한다.\n정부 차원의 집중 지원과 실증 사업 확대가 시급한 상황이다.',farewell:''},
 design:{layout:'list',highlights:[],compact:false},text_positions:{headline:{x:0,y:0},answer:{x:0,y:0},detail:{x:0,y:0}}};

test('실패한 3번 카드: 목록 끝 장식만 제거해 글·크기·위치 보존, 미리보기와 실제 JPG 측정 일치',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1080,height:1350}}),original=structuredClone(card);
  const measure=async html=>{await page.setContent(html);await page.evaluate(async()=>document.fonts.ready);const fit=await page.evaluate(template.fitCard);return {...fit,fields:await page.locator('[data-field]').evaluateAll(elements=>elements.map(el=>({field:el.dataset.field,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,font:getComputedStyle(el).fontSize,text:el.textContent})))};};
  const html=buildHtml(card);
  const before=await measure(html.replace(/\.news-card\.layout-list \.card-line:last-child,\.news-card\.layout-steps \.card-line:last-child\{padding-bottom:0;border-bottom:0\}/,''));
  const after=await measure(html);
  assert.equal(before.overflow,true);assert.equal(after.overflow,false);assert.equal(after.overlap,false);
  assert(before.overflowFields.includes('detail'));
  assert.equal(before.fields.find(f=>f.field==='detail').bottom-after.fields.find(f=>f.field==='detail').bottom,23);
  assert.deepEqual(before.fields.map(({field,font,text})=>({field,font,text})),after.fields.map(({field,font,text})=>({field,font,text})));
  const preview=await measure('<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+'</style>'+template.markup(require('../lib/card-model').normalize(card))+'</html>');
  assert.deepEqual(preview,after);
  const adaptive=structuredClone(card);
  adaptive.auto_fit=true;
  adaptive.content.detail+=' 추가 조건은 다음 발표에서 확인할 예정이다.';
  const unfit=await measure(buildHtml({...adaptive,auto_fit:false}));
  const fitted=await measure(buildHtml(adaptive));
  assert.equal(unfit.overflow,true,'늘어난 설명은 기존 고정 배치에서 넘쳐야 한다');
  assert.equal(fitted.overflow,false,'새 생성본의 글을 자동 배치해야 한다');
  assert.equal(fitted.overlap,false);
  assert(fitted.spaceScale<1||fitted.scale<1||fitted.layout==='standard');
  assert.equal(fitted.fields.find(field=>field.field==='detail').text,adaptive.content.detail.replace(/\n/g,''));
  const adaptivePreview=await measure('<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+'</style>'+template.markup(require('../lib/card-model').normalize(adaptive))+'</html>');
  assert.deepEqual(adaptivePreview,fitted);
  const adaptedJpg=await renderCardJpeg(adaptive);
  assert.equal(adaptedJpg[0],255);
  const start=performance.now(),jpg=await renderCardJpeg(card);
  assert.equal(jpg[0],255);assert.equal(jpg[1],216);assert.deepEqual(card,original);
  console.log(JSON.stringify({card:3,before:{contentHeight:before.contentHeight,limit:before.availableHeight,detailBottom:before.fields.find(f=>f.field==='detail').bottom},after:{contentHeight:after.contentHeight,limit:after.availableHeight,detailBottom:after.fields.find(f=>f.field==='detail').bottom},jpgBytes:jpg.length,render_ms:Math.round(performance.now()-start)}));
  const photo={...card,image:{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4FEAAAAASUVORK5CYII=',photographer:'합성 시험'}};
  const withPhoto=await renderCardJpeg(photo);assert.equal(withPhoto[0],255);
  const long=structuredClone(card);long.content.detail=Array(3).fill('필수 조건을 설명하는 합성 문장입니다. '.repeat(40)).join('\n');
  await assert.rejects(renderCardJpeg(long),/상세 설명.*본문 높이/s);
  long.auto_fit=true;
  await assert.rejects(renderCardJpeg(long),/상세 설명.*본문 높이/s);
  const moved={...card,text_positions:{detail:{x:0,y:-300}}};
  await assert.rejects(renderCardJpeg(moved),/겹/);
 }finally{await browser.close();}
});
