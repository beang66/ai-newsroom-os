// 네트워크·설치된 Express·실제 Documents 없이 라우트와 브라우저 오류 처리를 확인합니다.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { PATHS } = require('./public/api');

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'platform-storage-'));
  const originalFlag = process.env.PLATFORM_LOCAL_STORAGE;
  try {
    const routes = [];
    const uses = [];
    const renames = [];
    const app = {
      get: (url, handler) => routes.push({ method: 'GET', url, handler }),
      post: (url, handler) => routes.push({ method: 'POST', url, handler }),
      use: (...args) => uses.push(args),
    };
    const module = { exports: {} };
    vm.runInNewContext(await fs.readFile(path.join(__dirname, 'local-storage-routes.js'), 'utf8'), {
      module, __dirname, process, console,
      require(name) {
        if (name === 'express') return { static: root => ({ staticRoot: root }) };
        if (name === 'fs/promises') return {
          ...fs,
          async rename(from, to) { renames.push([from, to]); await fs.rename(from, to); },
        };
        if (name === './public/api') return {
          ...require('./public/api'),
          getStorageRoot() { throw new Error('실제 Documents 경로를 조회하면 안 됩니다.'); },
        };
        return require(name);
      },
    });
    function response() {
      return { statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
    }
    async function call(method, url, req = {}) {
      const route = routes.find(route => route.method === method && route.url === url);
      assert.ok(route, `${method} ${url}`);
      const res = response();
      await route.handler(req, res);
      return res;
    }

    let disabledMessage;
    for (const flag of [undefined, '0', 'true']) {
      if (flag === undefined) delete process.env.PLATFORM_LOCAL_STORAGE;
      else process.env.PLATFORM_LOCAL_STORAGE = flag;
      uses.length = 0;
      module.exports(app); // 꺼져 있으면 rootDir 없이도 Documents를 조회하지 않습니다.
      assert.equal(routes.length, 0);
      assert.equal(uses.length, 1); // static과 render 후처리가 연결되지 않습니다.
      const [mounts, handler] = uses[0];
      for (const [method, url] of [
        ['GET', PATHS.storageInfo], ['POST', PATHS.drafts], ['GET', PATHS.drafts],
        ['GET', PATHS.drafts + '/any-id'], ['GET', PATHS.images],
        ['GET', PATHS.images + '/old.jpg'], ['DELETE', PATHS.drafts + '/any-id'],
      ]) {
        assert.ok(mounts.some(mount => url === mount || url.startsWith(mount + '/')));
        const res = response();
        await handler({ method, path: url }, res);
        assert.equal(res.statusCode, 410);
        assert.equal(res.body.success, false);
        assert.match(res.body.error, /로컬 파일 저장.*비활성화.*App Core.*암호화/);
        disabledMessage = res.body.error;
      }
      assert.equal((await fs.readdir(temporary)).length, 0);
    }

    process.env.PLATFORM_LOCAL_STORAGE = '1';
    uses.length = 0;
    const rootDir = path.join(temporary, 'storage');
    module.exports(app, { rootDir, renderDir: temporary });
    const draft = { cards: [{ headline: '테스트 제목', body: '테스트 원고' }] };
    const saved = await call('POST', PATHS.drafts, { body: { draft } });
    assert.equal(saved.statusCode, 201);
    assert.equal(saved.body.success, true);
    const listed = await call('GET', PATHS.drafts);
    assert.equal(listed.body.drafts.length, 1);
    assert.equal(listed.body.drafts[0].id, saved.body.id);
    assert.equal(listed.body.drafts[0].title, draft.cards[0].headline);
    const loaded = await call('GET', PATHS.drafts + '/:id', { params: { id: saved.body.id } });
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.body.draft)), draft);
    assert.equal(renames.length, 2); // 초안과 메타데이터 모두 임시 파일을 rename합니다.
    assert.ok(renames.every(([from, to]) => from.startsWith(to + '.') && from.endsWith('.tmp')));
    assert.equal((await fs.readdir(path.join(rootDir, 'drafts'))).some(name => name.endsWith('.tmp')), false);
    assert.equal((await call('GET', PATHS.storageInfo)).body.root, rootDir);
    assert.equal(uses[0][1].staticRoot, path.join(rootDir, 'images'));
    await fs.writeFile(path.join(temporary, 'card.jpg'), 'test image');
    const rendered = await new Promise((resolve, reject) => {
      const res = response();
      res.json = resolve;
      uses[1][0]({ method: 'POST', path: PATHS.render }, res, () => {
        try { res.json({ success: true, file_name: 'card.jpg' }); } catch (error) { reject(error); }
      });
    });
    assert.equal(rendered.success, true);
    assert.equal(await fs.readFile(rendered.saved_path, 'utf8'), 'test image');

    // 실제 브라우저 API와 저장/불러오기 이벤트를 실행해 410 안내와 버튼 복구를 확인합니다.
    const buttons = { save: {}, 'include-card-news': { checked: true } };
    const messages = [];
    const browser = {
      window: {}, state: draft, revision: 0, structuredClone,
      $: id => buttons[id], localLoadButton: {}, tell: message => messages.push(message),
      fetch: async () => ({ ok: false, status: 410, json: async () => ({ success: false, error: disabledMessage }) }),
    };
    vm.createContext(browser);
    vm.runInContext(await fs.readFile(path.join(__dirname, 'public/api.js'), 'utf8'), browser);
    browser.NewsApi = browser.window.NewsApi;
    for (const method of ['saveLocalDraft', 'listLocalDrafts', 'loadLocalDraft', 'getLocalStorageInfo']) {
      await assert.rejects(() => browser.NewsApi[method](draft), error => error.status === 410 && error.message === disabledMessage);
    }
    const html = await fs.readFile(path.join(__dirname, 'public/index.html'), 'utf8');
    for (const [start, end, button] of [
      ["$('save').onclick =", '// 12.', buttons.save],
      ['localLoadButton.onclick =', '// JPG 생성:', browser.localLoadButton],
    ]) {
      const offset = html.indexOf(start);
      assert.ok(offset >= 0);
      const finish = html.indexOf(end, offset);
      assert.ok(finish > offset);
      vm.runInContext(html.slice(offset, finish), browser);
      await button.onclick();
      assert.equal(messages.at(-1), disabledMessage);
      assert.equal(button.disabled, false);
    }
    console.log('PASS local storage: default 410, opt-in save/list/load and atomic writes, image archival, browser 410 recovery');
  } finally {
    if (originalFlag === undefined) delete process.env.PLATFORM_LOCAL_STORAGE;
    else process.env.PLATFORM_LOCAL_STORAGE = originalFlag;
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('platform-storage-'));
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
