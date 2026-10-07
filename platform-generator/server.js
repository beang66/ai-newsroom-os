const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { suggestKeywords } = require("./ai-client");
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// 기본은 저장 경로의 410 안내만 등록합니다. PLATFORM_LOCAL_STORAGE=1은 개발 전용입니다.
require("./local-storage-routes")(app);

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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildHtml(payload) {
  const template = payload.template || "photo_body";

  const keyword = escapeHtml(payload.content?.keyword || "");
  const headline = escapeHtml(payload.content?.headline || "");
  const body = escapeHtml(payload.content?.body || "");

  const imageUrl = payload.image?.url || "";
  const photographer = escapeHtml(payload.image?.photographer || "Unsplash");

  // -----------------------
  // COVER
  // -----------------------

  if (template === "cover") {
    return `
    <!DOCTYPE html>
    <html lang="ko">

    <head>
      <meta charset="UTF-8">

      <style>
        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          width: 1080px;
          height: 1350px;

          font-family:
            Arial,
            "Malgun Gothic",
            sans-serif;

          background: #111;
        }

        .card {
          position: relative;

          width: 1080px;
          height: 1350px;

          overflow: hidden;

          background: #111;
        }

        .background {
          position: absolute;

          width: 100%;
          height: 100%;

          object-fit: cover;
        }

        .overlay {
          position: absolute;

          width: 100%;
          height: 100%;

          background:
            linear-gradient(
              to bottom,
              rgba(0,0,0,0.10) 20%,
              rgba(0,0,0,0.85) 100%
            );
        }

        .content {
          position: absolute;

          left: 72px;
          right: 72px;
          bottom: 110px;

          color: white;
        }

        .keyword {
          font-size: 34px;
          font-weight: 700;

          margin-bottom: 24px;
        }

        .headline {
          font-size: 76px;

          line-height: 1.15;

          font-weight: 900;

          word-break: keep-all;
        }

        .credit {
          position: absolute;

          right: 28px;
          bottom: 24px;

          color:
            rgba(255,255,255,0.65);

          font-size: 19px;
        }
      </style>
    </head>

    <body>

      <div class="card">

        <img
          class="background"
          src="${imageUrl}"
        >

        <div class="overlay"></div>

        <div class="content">

          <div class="keyword">
            ${keyword}
          </div>

          <div class="headline">
            ${headline}
          </div>

        </div>

        <div class="credit">
          Photo by ${photographer}
        </div>

      </div>

    </body>
    </html>
    `;
  }

  // -----------------------
  // TEXT ONLY
  // -----------------------

  if (template === "text_only") {
    return `
    <!DOCTYPE html>
    <html lang="ko">

    <head>
      <meta charset="UTF-8">

      <style>

        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;

          width: 1080px;
          height: 1350px;

          font-family:
            Arial,
            "Malgun Gothic",
            sans-serif;

          background: #080808;
        }

        .card {
          width: 1080px;
          height: 1350px;

          background: #080808;

          color: white;

          display: flex;

          flex-direction: column;

          justify-content: center;

          padding: 110px;
        }

        .keyword {
          font-size: 34px;

          font-weight: 700;

          margin-bottom: 38px;

          opacity: 0.65;
        }

        .headline {
          font-size: 78px;

          line-height: 1.18;

          font-weight: 900;

          word-break: keep-all;

          margin-bottom: 45px;
        }

        .body {
          font-size: 38px;

          line-height: 1.55;

          word-break: keep-all;

          opacity: 0.88;
        }

      </style>

    </head>

    <body>

      <div class="card">

        <div class="keyword">
          ${keyword}
        </div>

        <div class="headline">
          ${headline}
        </div>

        <div class="body">
          ${body}
        </div>

      </div>

    </body>

    </html>
    `;
  }

  // -----------------------
  // PHOTO BODY
  // -----------------------

  return `
  <!DOCTYPE html>
  <html lang="ko">

  <head>
    <meta charset="UTF-8">

    <style>

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;

        width: 1080px;
        height: 1350px;

        font-family:
          Arial,
          "Malgun Gothic",
          sans-serif;

        background: #111;
      }

      .card {
        position: relative;

        width: 1080px;
        height: 1350px;

        background: #111;

        color: white;

        overflow: hidden;
      }

      .image-area {
        width: 100%;
        height: 720px;

        overflow: hidden;

        background: #222;
      }

      .image-area img {
        width: 100%;
        height: 100%;

        object-fit: cover;
      }

      .content {
        padding:
          60px
          72px;
      }

      .keyword {
        font-size: 31px;

        font-weight: 700;

        opacity: 0.70;

        margin-bottom: 20px;
      }

      .headline {
        font-size: 62px;

        line-height: 1.2;

        font-weight: 900;

        word-break: keep-all;

        margin-bottom: 28px;
      }

      .body {
        font-size: 32px;

        line-height: 1.5;

        word-break: keep-all;
      }

      .credit {
        position: absolute;

        right: 28px;
        bottom: 18px;

        color:
          rgba(255,255,255,0.55);

        font-size: 18px;
      }

    </style>

  </head>

  <body>

    <div class="card">

      <div class="image-area">

        <img src="${imageUrl}">

      </div>

      <div class="content">

        <div class="keyword">
          ${keyword}
        </div>

        <div class="headline">
          ${headline}
        </div>

        <div class="body">
          ${body}
        </div>

      </div>

      <div class="credit">
        Photo by ${photographer}
      </div>

    </div>

  </body>

  </html>
  `;
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

app.post("/render", async (req, res) => {
  let browser;

  try {
    const payload = req.body;

    if (!payload.card_id) {
      return res.status(400).json({
        success: false,
        error: "card_id is required",
      });
    }

    const html = buildHtml(payload);

    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage({
      viewport: {
        width: 1080,
        height: 1350,
      },
    });

    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    const fileName = `${payload.card_id}_${Date.now()}.jpg`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    await page.screenshot({
      path: filePath,
      type: "jpeg",
      quality: 90,
      fullPage: true,
    });

    await browser.close();

    res.json({
      success: true,
      card_id: payload.card_id,
      file_name: fileName,
      file_path: filePath,
      image_url: `http://localhost:3000/output/${fileName}`,
    });
  } catch (error) {
    if (browser) {
      await browser.close();
    }

    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});


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



app.listen(3001, () => {
  console.log("현재 서버 파일:", __filename);
  console.log(
    "화면 파일 존재:",
    fs.existsSync(path.join(__dirname, "public", "index.html"))
  );
  console.log("http://localhost:3001");
});
