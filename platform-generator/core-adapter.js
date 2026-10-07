// App Core에서 platform-generator의 실제 기능을 재사용하기 위한 개발용 어댑터.
// stdin JSON -> stdout JSON. 브라우저/UI는 이 파일을 직접 호출하지 않습니다.
const registerGenerateRoutes = require("./generate-routes");
const { suggestKeywords } = require("./ai-client");

function getGenerateHandler() {
  let handler = null;
  const app = {
    post(path, fn) {
      if (path === "/api/generate/:platform") handler = fn;
    },
  };
  registerGenerateRoutes(app);
  if (!handler) throw new Error("플랫폼 생성 핸들러를 찾지 못했습니다.");
  return handler;
}

async function generate(platform, payload) {
  const handler = getGenerateHandler();
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
    Promise.resolve(handler({ params: { platform }, body: payload }, res)).catch(reject);
  });
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

  if (input.action === "keywords") {
    const candidates = await suggestKeywords(input.article || {});
    return { candidates };
  }
  if (input.action === "generate") {
    if (typeof input.platform !== "string") throw new Error("플랫폼을 지정해주세요.");
    return generate(input.platform, input.payload || {});
  }
  throw new Error("지원하지 않는 platform-generator 작업입니다.");
}

main()
  .then((result) => {
    process.stdout.write(JSON.stringify({ ok: true, result }));
  })
  .catch((error) => {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: error?.message || "platform-generator 실행에 실패했습니다.",
      status: Number(error?.status) || 500,
    }));
    process.exitCode = 1;
  });
