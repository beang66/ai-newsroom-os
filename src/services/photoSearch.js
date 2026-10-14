import { core } from "../api/core.js";
import { photoSearchQuery } from "../api/editorial.js";

// Core(/api/unsplash/search)는 한 페이지에 3장을 돌려준다. 사진 서랍이 쓰는 모양으로 바꾼다.
const translated = new Map(); // 같은 검색어는 다시 변환하지 않는다(main 의 검색어 캐시)

/** 검색 결과와, 실제로 찾은 영어 검색어(searched). 한글 검색어는 영어로 바꿔 찾는다(main 과 같음 — Unsplash 는 영어 검색어에서 결과가 잘 나온다). */
export async function searchUnsplashWithQuery(query, page = 1) {
  const key = String(query || "").trim();
  const searched = translated.get(key) ?? (await photoSearchQuery(key));
  translated.set(key, searched);
  const { photos = [] } = await core.searchPhotos(searched, page);
  return { searched, photos: toPhotos(photos, key) };
}

export async function searchUnsplash(query, page = 1) {
  return (await searchUnsplashWithQuery(query, page)).photos;
}

function toPhotos(photos, query) {
  return photos.map((photo) => ({
    id: `unsplash-${photo.id}`,
    unsplashId: photo.id,
    url: photo.urls?.regular || photo.urls?.small || "",
    caption: photo.alt_description || photo.description || `'${query}' 관련 사진`,
    source: "Unsplash",
    provider: photo.user?.name || "Unsplash",
    ratio: "16:9 (대표)",
  })).filter((photo) => photo.url);
}
