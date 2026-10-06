const { generateInstagram } = require("./instagram-generator");
const { generateTextPlatform } = require("./text-generator");

module.exports = function registerGenerateRoutes(app) {
  app.post("/api/generate/:platform", async (req, res) => {
    const platform = req.params.platform;

    if (!["instagram", "threads", "blog"].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: "지원하지 않는 플랫폼입니다.",
      });
    }

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

    const normalizedInput = {
      article: {
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
      const draft =
        platform === "instagram"
          ? await generateInstagram(normalizedInput)
          : await generateTextPlatform(platform, normalizedInput);

      res.json({
        success: true,
        draft,
      });
    } catch (error) {
      console.error(`${platform} 생성 실패:`, {
        name: error.name,
        status: error.status,
        code: error.code,
      });

      const status = Number(error.status);

      const message =
        status === 401
          ? "OpenAI API 키를 확인해주세요."
          : status === 429
          ? "API 사용 한도 또는 요청 제한을 확인해주세요."
          : status === 403 || status === 404
          ? "모델 이름과 해당 모델 사용 권한을 확인해주세요."
          : status === 400
          ? "OpenAI 요청 설정 오류입니다. 터미널의 오류 코드를 확인해주세요."
          : error.status
          ? "OpenAI 요청에 실패했습니다. 잠시 후 다시 시도해주세요."
          : error.message;

      res.status(502).json({
        success: false,
        error: message,
      });
    }
  });
};