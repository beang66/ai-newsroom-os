// Unsplash API Integration Service
// 공식 규격: utm_source=article_workspace&utm_medium=referral

export const UTM_SOURCE = "article_workspace";
export const UNSPLASH_REFERRAL_URL = `https://unsplash.com/?utm_source=${UTM_SOURCE}&utm_medium=referral`;
const UNSPLASH_BASE_URL = "https://api.unsplash.com";

/**
 * 로컬 스토리지 또는 환경 변수에서 Unsplash Access Key 조회
 */
export const getUnsplashApiKey = () => {
  return (
    localStorage.getItem("unsplash_access_key") ||
    import.meta.env.VITE_UNSPLASH_ACCESS_KEY ||
    ""
  );
};

/**
 * Unsplash Access Key 저장 (로컬스토리지)
 */
export const setUnsplashApiKey = (key) => {
  if (key && key.trim()) {
    localStorage.setItem("unsplash_access_key", key.trim());
  } else {
    localStorage.removeItem("unsplash_access_key");
  }
};

/**
 * Unsplash API 가이드라인에 맞춘 출처 표기 생성
 */
export const getUnsplashAttribution = (photographer, photographerUsername) => {
  if (photographer && photographerUsername) {
    const photographerUrl = `https://unsplash.com/@${photographerUsername}?utm_source=${UTM_SOURCE}&utm_medium=referral`;
    return {
      sourceMarkdown: `Photo by ${photographer} on Unsplash`,
      creditMarkdown: `Photo by [${photographer}](${photographerUrl}) on [Unsplash](${UNSPLASH_REFERRAL_URL})`,
      photographer,
      photographerUrl,
      unsplashUrl: UNSPLASH_REFERRAL_URL
    };
  }
  return {
    sourceMarkdown: `Photo on Unsplash`,
    creditMarkdown: `Photo on [Unsplash](${UNSPLASH_REFERRAL_URL})`,
    unsplashUrl: UNSPLASH_REFERRAL_URL
  };
};

/**
 * Unsplash 사진 검색 API 호출
 */
export const searchUnsplashPhotos = async (query, page = 1, perPage = 12) => {
  const apiKey = getUnsplashApiKey();
  if (!apiKey) {
    throw new Error("UNSPLASH_API_KEY_MISSING");
  }

  const trimmedQuery = query?.trim() || "뉴스";
  const url = `${UNSPLASH_BASE_URL}/search/photos?query=${encodeURIComponent(trimmedQuery)}&page=${page}&per_page=${perPage}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${apiKey}`,
      "Accept-Version": "v1"
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("UNSPLASH_API_KEY_INVALID");
    }
    if (response.status === 403) {
      throw new Error("UNSPLASH_RATE_LIMIT");
    }
    throw new Error(`Unsplash API 오류: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results = (data.results || []).map((photo) => {
    const photographerName = photo.user?.name;
    const photographerUsername = photo.user?.username;
    const attr = getUnsplashAttribution(photographerName, photographerUsername);
    const formattedSource = photographerName
      ? `Photo by ${photographerName} on Unsplash`
      : "Unsplash";

    return {
      id: `unsplash-${photo.id}`,
      rawId: photo.id,
      url: photo.urls?.regular || photo.urls?.small,
      thumbUrl: photo.urls?.small || photo.urls?.thumb,
      fullUrl: photo.urls?.full || photo.urls?.regular,
      caption: photo.description || photo.alt_description || trimmedQuery,
      source: formattedSource,
      creditMarkdown: attr.creditMarkdown,
      provider: photographerName ? `${photographerName} (Unsplash)` : "Unsplash 작가",
      photographer: photographerName,
      photographerUrl: attr.photographerUrl,
      attributionUrl: attr.unsplashUrl,
      downloadLocation: photo.links?.download_location,
      ratios: ["16:9 (동아일보 대표)", "4:3 (본문)", "1:1 (모바일/SNS)"]
    };
  });

  return {
    total: data.total || 0,
    totalPages: data.total_pages || 1,
    results
  };
};

/**
 * Unsplash 가이드라인: 사진 선택 시 다운로드 트리거 호출
 */
export const triggerUnsplashDownload = async (downloadLocation) => {
  const apiKey = getUnsplashApiKey();
  if (!downloadLocation || !apiKey) return;
  try {
    await fetch(downloadLocation, {
      headers: {
        Authorization: `Client-ID ${apiKey}`
      }
    });
  } catch (err) {
    console.warn("Unsplash download tracking failed:", err);
  }
};
