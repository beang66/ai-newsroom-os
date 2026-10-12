// 동아일보 기사 미리보기 — 기존 기사 작성 앱(v30, assets/article-workspace.js renderPreview/fitPreview)의 동작을 복원한다.
//  - 미리보기 전용 CSS(donga-fonts.css: 글꼴 데이터 내장, donga-preview.css)는 iframe 문서 안에서만 불러온다.
//    팀 앱 전역 CSS(Tailwind)와 서로 덮어쓰지 않게 하기 위해서다.
//  - HTML 구조: article > header.preview-head(category, h1.title, meta) + section.preview-body(subtitle, body)
//  - 기사 작성 카드 안(제목·부제·본문 자리)에 그린다. 카드(약 820px)가 iframe 너비가 되면 1024px 이하 규칙이 적용돼
//    본문이 684px 가 아니게 되므로(2026-10-10 줄바꿈 불일치 원인), iframe 은 동아일보 PC 문서 폭(1312px)으로 그리고
//    비어 있는 양옆 칸만 잘라 본문 열을 카드 가운데에 보인다. 확대·축소(transform: scale)는 쓰지 않는다.
//    카드가 본문 폭보다 좁을 때만 v30 처럼 카드 너비 그대로(반응형 규칙) 그린다.
import { useEffect, useMemo, useRef, useState } from "react";
import { captionText, photoOfLine } from "../lib/photoMarks.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 본문 속 사진 자리 줄([사진:id], 예전 [사진 삽입: …]) → 편집본 사진 + "설명 ⓒ 출처"(v30 figure 와 같은 모양)
function figureHtml(photo) {
  const ai = /AI로 생성|AI 생성/.test(`${photo.caption} ${photo.source} ${photo.provider || ""}`);
  const img = photo.url ? `<img src="${esc(photo.url)}" alt="${esc(photo.caption || photo.alt || "")}">` : "";
  return `<figure>${img}<figcaption${ai ? ' class="ai-generated"' : ""}>${esc(captionText(photo))}</figcaption></figure>`;
}

/** 원고 본문(textarea 텍스트) → 미리보기 본문 HTML.
 *  편집기의 한 줄(Enter)이 v30 의 한 문단(<p>)이다. 빈 줄은 문단 구분으로만 쓰고 빈 문단을 만들지 않는다.
 *  문단을 합치거나 나누지 않으며, 사진 삽입 표시는 사진·설명(figure/figcaption)으로 본문과 구분한다. */
function dongaBodyHtml(content, photos = []) {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const photo = photoOfLine(line, photos);
      return photo ? figureHtml(photo) : `<p>${esc(line)}</p>`;
    })
    .join("");
}

// 시각 → "YYYY-MM-DD HH:mm"(이 PC 시간대, 한국이면 KST). 코어 시각은 UTC ISO 라 그대로 자르면 9시간 이르게 보인다
const stamp = (value) => {
  const text = String(value || "");
  const d = /T\d{2}:\d{2}.*([Zz]|[+-]\d{2}:?\d{2})$/.test(text) ? new Date(text) : null;
  if (!d || Number.isNaN(d.getTime())) return text.replace("T", " ").slice(0, 16);
  return d.toLocaleString("sv-SE", { hour12: false }).slice(0, 16);
};

/** v30 renderPreview 의 srcdoc 과 같은 문서 */
// 입력·업데이트 시각
// - 송고 후: 입력 = 처음 송고 시각, 업데이트 = 송고본 최종 저장 시각(다시 송고하면 바뀐다. 송고 뒤 저장만 해서는 안 바뀜)
// - 송고 전: 입력 = 처음 수동 저장 시각, 업데이트 = 마지막 수동 저장 시각(처음 저장 직후엔 입력과 같다)
// - 한 번도 저장하지 않았으면 '저장 전'
function dongaPreviewDocument(article, photos = [], published = null, saveTimes = null) {
  const entered = published?.firstPublishedAt || saveTimes?.firstSavedAt;
  const updated = published?.publishedAt || saveTimes?.lastSavedAt || entered;
  const base = new URL("assets/donga/", document.baseURI);
  const subtitle = String(article.subtitle || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(esc)
    .join("<br>");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<link rel="stylesheet" href="${new URL("donga-fonts.css", base)}"><link rel="stylesheet" href="${new URL("donga-preview.css", base)}">`
    + `<style>@media print{html,body{margin:0}.article{margin:0 auto}figure{break-inside:avoid}h1{break-after:avoid}}</style></head>`
    + `<body><article class="article"><header class="preview-head"><div class="category">${esc([article.category, article.subcategory].filter(Boolean).join(" > ")) || "&nbsp;"}</div>`
    + `<h1 class="title">${esc(article.title || "")}</h1>`
    + `<div class="meta"><span>입력 ${entered ? esc(stamp(entered)) : "저장 전"}</span><span>업데이트 ${updated ? esc(stamp(updated)) : "저장 전"}</span></div></header>`
    + `<section class="preview-body">${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}`
    + `<div class="body">${dongaBodyHtml(article.content, photos)}</div></section></article></body></html>`;
}

// 동아일보 PC 기사 화면(donga-preview.css 의 1280px 초과 규칙): 문서 폭 1312px 안에서
// 제목은 왼쪽 16+268px 에서 최대 676px, 본문은 16+264px 에서 684px. 양옆(264/332px)은 비어 있는 자리 확보용 칸이다.
const PC_DOC = 1312;
const PC_BODY_LEFT = 16 + 264;
const PC_BODY = 684;

export default function DongaPreview({ article, photos, published = null, saveTimes = null }) {
  const viewRef = useRef(null);
  const frameRef = useRef(null);
  const [viewWidth, setViewWidth] = useState(0);
  const [height, setHeight] = useState(600);
  const [gutter, setGutter] = useState(0); // v30 fitPreview 의 gutter: 화면(부모 문서) 세로 스크롤바 폭
  const [scrollbar, setScrollbar] = useState(17); // iframe 문서 자체의 세로 스크롤바 폭(donga-preview.css: overflow-y: scroll)
  const [srcDoc, setSrcDoc] = useState("");
  const html = useMemo(() => dongaPreviewDocument(article, photos || [], published, saveTimes), [article, photos, published, saveTimes]);

  // 카드 안쪽이 본문 684px 를 담을 수 있으면 PC 기사 화면 그대로(iframe 을 PC 폭으로 그리고 빈 양옆 칸만 잘라 본문 열을 가운데에),
  // 더 좁으면 v30 처럼 카드 너비 그대로(반응형 규칙 적용). 어느 쪽도 확대·축소는 하지 않는다.
  const pc = viewWidth >= PC_BODY + 32;
  const frameWidth = pc ? PC_DOC + scrollbar : viewWidth + gutter;
  const frameLeft = pc ? Math.round(viewWidth / 2 - (PC_BODY_LEFT + PC_BODY / 2)) : 0;

  // 입력할 때마다 iframe 을 다시 읽지 않도록 잠깐 모았다가 반영한다
  useEffect(() => {
    const t = setTimeout(() => setSrcDoc(html), srcDoc ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  // 미리보기 영역(카드 안쪽) 너비 추적(사이드바·창 크기 변화)
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    setViewWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 글꼴 로딩이 끝난 뒤 스크롤바 폭을 재고 높이를 내용에 맞춘다(확대·축소 없음).
  const fit = async () => {
    const f = frameRef.current;
    const doc = f?.contentDocument;
    if (!doc?.body || !viewWidth) return;
    await doc.fonts.ready;
    setScrollbar(Math.max(0, f.contentWindow.innerWidth - doc.documentElement.clientWidth));
    setGutter(Math.max(0, window.innerWidth - document.documentElement.clientWidth));
    setHeight(doc.body.scrollHeight);
  };
  useEffect(() => {
    // 너비가 바뀌면 줄바꿈이 달라지므로 레이아웃이 끝난 다음 프레임에 높이를 다시 잰다
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewWidth, gutter, scrollbar]);

  return (
    <div ref={viewRef} className="w-full" data-testid="donga-preview" data-mode={pc ? "pc" : "fit"}>
      <div className="relative overflow-hidden bg-white" style={{ width: viewWidth || "100%", height }}>
        <iframe
          ref={frameRef}
          title="동아일보 기사 미리보기"
          srcDoc={srcDoc}
          onLoad={fit}
          className="block border-0 bg-white"
          style={{ position: "relative", left: frameLeft, width: viewWidth ? frameWidth : "100%", height, transform: "none" }}
        />
      </div>
    </div>
  );
}
