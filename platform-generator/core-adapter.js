// App Core에서 platform-generator의 실제 기능을 재사용하기 위한 개발용 어댑터.
// stdin JSON -> stdout JSON. 브라우저/UI는 이 파일을 직접 호출하지 않습니다.
const registerGenerateRoutes = require("./generate-routes");
const registerValidationRoutes = require("./validation-routes");
const { suggestKeywords } = require("./ai-client");
const { readInput } = require("./core-bridge");
const { renderCardJpeg } = require("./card-renderer");

function getHandler(register, route) {
  let handler = null;
  const app = {
    post(path, fn) {
      if (path === route) handler = fn;
    },
  };
  register(app);
  if (!handler) throw new Error("플랫폼 생성 핸들러를 찾지 못했습니다.");
  return handler;
}

async function invoke(handler, request) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        if (statusCode >= 400 || body?.success === false) {
          const error = new Error(body?.error || "플랫폼 생성에 실패했습니다.");
          error.status = statusCode;
          reject(error);
          return;
        }
        resolve(body);
      },
    };
    Promise.resolve(handler(request, res)).catch(reject);
  });
}
const generate = (platform, payload) => invoke(getHandler(registerGenerateRoutes, "/api/generate/:platform"), { params: { platform }, body: payload });
const validate = payload => invoke(getHandler(registerValidationRoutes, "/api/validate"), { body: payload });

async function main() {
  // 첫 줄이 작업 입력. stdin 은 닫지 않는다(코어가 외부 AI 응답을 같은 통로로 돌려준다)
  const input = JSON.parse((await readInput()) || "{}");

  if (input.action === "keywords") {
    const candidates = await suggestKeywords(input.article || {});
    return { candidates };
  }
  if (input.action === "generate") {
    if (typeof input.platform !== "string") throw new Error("플랫폼을 지정해주세요.");
    return generate(input.platform, input.payload || {});
  }
  if (input.action === "validate") return validate(input.payload || {});
  if (input.action === "render") {
    // 카드 하나를 JPEG 로 그려 base64 로 돌려준다. 파일·localhost 주소를 만들지 않는다(코어가 암호화 저장소에 등록).
    const payload = input.payload || {};
    if (typeof payload.card_id !== "string" || !payload.card_id) {
      const error = new Error("card_id 가 필요합니다.");
      error.status = 400;
      throw error;
    }
    const image = await renderCardJpeg(payload);
    return { card_id: payload.card_id, mime_type: "image/jpeg", data: image.toString("base64") };
  }
  throw new Error("지원하지 않는 platform-generator 작업입니다.");
}

main()
  .then((result) => {
    process.stdout.write(JSON.stringify({ ok: true, result }) + "\n", () => process.exit(0));
  })
  .catch((error) => {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: error?.message || "platform-generator 실행에 실패했습니다.",
      status: Number(error?.status) || 500,
    }) + "\n", () => process.exit(1));
  });
