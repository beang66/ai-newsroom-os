const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '../..');

test('generated cards and malformed cards render without blanking the card editor', async () => {
  const {createServer} = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')));
  const React = require(path.join(root, 'node_modules/react'));
  const {renderToString} = require(path.join(root, 'node_modules/react-dom/server'));
  const vite = await createServer({root, server:{middlewareMode:true}, appType:'custom'});
  try {
    const {default:Editor} = await vite.ssrLoadModule('/src/components/PlatformCardEditor.jsx');
    const article = {articleId:'fixture', title:'합성 기사', content:'합성 기사 원문입니다.', photos:[]};
    const card = {card_id:'C1', page:1, role:'cover', content_version:2,
      content:{keyword:'주제',headline:'합성 카드',answer:'답변',detail:'설명'},
      source_evidence:['합성 기사 원문입니다.'], design:{layout:'standard'}};
    const draft = {article_id:'fixture', cards:[card]};
    const render = value => renderToString(React.createElement(Editor,{draft:value,article,onChange:()=>{},onAddPhoto:()=>{}}));
    const before = structuredClone(draft);
    const good = render(draft);
    assert.match(good, /합성 카드/);
    assert.match(good, /카드 미리보기/);
    assert.deepEqual(draft,before,'rendering must not discard card evidence or content');
    const invalid = render({...draft,cards:[null,card]});
    assert.match(invalid,/1(?:<!-- -->)?번 카드 데이터 형식을 확인할 수 없습니다/);
    assert.match(invalid,/2(?:<!-- -->)?번 카드/);
    assert.match(render({...draft,cards:{bad:true}}),/카드 목록 데이터 형식을 확인할 수 없습니다/);
  } finally {
    await vite.close();
  }
});
