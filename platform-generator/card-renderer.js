// 카드뉴스 HTML 만들기와 이미지 렌더링 — 단독 서버(server.js)와 앱 코어 어댑터(core-adapter.js)가 같이 쓴다.
// buildHtml 은 server.js 에서 그대로 옮겼다(동작 변경 없음).
const { chromium } = require("playwright");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildHtml(payload) {
  if (payload.role || payload.content_version === 2 || payload.content?.answer !== undefined || payload.content?.detail !== undefined) {
    const template=require('./lib/card-template');
    const model=require('./lib/card-model');
    const card=model.normalize(payload);
    const error=model.layoutError(card);
    if(error)throw Object.assign(new Error(error),{status:400});
    if(card.image?.url&&!template.validImage(card.image.url))throw Object.assign(new Error('지원하지 않는 사진 주소입니다.'),{status:400});
    return '<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+'</style>'+template.markup(card)+'</html>';
  }
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

// 렌더용 브라우저: 기본 Chromium(개발) → 설치된 Edge → Chrome 순으로 연다. EXE 에는 Playwright 의 Chromium 이 없으므로
// Windows 에 기본 설치된 Edge 를 쓴다. PLATFORM_RENDER_CHANNEL(msedge|chrome|chromium)로 하나만 지정할 수 있다.
async function launchBrowser() {
  const forced = process.env.PLATFORM_RENDER_CHANNEL;
  const attempts = forced ? [forced] : ["chromium", "msedge", "chrome"];
  let last = null;
  for (const channel of attempts) {
    try {
      return await chromium.launch(channel === "chromium" ? { headless: true } : { headless: true, channel });
    } catch (error) {
      last = error;
    }
  }
  const error = new Error("카드뉴스를 그릴 브라우저를 찾지 못했습니다. Microsoft Edge 또는 Chrome 이 설치되어 있어야 합니다.");
  error.status = 503;
  error.cause = last;
  throw error;
}

// payload(카드 하나) → JPEG 바이트. 파일을 만들지 않는다(앱 코어가 받아 암호화 저장소에 등록한다).
async function renderCardJpeg(payload) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.setContent(buildHtml(payload), { waitUntil: "networkidle" });
    if(payload.role || payload.content_version === 2 || payload.content?.answer !== undefined || payload.content?.detail !== undefined){
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
      const fit=await page.evaluate(require('./lib/card-template').fitCard);
      if(!fit.measured||fit.overflow||fit.overlap)throw Object.assign(new Error(fit.overlap?'텍스트 박스가 겹칩니다. 위치를 조정한 뒤 다시 렌더해 주세요.':'글이 카드 영역을 넘습니다. 문장을 줄이거나 카드를 나눈 뒤 다시 렌더해 주세요.'),{status:400});
    }
    return await page.screenshot({ type: "jpeg", quality: 90, fullPage: true });
  } finally {
    await browser.close();
  }
}

module.exports = { buildHtml, renderCardJpeg };
