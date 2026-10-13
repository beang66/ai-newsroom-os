// 플랫폼 입력 경계: Core의 본문 텍스트를 그대로 전달한다. 부제·사진·캡션을 추측하지 않는다.
function coreArticle(article = {}) {
  return { article_id: article.article_id, title: article.title, content: article.content };
}
// 출처 주소는 생성 원문 밖의 메타데이터이며 수집하거나 AI에 전달하지 않는다.
function generationPayload(payload = {}) {
  const source = payload.article || {};
  return { ...payload, article: coreArticle(source), source_url: source.url ?? payload.source_url ?? "" };
}
module.exports = { coreArticle, generationPayload };
