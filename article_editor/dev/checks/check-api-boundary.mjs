import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 코어 호출 경계 검사.
//
// UI 코드는 frontend/src/api/ 밖에서 코어와 직접 대화하지 않는다.
// (fetch 직접 호출, "/api/" 경로 문자열, XMLHttpRequest, EventSource/WebSocket)
// 예외가 필요하면 그 줄 끝에  // api-boundary-allow  주석을 붙인다.
//
//   node scripts/check-api-boundary.mjs

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN = ["web/src"];
const SKIP = [
  /^web[\\/]src[\\/]api[\\/]/, // 계약·전송 경계 자체(여기만 코어를 안다)
  /[\\/]node_modules[\\/]/,
];
const EXT = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const PATTERNS = [
  [/\bfetch\s*\(/, "fetch() 직접 호출"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bEventSource\b|\bWebSocket\b/, "EventSource/WebSocket"],
  [/["'`]\/api\//, "'/api/' 경로 문자열"],
];
const ALLOW = /api-boundary-allow/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    if (SKIP.some((pattern) => pattern.test(rel))) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const findings = [];
for (const dir of SCAN) {
  const start = path.join(ROOT, dir);
  if (!fs.existsSync(start)) continue;
  for (const file of walk(start)) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (ALLOW.test(line)) return;
        for (const [pattern, label] of PATTERNS) {
          if (pattern.test(line))
            findings.push(`${rel}:${index + 1}  ${label}\n    ${line.trim()}`);
        }
      });
  }
}

if (findings.length) {
  console.error("코어 호출 경계 위반 — web/src/api/ 를 통해서만 코어를 호출하세요.\n");
  console.error(findings.join("\n"));
  console.error(`\n총 ${findings.length}건.`);
  process.exit(1);
}
console.log("PASS api-boundary: 코어 호출이 web/src/api/ 로만 모여 있습니다.");
