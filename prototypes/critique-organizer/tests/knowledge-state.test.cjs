// Real controllers in a minimal DOM. Does not claim browser/rendering coverage.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
class Element {
  constructor(){this.value='';this.textContent='';this.children=[];this.events={};this.dataset={};this.attributes={};this.hiddenClasses=new Set();this.classList={add:c=>this.hiddenClasses.add(c),remove:c=>this.hiddenClasses.delete(c),toggle:(c,yes)=>yes?this.hiddenClasses.add(c):this.hiddenClasses.delete(c)};}
  addEventListener(name,fn){this.events[name]=fn;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.textContent='';}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];}
  getBoundingClientRect(){return {width:0,height:0};}
  close(){} focus(){} scrollIntoView(){} setSelectionRange(){}
  click(){return this.onclick?.();}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const pending={},requests=[];
  const catalog={documents:[],projects:[],types:{unclassified:'미분류'},failures:[],total:0,matched:0,corpus_revision:0};
  const response=value=>({ok:true,json:async()=>value});
  const context={document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>new Element(),createTextNode:text=>({textContent:text})},window:{addEventListener(){}},
    fetch:async url=>{requests.push(url);if(url.startsWith('/api/organized/'))return new Promise(resolve=>{pending[url]=doc=>resolve(response({document:doc}));});if(url.startsWith('/api/catalog?'))return response(catalog);if(url.startsWith('/api/explore?'))return response({nodes:[],edges:[],total_nodes:0,matched_nodes:0,displayed_nodes:0,hidden_nodes:0});if(url==='/api/documents')return response({documents:[],corpus_revision:0});if(url==='/api/health')return response({corpus_revision:0,openai_configured:false});throw Error(url);},
    crypto:{randomUUID},sessionStorage:{getItem(){return null},setItem(){}},AbortController,URLSearchParams,URL,setTimeout,clearTimeout,console,devicePixelRatio:1,alert(){},confirm(){return true}};
  vm.createContext(context);
  for(const file of ['app.js','knowledge.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),context);
  await tick();return {get,context,catalog,pending,requests};
}
function doc(id){return {id,title:id,path:id,blocks:[],parse_info:{warnings:[]},project_suggestions:[],organization:{type:'unclassified',type_origin:'rule_suggestion',tags:[],summary:[],mentions:[],project_ids:[],document_date:null,revision:1}};}
test('organizer mounts list first without requesting graph',async()=>{const s=await setup();assert.match(s.get('libraryStatus').textContent,/제한된 규칙/);assert.equal(s.requests.some(r=>r.startsWith('/api/explore')),false);});
test('list and graph preserve the same search filter',async()=>{const s=await setup();s.get('libraryQuery').value='버스';await s.get('applyFilters').onclick();await s.get('graphView').onclick();assert.ok(s.requests.some(r=>r.startsWith('/api/explore?')&&new URLSearchParams(r.split('?')[1]).get('q')==='버스'));await s.get('listView').onclick();assert.equal(s.get('libraryQuery').value,'버스');});
test('stable 3D coordinates do not change with array order',async()=>{const s=await setup(),coords=s.context.window.NewsroomKnowledge.coordinates;const a=coords('document:a');coords('document:b');assert.deepEqual(coords('document:a'),a);assert.ok(a.every(Number.isFinite));assert.ok(Math.abs(a.reduce((n,v)=>n+v*v,0)-1)<1e-10);});
test('late document details cannot overwrite a newer selection',async()=>{
  const s=await setup();s.catalog.documents=['a','b'].map(id=>({...doc(id),created_at:'2026-09-27',processing_status:'ready'}));s.catalog.total=s.catalog.matched=2;await s.context.window.NewsroomKnowledge.refresh();
  const cards=s.get('documents').children,a=cards[0].children[0].onclick(),b=cards[1].children[0].onclick();
  s.pending['/api/organized/b'](doc('b'));await b;s.pending['/api/organized/a'](doc('a'));await a;
  assert.equal(s.get('libraryDetail').children[0].textContent,'b');
});
