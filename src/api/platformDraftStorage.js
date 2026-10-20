// 로컬 초안 저장소(내 문서 / AI-Newsroom / drafts)와의 통신 및 데이터 변환 API.
// UI는 직접 fetch나 엔드포인트를 호출하지 않고 이 모듈을 통해서만 로컬 초안을 저장·조회합니다.

const LOCAL_DRAFTS_PATH = "/api/local/drafts";
const LOCAL_STORAGE_INFO_PATH = "/api/local/storage";

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`로컬 서버 연결 실패: ${error.message}. platform-generator 서버 실행을 확인해 주세요.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    if (response.status === 410) {
      throw Object.assign(
        new Error("로컬 파일 저장이 비활성화되어 있습니다. PLATFORM_LOCAL_STORAGE=1 환경 변수로 서버를 실행해 주세요."),
        { status: 410 }
      );
    }
    throw new Error(`서버 응답(HTTP ${response.status})을 JSON으로 읽지 못했습니다.`);
  }

  if (response.status === 410) {
    throw Object.assign(
      new Error(data?.error || "로컬 파일 저장이 비활성화되어 있습니다. PLATFORM_LOCAL_STORAGE=1 환경 변수로 서버를 실행해 주세요."),
      { status: 410 }
    );
  }

  if (!response.ok || (data && data.success === false)) {
    throw Object.assign(
      new Error(data?.error || `요청 실패 (HTTP ${response.status})`),
      { status: response.status }
    );
  }

  return data;
}

/** 편집 상태 전체를 내 문서의 로컬 초안 파일로 저장합니다. */
export async function saveLocalDraft(draft) {
  return requestJson(LOCAL_DRAFTS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft }),
  });
}

/** 내 문서에 저장된 로컬 초안 메타데이터 목록을 최신순으로 가져옵니다. */
export async function listLocalDrafts() {
  const result = await requestJson(LOCAL_DRAFTS_PATH);
  return Array.isArray(result?.drafts) ? result.drafts : [];
}

/** 특정 ID의 저장된 초안 본문을 읽어옵니다. */
export async function loadLocalDraft(id) {
  if (!id) throw new Error("초안 ID가 필요합니다.");
  const result = await requestJson(`${LOCAL_DRAFTS_PATH}/${encodeURIComponent(id)}`);
  if (!result?.draft) throw new Error("저장된 초안 데이터를 확인할 수 없습니다.");
  return result.draft;
}

/** 로컬 저장소 실제 루트 및 폴더 정보를 조회합니다. */
export async function getLocalStorageInfo() {
  return requestJson(LOCAL_STORAGE_INFO_PATH);
}

/**
 * 현재 React 편집실 상태를 기존 snapshot 호환 JSON 구조로 직렬화합니다.
 * 플랫폼 원고, 카드뉴스, 사진 및 편집 정보, 생성 조건을 보존합니다.
 */
export function toPlatformDraftSnapshot({
  article,
  drafts,
  cardNews,
  selectedPlatforms,
  includeCardNews,
  selectedKeywords,
  requirements,
}) {
  return {
    schema_version: 1,
    saved_at: new Date().toISOString(),
    include_card_news: Boolean(includeCardNews),
    platforms: Array.isArray(selectedPlatforms) ? selectedPlatforms : ["instagram"],
    selected_keywords: Array.isArray(selectedKeywords) ? selectedKeywords : [],
    requirements: typeof requirements === "string" ? requirements : "",
    // React 전용 상태 보존
    platformDrafts: drafts ? structuredClone(drafts) : {},
    // 기존 독립 편집실과의 호환을 위한 텍스트 구조
    text_drafts: {
      instagram: drafts?.instagram
        ? (typeof drafts.instagram === "string" ? drafts.instagram : drafts.instagram.text || drafts.instagram.content || drafts.instagram.body || "")
        : "",
      threads: drafts?.threads
        ? (typeof drafts.threads === "string" ? drafts.threads : drafts.threads.text || drafts.threads.content || drafts.threads.body || "")
        : "",
    },
    // 카드뉴스 전체 상태 및 카드 목록
    card_news: cardNews ? structuredClone(cardNews) : null,
    cards: Array.isArray(cardNews?.cards) ? structuredClone(cardNews.cards) : [],
    // 원본 기사 및 사진 메타데이터 보존
    source_input: {
      article: article ? structuredClone(article) : {},
      article_display: { subtitle: article?.subtitle || "" },
      selected_keywords: Array.isArray(selectedKeywords) ? selectedKeywords : [],
      requirements: typeof requirements === "string" ? requirements : "",
    },
    article: article ? structuredClone(article) : {},
    validation_status: "not_checked",
  };
}

/**
 * 저장된 snapshot JSON을 React 편집실 상태로 역직렬화합니다.
 * 기존 카드뉴스 전용 초안, 글 전용 초안, 통합 초안을 모두 안전하게 해석합니다.
 */
export function fromPlatformDraftSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("초안 데이터 형식을 확인할 수 없습니다.");
  }

  const selectedPlatforms = Array.isArray(snapshot.platforms)
    ? snapshot.platforms
    : Object.keys(snapshot.platformDrafts || snapshot.text_drafts || { instagram: 1 });

  const includeCardNews = snapshot.include_card_news !== undefined
    ? Boolean(snapshot.include_card_news)
    : Boolean((snapshot.cards && snapshot.cards.length > 0) || snapshot.card_news);

  const selectedKeywords = Array.isArray(snapshot.selected_keywords)
    ? snapshot.selected_keywords
    : (snapshot.source_input?.selected_keywords || []);

  const requirements = typeof snapshot.requirements === "string"
    ? snapshot.requirements
    : (snapshot.source_input?.requirements || "");

  // 1. 플랫폼 원고 복원
  let drafts = {};
  if (snapshot.platformDrafts && typeof snapshot.platformDrafts === "object") {
    drafts = structuredClone(snapshot.platformDrafts);
  } else if (snapshot.text_drafts && typeof snapshot.text_drafts === "object") {
    drafts = Object.fromEntries(
      Object.entries(snapshot.text_drafts).map(([platform, text]) => [
        platform,
        typeof text === "string" ? { text, headline: "", body: text } : text,
      ])
    );
  }

  // 2. 카드뉴스 복원
  let cardNews = null;
  if (snapshot.card_news && typeof snapshot.card_news === "object") {
    cardNews = structuredClone(snapshot.card_news);
  } else if (Array.isArray(snapshot.cards) && snapshot.cards.length > 0) {
    cardNews = {
      schema_version: 1,
      cards: structuredClone(snapshot.cards),
      validation_status: snapshot.validation_status || "not_checked",
    };
  }

  // 3. 기사 원본 및 사진 정보 복원
  const article = snapshot.source_input?.article || snapshot.article || null;

  return {
    drafts,
    cardNews,
    selectedPlatforms,
    includeCardNews,
    selectedKeywords,
    requirements,
    article: article ? structuredClone(article) : null,
  };
}
