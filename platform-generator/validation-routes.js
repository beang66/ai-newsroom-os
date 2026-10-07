const { validateDraft } = require("./draft-validator");

module.exports = function registerValidationRoutes(app) {
  app.post("/api/validate", async (req, res) => {
    const input = req.body;

    if (!["card_news", "instagram", "threads", "blog"].includes(input?.platform)) {
      return res.status(400).json({
        success: false,
        error: "검수할 플랫폼을 확인해주세요.",
      });
    }

    if (
      typeof input.article?.title !== "string" ||
      typeof input.article?.content !== "string" ||
      !input.article.title.trim() ||
      !input.article.content.trim() ||
      input.article.title.length > 500 ||
      input.article.content.length > 30000
    ) {
      return res.status(400).json({
        success: false,
        error: "검수 기준이 되는 기사 제목과 원문을 확인해주세요.",
      });
    }

    if (
      !Array.isArray(input.selected_keywords) ||
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
        error: "선택 키워드 형식을 확인해주세요.",
      });
    }

    if (
      typeof input.requirements !== "string" ||
      input.requirements.length > 3000
    ) {
      return res.status(400).json({
        success: false,
        error: "요구사항은 3,000자 이내의 문자열이어야 합니다.",
      });
    }

    if (
      !input.draft ||
      typeof input.draft !== "object" ||
      Array.isArray(input.draft) ||
      JSON.stringify(input.draft).length > 100000
    ) {
      return res.status(400).json({
        success: false,
        error: "검수할 원고 형식 또는 크기를 확인해주세요.",
      });
    }

    try {
      const validation = await validateDraft(input);

      res.json({
        success: true,
        validation,
      });
    } catch (error) {
      console.error("검수 실패:", {
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
          ? "모델 이름과 사용 권한을 확인해주세요."
          : error.status
          ? "OpenAI 검수 요청에 실패했습니다."
          : error.message;

      res.status(502).json({
        success: false,
        error: message,
      });
    }
  });
};