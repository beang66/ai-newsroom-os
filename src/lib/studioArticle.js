// 플랫폼 스튜디오(main 의 FormatConverter)와 내 기사 작성기 사이의 어댑터.
//
// 내 에디터는 article.content 에 HTML(contentEditable)을 담는다. main 의 스튜디오는 content 를
// "문단은 빈 줄로 나눈 일반 텍스트(사진 자리는 [사진:id] 줄)"로 보고, 고정본(snapshot)의 HTML 이
// bodyHtmlOf(content, photos) 와 같은지 엄격히 비교한다. 그래서
//  - 스튜디오에는 content 를 일반 텍스트로 바꿔 보여 주고,
//  - Core 에는 content(HTML, 복원용)는 그대로 두고 bodyHtml 만 같은 규칙으로 만들어 저장한다.

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (text) => text.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (match) => ENTITIES[match]);

/** 에디터 HTML → 문단을 빈 줄로 나눈 일반 텍스트 */
export function plainContent(html) {
  return decode(
    String(html || "")
      .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n\n")
      .replace(/<\/div>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** HTML 글자·속성 값에 넣을 문자열의 특수 문자를 바꾼다(외부 사진 설명 등이 태그로 실행되지 않게). */
export const escapeHtml = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const FACT_MARKS = ".fact-flaw-target, .fact-fixed-success, .fluorescent-highlight";

/** 예전 방식(본문에 태그를 끼워 넣던 팩트체크 표시)이 기사 본문에 섞여 저장된 것을 걷어 낸다. 글자는 그대로 둔다. */
export function stripFactMarks(html) {
  if (!/fact-flaw-target|fact-fixed-success|fluorescent-highlight/.test(html) || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.body.querySelectorAll(FACT_MARKS).forEach((element) => element.replaceWith(...element.childNodes));
  return doc.body.innerHTML;
}

/** 일반 텍스트(또는 이미 HTML) → 에디터에서 열 HTML. main 등 다른 화면에서 저장한 원고를 열 때 쓴다. */
export function editorHtml(content) {
  const text = String(content || "");
  if (/<(p|div|br|span|h[1-6]|ul|ol|li|figure|img)\b[^>]*>/i.test(text)) return stripFactMarks(text);
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** 내 기사 → 스튜디오가 보는 기사(content 만 일반 텍스트) */
export const toStudioArticle = (article) => ({ ...article, content: plainContent(article.content) });

/** 스튜디오가 만든 변경(platformDrafts·cardNews 등)을 내 기사에 합친다. content 는 내 에디터 HTML 을 그대로 둔다. */
export const mergeStudioArticle = (previous, next) => ({ ...previous, ...next, content: previous.content });
