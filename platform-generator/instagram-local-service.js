// Instagram 공식 화면을 조작하는 로컬 서비스입니다.
// 비밀번호는 받지 않습니다. 사용자가 전용 브라우저에서 직접 로그인합니다.
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const crypto = require('crypto');
const {SNS_ENDPOINTS}=require('./public/api');

function validateInput(input) {
  if (typeof input?.text !== 'string' || !input.text.trim() || [...input.text].length > 2200) {
    throw new Error('캡션은 비어 있지 않은 2,200자 이내의 글이어야 합니다.');
  }
  if (!Array.isArray(input.assets) || input.assets.length < 1 || input.assets.length > 10) {
    throw new Error('카드 이미지 1~10장이 필요합니다.');
  }
  let total = 0;
  const files = input.assets.map((asset, index) => {
    if (asset?.mime !== 'image/jpeg' || asset.order !== index + 1 ||
        typeof asset.data_url !== 'string' || asset.data_url.length > 7 * 1024 * 1024) {
      throw new Error('JPG 이미지 형식과 순서를 확인해주세요.');
    }
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(asset.data_url);
    if (!match) throw new Error('이미지 내용을 읽지 못했습니다.');
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.toString('base64') !== match[1] || buffer.length < 4 ||
        buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff ||
        buffer.length > 5 * 1024 * 1024) throw new Error('JPG 파일 내용 또는 용량이 올바르지 않습니다.');
    total += buffer.length;
    return { name: `card_${String(index + 1).padStart(2, '0')}.jpg`, mimeType: 'image/jpeg', buffer };
  });
  if (total > 20 * 1024 * 1024) throw new Error('카드 이미지 전체 용량은 20MB 이내여야 합니다.');
  return { text: input.text.replace(/\r\n?/g, '\n'), files };
}

// 기본 정사각형 자르기를 피하고 카드 JPG의 원본 4:5 비율을 선택합니다.
// 이름이 확인되는 항목만 누릅니다. 찾지 못하면 다음 단계로 진행하지 않습니다.
async function selectOriginalRatio(scope, click) {
  // 업로드 직후에는 자르기 화면이 아직 그려지는 중일 수 있습니다.
  if (typeof scope.locator==='function') {
    const controls=scope.locator('svg[aria-label="자르기 선택"],svg[aria-label="Select crop"],button[aria-label="자르기 선택"],button[aria-label="Select crop"]');
    try {await controls.first().waitFor({state:'visible',timeout:8000});} catch {}
  }
  if (!await click(scope, ['자르기 선택', 'Select crop', '비율 선택', 'Aspect ratio', '자르기', 'Crop'])) {
    throw new Error('사진 비율 메뉴를 찾지 못했습니다. 전용 Instagram 창의 자르기 화면을 확인해주세요. 다음 단계로 진행하지 않았습니다.');
  }
  if (await click(scope, ['원본', 'Original', '4:5'])) return;
  // Instagram 비율 메뉴의 항목은 button 대신 일반 텍스트로 표시되기도 합니다.
  for (const label of ['원본', 'Original', '4:5']) {
    const choice=scope.getByText(label,{exact:true});
    try { await choice.waitFor({state:'visible',timeout:1500}); } catch {continue;}
    if(await choice.count()===1 && await choice.isVisible()) {await choice.click({timeout:5000});return;}
  }
  throw new Error('원본/4:5 항목을 찾지 못해 전송을 중단했습니다. 작성창을 닫고 다시 시도해주세요.');
}

function createInstagramService({ chromium, profileDir, clock = Date.now } = {}) {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  profileDir ||= path.join(base, 'AI-Newsroom', 'instagram-browser');
  let context, page, busy = false, pending = null;
  const events = [];
  function log(stage) { events.push({ stage, at: new Date(clock()).toISOString() }); if (events.length > 30) events.shift(); }
  async function exclusive(action) {
    if (busy) throw new Error('이전 작업이 진행 중입니다. 끝난 뒤 다시 실행해주세요.');
    busy = true;
    try { return await action(); } finally { busy = false; }
  }
  async function openBrowser() {
    if (!context) {
      await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
      const engine = chromium || require('playwright').chromium;
      const options = { headless: false, viewport: null, acceptDownloads: false };
      // 기본값은 설치된 Chrome입니다. 일반 Chrome 프로필을 공유하지 않습니다.
      if (process.env.NEWSROOM_INSTAGRAM_BROWSER !== 'chromium') options.channel = 'chrome';
      try { context = await engine.launchPersistentContext(profileDir, options); }
      catch { throw new Error('전용 브라우저를 열지 못했습니다. Chrome 설치 여부와 전용 창이 이미 실행 중인지 확인해주세요.'); }
      context.on('close', () => { context = null; page = null; pending = null; });
    }
    if (!page || page.isClosed()) page = await context.newPage();
    await page.bringToFront();
    return page;
  }
  async function account() {
    if (!context || !page || page.isClosed()) return { connected: false, reason: 'browser_closed' };
    const url = new URL(page.url());
    if (url.hostname !== 'www.instagram.com' && url.hostname !== 'instagram.com') {
      return { connected: false, reason: 'instagram_page_required' };
    }
    const login = page.locator('input[name="username"],input[name="password"]');
    if (await login.count() && await login.first().isVisible()) return { connected: false, reason: 'login_required' };
    // 값은 외부로 반환하지 않고, 계정 변경 여부 검사에만 사용합니다.
    const cookies = await context.cookies(SNS_ENDPOINTS.instagram);
    const hasSession = cookies.some(cookie => cookie.name === 'sessionid' && cookie.value);
    const accountId = cookies.find(cookie => cookie.name === 'ds_user_id')?.value;
    if (!hasSession || !accountId) return { connected: false, reason: 'login_required' };
    const username = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')].filter(a =>
        /^(프로필|Profile)$/.test((a.getAttribute('aria-label') || a.innerText || '').trim()) ||
        [...a.querySelectorAll('img')].some(img => /님의 프로필 사진|profile picture/i.test(img.alt || '')));
      const names = [...new Set(links.map(a => {
        const match = /^\/([A-Za-z0-9_.]+)\/$/.exec(new URL(a.href).pathname);
        return match?.[1];
      }).filter(Boolean))];
      return names.length === 1 ? names[0] : null;
    });
    return { connected: true, username, accountId };
  }
  async function dialog() {
    const value = page.getByRole('dialog');
    if (await value.count() !== 1 || !await value.isVisible()) throw new Error('Instagram 작성창이 하나 열려 있어야 합니다.');
    return value;
  }
  async function namedClick(scope, labels) {
    for (const label of labels) {
      for (const role of ['button', 'link', 'menuitem']) {
        const locator = scope.getByRole(role, { name: label, exact: true });
        if (await locator.count() === 1 && await locator.isVisible()) { await locator.click({ timeout: 5000 }); return true; }
      }
    }
    // 일부 메뉴는 접근성 이름을 SVG에 붙입니다. 좌표를 사용하지 않습니다.
    for (const label of labels) {
      const icon = scope.locator(`svg[aria-label="${label}"]`);
      if (await icon.count() === 1 && await icon.isVisible()) { await icon.click({ timeout: 5000 }); return true; }
    }
    return false;
  }
  function caption(scope) {
    return scope.locator('[role="textbox"][contenteditable="true"],textarea[aria-label*="문구"],textarea[aria-label*="caption"]');
  }
  async function readText(field) {
    return field.evaluate(el => (el.tagName === 'TEXTAREA' ? el.value : el.innerText).replace(/\r\n?/g, '\n'));
  }
  async function checkPending(id) {
    if (!pending || pending.id !== id || pending.status !== 'ready') throw new Error('공유할 준비된 원고가 없습니다. 다시 준비해주세요.');
    if (clock() - pending.preparedAt > 15 * 60 * 1000) throw new Error('준비 후 15분이 지났습니다. 원고를 다시 준비해주세요.');
    const current = await account();
    if (!current.connected || current.accountId !== pending.accountId) throw new Error('로그인 계정이 변경됐습니다. 다시 연결해주세요.');
    const scope = await dialog();
    const field = caption(scope);
    if (await field.count() !== 1 || await readText(field) !== pending.text) throw new Error('현재 캡션이 준비한 원고와 다릅니다. 다시 확인해주세요.');
    const share = scope.getByRole('button', {
  name: /^(공유|공유하기|Share|Share post)$/
});
    if (await share.count() !== 1 || !await share.isEnabled()) throw new Error('공유 버튼을 찾지 못했습니다.');
    return share;
  }
  const service = {
    connect: () => exclusive(async () => {
      log('공식 로그인 창 열기');
      const currentPage = await openBrowser();
      if (pending?.status === 'ready') throw new Error('이미 준비한 작성창이 있습니다. 먼저 확인하거나 브라우저를 닫아주세요.');
      await currentPage.goto(SNS_ENDPOINTS.instagram, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return { success: true, message: '열린 Instagram 공식 화면에서 직접 로그인한 뒤 연결 확인을 눌러주세요.' };
    }),
    status: async () => {
      const current = await account();
      return { success: true, connected: current.connected, username: current.username || null,
        reason: current.reason || null, busy, pending: pending ? {
          id: pending.id, status: pending.status, image_count: pending.imageCount,
          username: pending.username, message: pending.message || ''
        } : null, events: [...events] };
    },
    prepare: input => exclusive(async () => {
      const { text, files } = validateInput(input);
      const current = await account();
      if (!current.connected) throw new Error('먼저 계정 연결에서 로그인하고 연결 확인을 눌러주세요.');
      if (pending && ['ready','sharing','share_uncertain','share_requested'].includes(pending.status)) {
        throw new Error('이전 작성/공유 결과를 먼저 확인하고 전용 브라우저를 닫았다가 다시 연결해주세요.');
      }
      await page.bringToFront();
      const existingDialog = page.getByRole('dialog');
      let emptyPhotoDialog = false;
      if (await existingDialog.count()) {
        const scope = await dialog();
        const file = scope.locator('input[type="file"]');
        const select = scope.getByRole('button', { name: /^(컴퓨터에서 선택|Select from computer)$/ });
        const fileCount = await file.count();
        const isPhotoPicker = fileCount === 1 || (await select.count() === 1 && await select.isVisible());
        const containsCaption = await caption(scope).count() > 0;
        const containsFiles = fileCount === 1 && await file.evaluate(el => !!el.files?.length);
        if (!isPhotoPicker || containsCaption || containsFiles) {
          throw new Error('빈 사진 선택창만 사용할 수 있습니다. 기존 작성창이나 팝업을 닫고 ＋ → 게시물로 새 사진 선택창을 열어주세요.');
        }
        emptyPhotoDialog = true;
      }
      pending = { id: crypto.randomUUID(), status: 'preparing', text, imageCount: files.length,
        accountId: current.accountId, username: current.username, preparedAt: clock() };
      try {
        if (!emptyPhotoDialog) {
          log('새 게시물 열기');
          const labels = ['만들기', 'Create', '새 게시물', 'New post', 'New Post', '새 게시물 만들기', 'Create new post'];
          if (!await namedClick(page, labels)) {
            throw new Error('만들기 메뉴를 찾지 못했습니다. 전용 Instagram 창의 왼쪽 ＋ → 게시물을 눌러 빈 사진 선택창을 연 뒤 앱의 3번 버튼을 다시 눌러주세요.');
          }
          let opened = false;
          try { await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 1500 }); opened = true; } catch {}
          if (!opened && !await namedClick(page, ['게시물', 'Post'])) {
            throw new Error('게시물 메뉴를 찾지 못했습니다. 직접 ＋ → 게시물을 눌러 사진 선택창을 열어주세요.');
          }
          await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 });
        } else {
          log('사용자가 열어둔 빈 사진 선택창 사용');
        }
        let scope = await dialog();
        log('카드 이미지 선택');
        const inputField = scope.locator('input[type="file"]');
        if (await inputField.count() === 1) await inputField.setInputFiles(files, { timeout: 10000 });
        else {
          const chosen = page.waitForEvent('filechooser', { timeout: 10000 });
          // 실패 시 이벤트 대기를 즉시 정리할 수 있도록 rejection 처리합니다.
          chosen.catch(() => {});
          if (!await namedClick(scope, ['컴퓨터에서 선택', 'Select from computer'])) throw new Error('사진 선택 버튼을 찾지 못했습니다.');
          await (await chosen).setFiles(files);
        }
        log('원본 비율 선택');
        scope=await dialog();
        await selectOriginalRatio(scope,namedClick);
        log('자르기·필터 진행');
        let field;
        for (let step = 0; step < 3; step++) {
          scope = await dialog(); field = caption(scope);
          try { await field.waitFor({ state: 'visible', timeout: 3500 }); break; } catch {}
          if (step === 2 || !await namedClick(scope, ['다음','Next'])) throw new Error('캡션 화면을 찾지 못했습니다. 전용 브라우저 화면을 확인해주세요.');
        }
        if (await field.count() !== 1 || !await field.isVisible()) throw new Error('캡션 입력칸을 찾지 못했습니다.');
        if ((await readText(field)).trim()) throw new Error('캡션에 기존 글이 있습니다. 자동으로 덮어쓰지 않았습니다.');
        log('캡션·줄바꿈 입력');
        await field.focus();
        // 실제 브라우저 키 입력으로 편집기의 줄바꿈 처리를 실행합니다.
        for (const [index, line] of text.split('\n').entries()) {
          if (index) await page.keyboard.press('Shift+Enter');
          if (line) await page.keyboard.insertText(line);
        }
        if (await readText(field) !== text) throw new Error('입력된 캡션·줄바꿈이 원고와 다릅니다.');
        pending.status = 'ready'; pending.preparedAt = clock();
        pending.message = '이미지 선택과 캡션 입력을 완료했습니다. 전용 브라우저에서 계정·사진 장수·순서를 확인해주세요.';
        await checkPending(pending.id);
        log('사용자 확인 대기');
        return { success: true, id: pending.id, image_count: files.length, username: pending.username,
          status: 'ready', message: pending.message };
      } catch (error) {
        pending.status = 'prepare_failed'; pending.message = error.message;
        log('준비 실패'); throw error;
      }
    }),
    publish: input => exclusive(async () => {
      if (input?.reviewed !== true) throw new Error('현재 계정·원고·사진 순서를 확인한 뒤 공유해주세요.');
      const share = await checkPending(input?.id);
      // 클릭 전에 상태를 잠가 이중 공유를 방지합니다.
      pending.status = 'sharing'; log('공유 클릭');
      try {
        await share.click({ timeout: 10000 });
        const success = page.getByText(/^(게시물이 공유되었습니다[.!]?|Your post has been shared[.!]?)$/i);
        let confirmed = false;
        try { await success.first().waitFor({ state: 'visible', timeout: 15000 }); confirmed = true; } catch {}
        pending.status = confirmed ? 'shared' : 'share_requested';
        pending.message = confirmed ? 'Instagram의 공유 완료 알림을 확인했습니다.' : '공유 버튼을 눌렀지만 완료 알림은 확인하지 못했습니다. 실제 게시물을 확인해주세요. 자동 재시도하지 않습니다.';
        log(confirmed ? '공유 완료 알림 확인' : '공유 결과 직접 확인 필요');
        return { success: true, status: pending.status, confirmed, message: pending.message };
      } catch {
        pending.status = 'share_uncertain';
        pending.message = '공유 결과가 불확실합니다. Instagram에서 실제 게시 여부를 확인해주세요. 자동 재시도하지 않습니다.';
        throw new Error(pending.message);
      }
    }),
    close: () => exclusive(async () => { if (context) await context.close(); context = null; page = null; pending = null; return { success: true }; })
  };
  return service;
}

module.exports = { createInstagramService, validateInput, selectOriginalRatio };
