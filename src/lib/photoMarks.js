// 본문 속 사진 자리 — 원고(content)는 글자로 저장하고, 사진은 한 줄짜리 표시로 넣는다: [사진:<사진 id>]
// 사진의 실제 데이터(원본·편집본·자르기·모자이크·설명·출처)는 article.photos 에 있다(저장 구조는 v30 과 같음).
// 팀 통합 초기에 쓰던 [사진 삽입: 설명 (출처: …, 제공: …)] 줄도 설명·출처가 맞는 사진이 있으면 사진으로 읽는다.

const PHOTO_LINE = /^\[사진:([A-Za-z0-9_-]{1,80})\]$/;
const LEGACY_LINE = /^\[사진 삽입: (.*) \(출처: (.*?), 제공: (.*?)\)\]$/;

export const photoLine = (id) => `[사진:${id}]`;

/** 한 줄이 사진 자리이면 그 사진, 아니면 null */
export function photoOfLine(line, photos = []) {
  const text = String(line ?? "").trim();
  const id = PHOTO_LINE.exec(text)?.[1];
  if (id) return photos.find((p) => p.id === id) || null;
  const legacy = LEGACY_LINE.exec(text);
  if (legacy) return photos.find((p) => p.caption === legacy[1] && (p.source || "") === legacy[2]) || null;
  return null;
}

/** AI 요청(제목·부제·검색어 추천 등)에 넣을 본문 — 사진 자리 줄을 뺀다 */
export function textWithoutPhotos(content) {
  return String(content || "")
    .split("\n")
    .filter((line) => !PHOTO_LINE.test(line.trim()) && !LEGACY_LINE.test(line.trim()))
    .join("\n");
}

/** 사진 설명 표시 문구 — v30 과 같은 "설명 ⓒ 출처" */
export const captionText = (photo) => `${photo?.caption || ""}${photo?.source ? " ⓒ " + photo.source : ""}`;
