// 이 파일의 역할: 초안 저장·조회와 기존 JPG 결과의 내 문서 보관.
// 서버 주소와 내 문서 위치는 public/api.js의 공통 설정을 사용합니다.
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { PATHS, STORAGE_FOLDERS, getStorageRoot } = require('./public/api');

module.exports = function registerLocalStorage(app, options = {}) {
  // 개발 환경에서 명시적으로 켠 경우에만 평문 파일 저장과 JPG 보관을 연결합니다.
  if (process.env.PLATFORM_LOCAL_STORAGE !== '1') {
    app.use([PATHS.storageInfo, PATHS.drafts, PATHS.images], (_req, res) => {
      res.status(410).json({
        success: false,
        error: '로컬 파일 저장이 비활성화되어 있습니다. 초안은 후속 마일스톤에서 App Core의 암호화 저장소에 저장될 예정입니다.',
      });
    });
    return;
  }

  const root = options.rootDir || getStorageRoot();
  const draftsDir = path.join(root, STORAGE_FOLDERS.drafts);
  const imagesDir = path.join(root, STORAGE_FOLDERS.images);
  const renderDir = options.renderDir || path.join(__dirname, STORAGE_FOLDERS.renderOutput);
  const validId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

  // 임시 파일을 다 쓴 뒤 이름을 바꿔, 쓰는 도중의 JSON을 읽지 않도록 합니다.
  async function writeJson(file, data) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), { flag: 'wx' });
      await fs.rename(temporary, file);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  }

  // 화면에 실제 저장 위치를 안내할 때 사용합니다.
  app.get(PATHS.storageInfo, (_req, res) => {
    res.json({ success: true, root, drafts_path: draftsDir, images_path: imagesDir });
  });

  // 카드·플랫폼 원고·사진 편집 정보는 서로 연결된 전체 상태로 저장합니다.
  // 인용문과 기존 Core 정보는 보존하며 Claim/Evidence ID를 새로 만들지 않습니다.
  app.post(PATHS.drafts, async (req, res) => {
    try {
      const draft = req.body?.draft;
      if (!draft || typeof draft !== 'object' || Array.isArray(draft) ||
          !Array.isArray(draft.cards) || draft.cards.length < 1 || draft.cards.length > 10) {
        return res.status(400).json({ success: false, error: '카드 1~10장이 포함된 초안을 전달해주세요.' });
      }
      const id = randomUUID(); // 저장 파일 식별자이며 근거 ID가 아닙니다.
      const savedAt = new Date().toISOString();
      const metadata = {
        id, saved_at: savedAt,
        title: String(draft.source_input?.article?.title || draft.card_news?.core_text?.headline ||
          draft.cards[0]?.headline || draft.cards[0]?.content?.headline || '뉴스 초안').slice(0, 500),
        evidence_policy: { source_quotes_preserved: true, core_ids_generated: false },
      };
      await fs.mkdir(draftsDir, { recursive: true });
      const file = path.join(draftsDir, id + '.json');
      await writeJson(file, draft);
      await writeJson(path.join(draftsDir, id + '.meta.json'), metadata);
      res.status(201).json({ success: true, ...metadata, file_path: file });
    } catch (error) {
      console.error('초안 저장 실패:', error.code || error.name);
      res.status(500).json({ success: false, error: '내 문서에 저장하지 못했습니다. 폴더 접근 권한과 디스크 용량을 확인해주세요.' });
    }
  });

  // 큰 사진 원본을 읽지 않고 작은 메타데이터만으로 저장 목록을 구성합니다.
  app.get(PATHS.drafts, async (_req, res) => {
    try {
      await fs.mkdir(draftsDir, { recursive: true });
      const entries = await fs.readdir(draftsDir);
      const records = [];
      for (const name of entries.filter(name => name.endsWith('.meta.json'))) {
        const id = name.slice(0, -10);
        if (!validId(id)) continue;
        try {
          const record = JSON.parse(await fs.readFile(path.join(draftsDir, name), 'utf8'));
          await fs.access(path.join(draftsDir, id + '.json'));
          records.push({ id, title: record.title, saved_at: record.saved_at });
        } catch { /* 손상되거나 아직 완성되지 않은 파일은 목록에서 제외합니다. */ }
      }
      records.sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));
      res.json({ success: true, drafts: records });
    } catch {
      res.status(500).json({ success: false, error: '저장된 초안 목록을 읽지 못했습니다.' });
    }
  });

  // 사용자 입력을 파일 경로로 쓰지 않고 서버가 발급한 저장 ID만 받습니다.
  app.get(PATHS.drafts + '/:id', async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, error: '저장된 초안 ID를 확인해주세요.' });
    }
    try {
      const draft = JSON.parse(await fs.readFile(path.join(draftsDir, req.params.id + '.json'), 'utf8'));
      res.json({ success: true, draft });
    } catch (error) {
      res.status(error.code === 'ENOENT' ? 404 : 500).json({ success: false, error: '저장된 초안을 불러오지 못했습니다.' });
    }
  });

  // 내 문서 전체를 공개하지 않고 생성된 이미지 폴더만 미리보기에 제공합니다.
  app.use(PATHS.images, express.static(imagesDir, { index: false, dotfiles: 'deny' }));

  // 기존 Playwright 렌더링은 유지합니다. 성공한 JPG를 보관한 뒤 응답합니다.
  // 별도 비동기 Job 계약 대신 현재의 POST 요청→완료 응답 방식을 유지합니다.
  app.use((req, res, next) => {
    if (req.method !== 'POST' || ![PATHS.render, PATHS.legacyRender].includes(req.path)) return next();
    const sendJson = res.json.bind(res);
    res.json = function (result) {
      if (!result?.success || typeof result.file_name !== 'string') return sendJson(result);
      const name = result.file_name;
      if (path.basename(name) !== name || !/^[A-Za-z0-9_-]+\.jpg$/.test(name)) {
        return sendJsonWithError();
      }
      (async () => {
        await fs.mkdir(imagesDir, { recursive: true });
        const target = path.join(imagesDir, name);
        await fs.copyFile(path.join(renderDir, name), target);
        sendJson({ ...result, saved_path: target, image_url: PATHS.images + '/' + encodeURIComponent(name) });
      })().catch(sendJsonWithError);
      return res;
    };
    function sendJsonWithError() {
      res.status(500);
      return sendJson({ success: false, error: 'JPG를 내 문서에 보관하지 못했습니다. 폴더 권한과 디스크 용량을 확인해주세요.' });
    }
    next();
  });
};
