const express = require("express");
const fs = require("fs");
const path = require("path");
const { suggestKeywords } = require("./ai-client");
function createApp({instagramService,threadsService,storageOptions={}}={}) {
const app = express();

// 로컬 게시 경로는 자체 JSON 크기 제한과 출처 검사를 먼저 적용합니다.
require("./instagram-local-routes")(app,instagramService);
require("./threads-local-routes")(app,threadsService);

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// 내 문서 저장 기능과 JPG 보관 연결은 기존 생성 경로보다 먼저 등록합니다.
require("./local-storage-routes")(app,storageOptions);

// 공개 기사 URL에서 제목과 본문을 가져오는 입력 경로
const { importArticle } = require("./article-source");
app.post("/api/article/import", async (req, res) => {
  try {
    const article = await importArticle(req.body?.url);
    res.json({ success: true, article });
  } catch (error) {
    const status = [400, 422, 502, 504].includes(error.status) ? error.status : 502;
    res.status(status).json({
      success: false,
      error: error.status ? error.message : "기사 본문을 추출하지 못했습니다. 원문을 직접 붙여넣어주세요.",
    });
  }
});

// 팀원 Python 사진 API의 기능·응답 형식을 Node 경로로 연결합니다.
require("./photo-routes")(app);
require("./editor-routes")(app);
require("./generate-routes")(app);
require("./validation-routes")(app);


const OUTPUT_DIR = path.join(__dirname, "output");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

app.use("/output", express.static(OUTPUT_DIR));

app.get('/health',(req,res)=>res.json({status:'ok'}));

app.post("/api/article/keywords", async (req, res) => {
  const article = req.body?.article;

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

  try {
    const candidates = await suggestKeywords(article);

    res.json({
      success: true,
      candidates,
    });
  } catch (error) {
    const status = Number(error.status);

    const message = error.provider === "gemini" ? error.message :
      status === 401
        ? "AI API 키를 확인해주세요."
        : status === 429
          ? "AI API 잔액·사용 한도·요청 빈도를 확인해주세요."
          : status === 403 || status === 404
            ? "모델 이름과 API 프로젝트의 사용 권한을 확인해주세요."
            : status === 400
              ? "AI 요청 설정을 확인해주세요."
              : error.status
                ? "AI 요청에 실패했습니다. 잠시 후 다시 시도해주세요."
                : error.message;

    console.error("키워드 요청 실패:", {
  name: error.name,
  status: error.status,
  code: error.code,
  type: error.type,
});

    res.status(502).json({
      success: false,
      error: message,
    });
  }
});



return app;
}
if(require.main===module){
 const port=Number(process.env.PORT||3001);
 createApp().listen(port,'127.0.0.1',()=>console.log(`편집실: http://localhost:${port}`));
}
module.exports={createApp};
