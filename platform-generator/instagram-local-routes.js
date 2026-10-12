// 기존 Express 서버에 추가하는 로컬 전용 경로입니다.
const express = require('express');
const {getEditorOrigins}=require('./lib/api');
const { createInstagramService } = require('./instagram-local-service');

module.exports = function registerInstagramLocalRoutes(app, service = createInstagramService()) {
  const router = express.Router();
  const editorOrigins=getEditorOrigins();
  router.use((req, res, next) => {
    const address = req.socket.remoteAddress;
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
    const host = req.headers.host || '';
    if (!local || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) {
      return res.status(403).json({ success: false, error: '같은 컴퓨터의 로컬앱에서만 사용할 수 있습니다.' });
    }
    const allowedOrigins=[`http://${host}`,...editorOrigins];
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
      return res.status(403).json({ success: false, error: '허용한 로컬앱에서만 요청할 수 있습니다.' });
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      return res.status(415).json({ success: false, error: 'JSON 요청이 필요합니다.' });
    }
    next();
  });
  router.use(express.json({ limit: '30mb' }));
  function route(method, url, action) {
    router[method](url, async (req, res) => {
      try { res.json(await action(req.body)); }
      catch (error) { res.status(422).json({ success: false, error: error.message || 'Instagram 작업에 실패했습니다.' }); }
    });
  }
  route('post', '/connect', () => service.connect());
  route('get', '/status', () => service.status());
  route('post', '/prepare', input => service.prepare(input));
  route('post', '/publish', input => service.publish(input));
  route('post', '/close', () => service.close());
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(400).json({ success: false, error: error.type === 'entity.too.large' ? '이미지 요청 용량이 너무 큽니다.' : '요청 내용을 읽지 못했습니다.' });
  });
  app.use('/api/instagram-local', router);
  return service;
};
