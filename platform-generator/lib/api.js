// 서버 요청 주소와 로컬 저장 설정의 단일 관리 파일입니다.
// 브라우저: window.NewsApi / Node 서버: module.exports
(() => {
  const PATHS = Object.freeze({
    drafts: "/api/local/drafts",
    images: "/api/local/images",
    storageInfo: "/api/local/storage",
    generate: "/api/generate/",
    render: "/editor/render",
  });

  const SNS_ENDPOINTS=Object.freeze({instagram:'https://www.instagram.com/',threads:'https://www.threads.com/'});

  // 실제 사용자 폴더는 서버에서만 확인하며 브라우저에는 Node 모듈을 노출하지 않습니다.
  if (typeof module !== "undefined" && module.exports) {
    const path = require("path");
    const os = require("os");
    const { execFileSync } = require("child_process");
    function getStorageRoot() {
      if (process.platform === "win32") {
        // OneDrive로 이동된 '내 문서'도 Windows가 알려주는 실제 위치를 사용합니다.
        const documents = execFileSync("powershell.exe", [
          "-NoProfile", "-NonInteractive", "-Command",
          "[Environment]::GetFolderPath('MyDocuments')",
        ], { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
        if (!documents) throw new Error("Windows 내 문서 경로를 찾지 못했습니다.");
        return path.join(documents, "AI-Newsroom");
      }
      return path.join(os.homedir(), "Documents", "AI-Newsroom");
    }
    // 팀 프론트 개발 서버를 프록시로 연결할 때 허용할 Origin을 명시합니다.
    function getEditorOrigins(){
      const value=(process.env.NEWSROOM_EDITOR_ORIGIN||'').trim();if(!value)return [];
      const url=new URL(value);
      if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('NEWSROOM_EDITOR_ORIGIN은 로컬 프론트 서버의 Origin으로 설정해주세요.');
      return [url.origin];
    }
    // 파일 저장 경로를 변경할 때도 이 설정만 수정합니다.
    const STORAGE_FOLDERS = Object.freeze({ drafts: "drafts", images: "images", renderOutput: "output" });
    const AI_ENDPOINTS = Object.freeze({ gemini: 'https://generativelanguage.googleapis.com/v1beta/models/' });
    module.exports = { PATHS, STORAGE_FOLDERS, getStorageRoot, AI_ENDPOINTS, SNS_ENDPOINTS, getEditorOrigins };
    return;
  }

  // 서버 요청 및 JSON 응답 처리
  async function requestJson(
    url,
    options,
    { jsonError, errorMessage = "요청 실패", checkSuccess = false } = {},
  ) {
    const response = await fetch(url, options);

    let result;

    try {
      result = await response.json();
    } catch (error) {
      if (jsonError) {
        throw new Error(jsonError);
      }

      throw error;
    }

    if (!response.ok || (checkSuccess && !result.success)) {
      throw Object.assign(new Error(result.error || errorMessage), { status: response.status });
    }

    return result;
  }

  function postJson(payload) {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    };
  }

  const editorErrors = {
    jsonError:
      "서버 연결을 확인해주세요. editor-routes.js를 연결한 뒤 서버를 다시 실행해야 합니다.",
    errorMessage: "요청 실패",
  };

  async function generateDraft(
    platform,
    payload,
    {
      jsonError = "서버 응답을 읽지 못했습니다. 서버 실행을 확인해주세요.",
      errorMessage = "원고 생성에 실패했습니다.",
    } = {},
  ) {
    return requestJson(PATHS.generate + encodeURIComponent(platform), postJson(payload), {
      jsonError,
      errorMessage,
      checkSuccess: true,
    });
  }

  // 사진 바이너리 응답도 이 파일에서만 요청합니다.
  async function requestPhotoBlob(url, signal) {
    const response = await fetch(url, {signal});
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "사진을 가져오지 못했습니다.");
    }
    if (!/^image\/(jpeg|png|webp)(;|$)/.test(response.headers.get("content-type") || "")) {
      throw new Error("서버가 지원하는 이미지 형식으로 응답하지 않았습니다.");
    }
    return response.blob();
  }

  window.NewsApi = {
    // 전체 편집 상태를 하나의 초안으로 저장합니다. 사진 원본·편집 정보도 포함합니다.
    saveLocalDraft(draft) {
      return requestJson(PATHS.drafts, postJson({ draft }), { checkSuccess: true });
    },
    listLocalDrafts() {
      return requestJson(PATHS.drafts, undefined, { checkSuccess: true });
    },
    loadLocalDraft(id) {
      return requestJson(PATHS.drafts + "/" + encodeURIComponent(id), undefined, { checkSuccess: true });
    },
    getLocalStorageInfo() {
      return requestJson(PATHS.storageInfo, undefined, { checkSuccess: true });
    },
    // 팀원 사진 컴포넌트와 같은 검색·페이지·원본·추적 형식을 사용합니다.
    suggestPhotoKeywords(body, signal, card) {
      return requestJson("/api/photo/keywords", {...postJson(card === undefined ? {body} : {card}), signal}, {
        errorMessage: "사진 검색어 추천에 실패했습니다.",
      });
    },
    searchTeamPhotos(query, page = 1, signal, perPage = 3) {
      return requestJson("/api/unsplash/search?" + new URLSearchParams({q: query, page, per_page: perPage}), {signal}, {
        errorMessage: "사진 검색에 실패했습니다.",
      });
    },
    getTeamPhotoBlob(id, signal) {
      return requestPhotoBlob("/api/unsplash/photo/" + encodeURIComponent(id), signal);
    },
    trackTeamPhoto(id, signal) {
      return requestJson("/api/unsplash/photo/" + encodeURIComponent(id) + "/track", {signal});
    },

    // 기사 URL의 HTML에서 제목·본문 추출 (AI를 호출하지 않습니다.)
    importArticle(url) {
      return requestJson("/api/article/import", postJson({ url }), {
        jsonError: "기사 수집 서버 응답을 읽지 못했습니다. 서버를 재시작해주세요.",
        errorMessage: "기사 URL을 불러오지 못했습니다.",
        checkSuccess: true,
      });
    },

    // 기사 키워드 추천
    suggestKeywords(article) {
      return requestJson("/api/article/keywords", postJson({ article }), {
        errorMessage: "키워드 생성에 실패했습니다.",
        checkSuccess: true,
      });
    },

    // 독립 카드뉴스 생성: 플랫폼 체크 여부와 관계없이 호출합니다.
    generateCardNews(payload) {
      const {card_news_options,...input}=payload;
      return generateDraft("card_news", input, {
        jsonError:
          "서버 응답을 읽지 못했습니다. generate-routes 연결을 확인해주세요.",
        errorMessage: "카드뉴스 생성에 실패했습니다.",
      });
    },

    // Instagram 게시글 생성: 카드 생성은 generateCardNews를 사용합니다.
    generateInstagramDraft(payload) {
      return generateDraft("instagram", payload, {
        jsonError:
          "서버 응답을 읽지 못했습니다. 서버 실행과 generate-routes 연결을 확인해주세요.",
        errorMessage: "Instagram 원고 생성에 실패했습니다.",
      });
    },

    // 플랫폼별 생성 및 전체 선택 생성
    generateDraft,

    // 검수 시점에 고정한 JSON 문자열을 그대로 전송
    validateDraft(snapshot) {
      return requestJson(
        "/api/validate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: snapshot,
        },
        {
          jsonError:
            "검수 서버가 JSON을 반환하지 않았습니다. validation-routes 연결을 확인해주세요.",
          errorMessage: "검수에 실패했습니다.",
          checkSuccess: true,
        },
      );
    },

    // 현재 편집 카드 이미지 생성
    renderCard(card) {
      // 원본·편집 이력은 로컬 초안에만 보관하고 JPG 요청에는 현재 표시 이미지만 전달합니다.
      const normalized=window.CardModel.normalize(card);
      const error=window.CardModel.layoutError(normalized);
      if(error)throw new Error(error);
      const rendered = { ...normalized, image: card.image ? { ...card.image, photo_edit: undefined } : undefined };
      return requestJson(PATHS.render, postJson({ card: rendered }), editorErrors);
    },

  };
})();

// 최신 카드 JPG 묶음: Instagram·Threads Playwright가 공통으로 사용합니다.
(() => {
  if(typeof window==='undefined'||!window.NewsApi)return;
  const IMAGE_PATHS=['/api/local/images/','/output/'];
  function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('이미지 파일을 읽지 못했습니다.'));reader.readAsDataURL(blob);});}
  // 1. 최신 편집 카드 렌더링 결과를 같은 로컬 서버에서만 읽습니다.
  window.NewsApi.renderPublishCards = async (cards,onProgress=()=>{}) => {
    if(!Array.isArray(cards) || !cards.length || cards.length>10)throw new Error('생성한 카드뉴스 1~10장이 필요합니다.');
    const assets=[];
    for(const [index,card] of cards.entries()){
      onProgress(index+1,cards.length);
      const result=await window.NewsApi.renderCard({...card,page:index+1,total_pages:cards.length,
        role:index===0?'cover':index===cards.length-1?'closing':'body'});
      if(!result.success)throw new Error(result.error || '카드 이미지 생성 실패');
      const url=new URL(result.image_url,location.origin);
      if(url.origin!==location.origin || !IMAGE_PATHS.some(p=>url.pathname.startsWith(p)) || !/^[A-Za-z0-9_-]+\.jpg$/.test(url.pathname.split('/').pop()))throw new Error('카드 이미지 경로를 확인해주세요.');
      const response=await fetch(url.href,{signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('생성한 카드 이미지를 읽지 못했습니다.');
      const blob=await response.blob();
      if(blob.type!=='image/jpeg' || blob.size>5*1024*1024)throw new Error('카드 JPG 형식 또는 용량을 확인해주세요.');
      assets.push({name:`card_${String(index+1).padStart(2,'0')}.jpg`,mime:blob.type,order:index+1,data_url:await blobDataUrl(blob)});
    }
    return assets;
  };
})();

// AI_NEWSROOM_INSTAGRAM_LOCAL_V1
// Instagram 연결 요청 경로는 기존 api.js 안에서만 관리합니다.
(() => {
  if (typeof window === "undefined" || !window.NewsApi) return;
  const root = '/api/instagram-local';
  async function request(path, body) {
    let response;
    try {
      response = await fetch(root + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(180000)
      });
    } catch { throw new Error('서버 연결 또는 작업 결과를 확인하지 못했습니다. 공유를 시도했다면 Instagram에서 먼저 확인해주세요.'); }
    let result;
    try { result = await response.json(); }
    catch { throw new Error('Instagram 로컬 경로를 확인해주세요. 설치 후 Node 서버를 다시 실행해야 합니다.'); }
    if (!response.ok || !result.success) throw new Error(result.error || 'Instagram 작업 실패');
    return result;
  }
  Object.assign(window.NewsApi, {
    instagramLocalConnect: () => request('/connect', {}),
    instagramLocalStatus: () => request('/status'),
    instagramLocalPrepare: payload => request('/prepare', payload),
    instagramLocalPublish: (id, reviewed) => request('/publish', { id, reviewed }),
    instagramLocalClose: () => request('/close', {})
  });
})();

// Threads 전용 브라우저 연결: 모든 프론트 요청은 api.js로 모읍니다.
(() => {
 if(typeof window==='undefined'||!window.NewsApi)return;
 const root='/api/threads-local';
 async function request(path,body){
  let response;
  try {response=await fetch(root+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});}
  catch {throw new Error('Threads 작업 결과를 확인하지 못했습니다. 게시를 요청했다면 전용 창에서 먼저 확인해주세요.');}
  const result=await response.json().catch(()=>{throw new Error('Threads 로컬 서버 응답을 확인해주세요.');});
  if(!response.ok||!result.success)throw new Error(result.error||'Threads 작업 실패');return result;
 }
 Object.assign(window.NewsApi,{threadsLocalConnect:()=>request('/connect',{}),threadsLocalStatus:()=>request('/status'),threadsLocalPrepare:payload=>request('/prepare',payload),threadsLocalPublish:(id,reviewed)=>request('/publish',{id,reviewed}),threadsLocalClose:()=>request('/close',{})});
})();
