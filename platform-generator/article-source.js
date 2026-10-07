// 기사 URL 수집: 공개 웹페이지의 HTML에서 제목과 본문을 추출합니다.
// 원문 HTML의 스크립트나 외부 리소스는 실행·로드하지 않습니다.
const http = require("http");
const https = require("https");
const dns = require("dns").promises;
const net = require("net");
const ipaddr = require("ipaddr.js");
const iconv = require("iconv-lite");
const { JSDOM, VirtualConsole } = require("jsdom");
const { Readability } = require("@mozilla/readability");

const MAX_BYTES = 5 * 1024 * 1024;
const TOTAL_TIMEOUT = 20000;

function userError(message, status = 422) {
  return Object.assign(new Error(message), { status });
}

// 1. 공개 HTTP(S) 주소만 허용합니다.
function parseUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw userError("2,048자 이내의 기사 URL을 입력해주세요.", 400);
  }
  let url;
  try { url = new URL(value.trim()); }
  catch { throw userError("https://로 시작하는 올바른 기사 URL을 입력해주세요.", 400); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port))) {
    throw userError("공개 HTTP 또는 HTTPS 기사 주소를 입력해주세요.", 400);
  }
  url.hash = "";
  return url;
}

// 2. 내부 주소 접근을 막고 확인한 IP에 연결합니다.
// 리디렉션 대상도 같은 검사를 거칩니다.
async function publicAddress(url, deadline) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(userError("기사 서버 응답 시간이 초과되었습니다.", 504)),
      Math.max(1, deadline - Date.now()));
  });
  let records;
  try {
    records = await Promise.race([
      net.isIP(host) ? Promise.resolve([{ address: host, family: net.isIP(host) }])
        : dns.lookup(host, { all: true }),
      timeout,
    ]);
  } catch (error) {
    if (error.status) throw error;
    throw userError("기사 사이트 주소를 찾지 못했습니다. URL을 확인해주세요.", 502);
  } finally { clearTimeout(timer); }
  if (!records.length || records.some((record) => {
    try { return ipaddr.process(record.address).range() !== "unicast"; }
    catch { return true; }
  })) throw userError("공개 인터넷 기사 주소만 불러올 수 있습니다.", 400);
  return records[0];
}

// 3. HTML 요청: 전체 시간·용량·리디렉션을 제한합니다.
async function requestHtml(url, deadline) {
  const address = await publicAddress(url, deadline);
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(url, {
      agent: false,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsroomArticleReader/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
      },
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        if (!location) return reject(userError("이동할 기사 주소를 확인하지 못했습니다."));
        return resolve({ location });
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        return reject(userError("사이트에서 기사 접근을 허용하지 않았습니다. 원문을 직접 붙여넣어주세요.", 502));
      }
      const type = String(response.headers["content-type"] || "");
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
        response.destroy();
        return reject(userError("HTML 기사 페이지를 입력해주세요. PDF·이미지 주소는 지원하지 않습니다."));
      }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
        response.destroy();
        return reject(userError("이 사이트의 응답 형식을 읽지 못했습니다. 원문을 직접 붙여넣어주세요."));
      }
      let size = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          response.destroy(userError("기사 페이지 용량이 너무 큽니다. 원문을 직접 붙여넣어주세요."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ bytes: Buffer.concat(chunks), type }));
    });
    const timer = setTimeout(() => request.destroy(
      userError("기사 서버 응답 시간이 초과되었습니다. 다시 시도하거나 원문을 붙여넣어주세요.", 504)
    ), Math.max(1, deadline - Date.now()));
    request.on("close", () => clearTimeout(timer));
    request.on("error", (error) => reject(error.status ? error : userError(
      "기사 페이지를 불러오지 못했습니다. 주소를 확인하거나 원문을 직접 붙여넣어주세요.", 502
    )));
  });
}

// 4. UTF-8 및 선언된 한국어 문자 인코딩 처리
function decodeHtml(bytes, type) {
  const head = bytes.subarray(0, 8192).toString("latin1");
  const charset = (type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ||
    head.match(/charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1] || "utf-8");
  return iconv.decode(bytes, iconv.encodingExists(charset) ? charset : "utf-8");
}

// 5. 본문 추출: 결과는 HTML이 아닌 평문으로 반환합니다.
function extractArticle(html, url) {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  try {
    const article = new Readability(dom.window.document, {
      maxElemsToParse: 50000,
    }).parse();
    if (!article) throw userError("기사 본문을 찾지 못했습니다. 원문을 직접 붙여넣어주세요.");
    const bodyDom = new JSDOM(article.content || "");
    let content;
    try {
      const nodes = [...bodyDom.window.document.querySelectorAll("p, h2, h3, li")];
      const lines = nodes.filter((node) => !node.parentElement?.closest("p, h2, h3, li"))
        .map((node) => node.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      content = lines.length ? lines.join("\n\n")
        : (article.textContent || "").replace(/\s+/g, " ").trim();
    } finally { bodyDom.window.close(); }
    const title = (article.title || "").replace(/\s+/g, " ").trim();
    if (!title || content.length < 100) {
      throw userError("충분한 기사 본문을 추출하지 못했습니다. 제목과 원문을 직접 입력해주세요.");
    }
    if (title.length > 500 || content.length > 30000) {
      throw userError("추출한 기사가 입력 한도를 넘습니다. 제목 500자·본문 30,000자 이내로 직접 입력해주세요.");
    }
    return { title, content, url };
  } finally { dom.window.close(); }
}

async function importArticle(value) {
  let url = parseUrl(value);
  const deadline = Date.now() + TOTAL_TIMEOUT;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const result = await requestHtml(url, deadline);
    if (!result.location) return extractArticle(decodeHtml(result.bytes, result.type), url.href);
    url = parseUrl(new URL(result.location, url).href);
  }
  throw userError("기사 주소 이동이 너무 많습니다. 최종 기사 주소를 입력해주세요.");
}

module.exports = { importArticle, parseUrl, extractArticle };
