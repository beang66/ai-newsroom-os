// 기사 입력 검증과 생성 경로 등록
// card_news는 독립 카드뉴스이며 플랫폼 선택 없이 요청할 수 있습니다.
const { generateCardNews } = require("./card-news-generator");

// 기존 모듈 호환용: 일괄 생성과 플랫폼 검수 분리 후 정리합니다.
const { generateInstagram } = require("./instagram-generator");
const { generateTextPlatform } = require("./text-generator");

module.exports = function registerGenerateRoutes(app) {
  app.post("/api/generate/:platform", async (req, res) => {
    const platform = req.params.platform;

    if (!["card_news", "instagram", "threads", "blog"].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: "지원하지 않는 플랫폼입니다.",
      });
    }

    // 1. 필수 기사·키워드·요구사항 검증
    const input = req.body;
    const article = input?.article;

    if (
      typeof article?.title !== "string" ||
      typeof article?.content !== "string" ||
      !article.title.trim() ||
      !article.content.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "기사 제목과 원문을 모두 입력해주세요.",
      });
    }

    if (article.title.length > 500 || article.content.length > 30000) {
      return res.status(400).json({
        success: false,
        error: "제목은 500자, 원문은 30,000자 이내로 입력해주세요.",
      });
    }

    if (
      !Array.isArray(input.selected_keywords) ||
      input.selected_keywords.length === 0 ||
      input.selected_keywords.length > 20 ||
      input.selected_keywords.some(
        (keyword) =>
          typeof keyword !== "string" ||
          !keyword.trim() ||
          keyword.length > 100
      )
    ) {
      return res.status(400).json({
        success: false,
        error: "키워드는 1~20개, 각각 100자 이내로 입력해주세요.",
      });
    }

    if (
      input.requirements !== undefined &&
      (typeof input.requirements !== "string" ||
        input.requirements.length > 3000)
    ) {
      return res.status(400).json({
        success: false,
        error: "요구사항은 3,000자 이내의 문장으로 입력해주세요.",
      });
    }

    // 2. 공통 입력 정규화 (URL 자동 수집 기능은 포함하지 않습니다.)
    // 원문 URL은 출처 정보로만 전달하며 AI가 주소를 생성하지 않습니다.
    let sourceUrl = "";
    if (article.url !== undefined && article.url !== "") {
      try {
        if (typeof article.url !== "string" || article.url.length > 2048) throw new Error();
        const url = new URL(article.url.trim());
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
        sourceUrl = url.href;
      } catch {
        return res.status(400).json({ success: false, error: "올바른 기사 URL을 입력해주세요." });
      }
    }
    const normalizedInput = {
      article: {
        url: sourceUrl,
        article_id:
          typeof article.article_id === "string" &&
          article.article_id.trim()
            ? article.article_id.trim()
            : "article_01",

        title: article.title.trim(),
        content: article.content.trim(),
      },

      selected_keywords: [
        ...new Set(input.selected_keywords.map((value) => value.trim())),
      ],

      requirements: (input.requirements || "").trim(),
    };

    try {
      // 3. 요청 유형별 독립 생성 함수 실행
      const draft =
        platform === "card_news"
          ? await generateCardNews(normalizedInput)
          : platform === "instagram"
          ? await generateInstagram(normalizedInput)
          : await generateTextPlatform(platform, normalizedInput);

      res.json({
        success: true,
        draft,
      });
    } catch (error) {
      // 4. API 오류를 사용자 안내 문구로 변환
      console.error(`${platform} 생성 실패:`, {
        name: error.name,
        status: error.status,
        code: error.code,
      });

      const status = Number(error.status);

      const message = error.provider === "gemini" ? error.message :
        status === 401
          ? "AI API 키를 확인해주세요."
          : status === 429
          ? "API 사용 한도 또는 요청 제한을 확인해주세요."
          : status === 403 || status === 404
          ? "모델 이름과 해당 모델 사용 권한을 확인해주세요."
          : status === 400
          ? "AI 요청 설정 오류입니다. 터미널의 오류 코드를 확인해주세요."
          : error.status
          ? "AI 요청에 실패했습니다. 잠시 후 다시 시도해주세요."
          : error.message;

      res.status(502).json({
        success: false,
        error: message,
      });
    }
  });
};