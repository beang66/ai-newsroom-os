import React, { lazy, Suspense, useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ArticleWriter from "./components/ArticleWriter";
import { setLoginHandler } from "./api/auth-gate";

const SourceSearch = lazy(() => import("./components/SourceSearch"));
const InterviewStudio = lazy(() => import("./components/interview/InterviewStudio"));
const FormatConverter = lazy(() => import("./components/FormatConverter"));
const ArchiveView = lazy(() => import("./components/ArchiveView"));
const LoginDialog = lazy(() => import("./components/LoginDialog"));
const ModelsDialog = lazy(() => import("./components/ModelsDialog"));

import { createEmptyArticle } from "./data/article";
import { coreSnapshot } from "./api/core";
import { loadLatestArticle } from "./api/editorial";
import { useAutosave } from "./components/EditorialAssist";

// 마지막으로 보던 화면(작성·보관함 등) — 이 PC 화면 설정이라 브라우저 저장소에 둔다(없거나 막혀도 동작)
const TAB_KEY = "ai-newsroom:lastTab";
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || "writer"; } catch { return "writer"; } };
const writeTab = (tab) => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* 저장 못 해도 그만 */ } };
// 로그인 안내 띠를 닫았는지 — 이 PC 화면 설정(닫으면 다시 띄우지 않는다. 로그인은 헤더 버튼으로 언제든)
const HINT_KEY = "ai-newsroom:loginHintDismissed";
const hintDismissed = () => { try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } };
const dismissHint = () => { try { localStorage.setItem(HINT_KEY, "1"); } catch { /* 저장 못 해도 그만 */ } };

/** 앱을 열면 가장 최근에 저장된 원고를 불러와 이어서 작업한다(없으면 새 원고) */
export default function App() {
  const [initial, setInitial] = useState(null);
  const [core, setCore] = useState({ ok: false });
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadLatestArticle(createEmptyArticle())
      .then((a) => alive && setInitial(a || createEmptyArticle()))
      .catch((error) => alive && setLoadError(error?.message || "최근 원고를 불러오지 못했습니다."));
    coreSnapshot()
      .then((snapshot) => alive && setCore(snapshot))
      .catch(() => alive && setCore({ ok: false }));
    return () => { alive = false; };
  }, [loadAttempt]);
  // 원고를 불러오는 동안에도 앱 틀(헤더·사이드바)은 바로 그린다. 불러오면 작업 영역을 한 번 새로 연다(key) —
  // 불러온 원고가 '변경'으로 잡히지 않아 자동 저장이 돌지 않는다.
  return <Workspace key={initial ? "ready" : "loading"} initialArticle={initial} core={core} setCore={setCore}
    loadError={loadError} onRetry={() => { setLoadError(""); setLoadAttempt((attempt) => attempt + 1); }} />;
}

function Workspace({ initialArticle, core, setCore, loadError, onRetry }) {
  const loading = !initialArticle;
  const [activeTab, setActiveTabState] = useState(readTab);
  const setActiveTab = (tab) => { setActiveTabState(tab); writeTab(tab); };
  const [article, setArticle] = useState(() => initialArticle || createEmptyArticle());
  const saveStatus = useAutosave(article, setArticle);

  // 로컬 코어 연결 상태 — 계약(src/api)만 쓴다. 창에서는 IPC, 브라우저에서는 HTTP.
  const [showLogin, setShowLogin] = useState(false);
  const [loginHintHidden, setLoginHintHidden] = useState(hintDismissed);
  const [showModels, setShowModels] = useState(false);
  const loginWait = useRef([]); // 로그인 창 결과를 기다리는 요청들(AUTH_REQUIRED 로 멈춘 것)
  const loggedIn = useRef(false);
  useEffect(() => {
    setLoginHandler(() => new Promise((resolve) => {
      loginWait.current.push(resolve);
      setShowLogin(true);
    }));
    return () => setLoginHandler(null);
  }, []);
  const onSession = (session) => {
    loggedIn.current = Boolean(session?.signedIn);
    setCore((prev) => ({ ...prev, session }));
  };
  const closeLogin = () => {
    setShowLogin(false);
    const ok = loggedIn.current;
    loggedIn.current = false;
    loginWait.current.splice(0).forEach((resolve) => resolve(ok));
  };
  const session = core.session;
  const showLoginHint = !loading && !loginHintHidden && session && !session.signedIn
    && !session.autoLogin?.available && !session.autoLogin?.enabled;

  // Sidebar collapse state (main 디자인: 기본은 세로로 긴 슬림 사이드바 접힘)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Quick Source Search Modal inside Article Writer
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleConnectSource = (source) => {
    const citation = `\n\n[출처 참고: ${source.title} (${source.category})]`;
    setArticle((prev) => ({
      ...prev,
      content: prev.content + citation,
      linkedSources: Array.from(new Set([...prev.linkedSources, source.id]))
    }));
    setShowSearchModal(false);
    alert(`"${source.title}" 자료가 작성 기사의 출처로 연결되었습니다.`);
  };

  const handleReturnFromInterview = (editedTranscript) => {
    if (editedTranscript) {
      const interviewQuote = `\n\n[인터뷰 발췌 녹취: ${editedTranscript.slice(0, 80)}...]`;
      setArticle((prev) => ({ ...prev, content: prev.content + interviewQuote }));
    }
    setActiveTab("writer");
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-[#F4A940] selection:text-white bg-transparent text-[#292929]">
      {/* 1. Top Header */}
      <Header
        currentArticleTitle={article.title}
        status={article.status}
        coreReady={core.ok}
        coreLabel={core.ok ? "코어 연결됨" : "코어 대기"}
        session={core.session}
        onSession={onSession}
        onLogin={() => setShowLogin(true)}
        onModels={() => setShowModels(true)}
        saveStatus={saveStatus}
      />

      {showLoginHint && !core.session?.signedIn && (
        <div role="status" data-testid="login-hint"
          className="mx-3 md:mx-5 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[#E7E4DE] bg-white px-4 py-2 text-xs text-[#666666]">
          <span className="flex-1 min-w-[200px]">로그인하면 AI 추천 같은 서버 기능을 쓸 수 있어요. 글쓰기·저장·팩트체크는 로그인 없이도 됩니다.</span>
          <button type="button" onClick={() => setShowLogin(true)}
            className="px-3 py-1 font-bold text-white bg-[#292929] rounded-full cursor-pointer hover:bg-black">로그인</button>
          <button type="button" onClick={() => { dismissHint(); setLoginHintHidden(true); }}
            className="px-2 py-1 font-bold text-[#666666] hover:text-[#292929] cursor-pointer">다시 보지 않기</button>
        </div>
      )}

      {/* 2. Main Workspace Layout: Floating Slim Sidebar & Warm Minimal Workspace */}
      <div className="flex flex-1 w-full relative min-h-[calc(100vh-70px)] pl-3 md:pl-5 pr-3 md:pr-6 py-2 gap-4 md:gap-5 items-start">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          session={core.session}
          onModels={() => setShowModels(true)}
        />

        {/* Main Content Workspace */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 z-20 relative mr-0">
          <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">화면을 불러오는 중…</div>}>
          <main className={`flex-1 min-w-0 transition-all ${
            activeTab === "writer" || activeTab === "publish"
              ? ""
              : "main-warm-container py-6 px-4 md:px-8"
          }`}>
            {loading && loadError && (
              <div role="alert" className="py-24 text-center text-sm text-red-700">
                <p>{loadError}</p>
                <button type="button" onClick={onRetry} className="mt-4 rounded-full border px-4 py-2 cursor-pointer">다시 불러오기</button>
              </div>
            )}
            {loading && !loadError && (
              <div data-testid="workspace-loading" className="py-24 text-center text-sm text-slate-500">최근 작업을 불러오는 중…</div>
            )}
            {!loading && (activeTab === "writer" || activeTab === "publish") && (
              <ArticleWriter
                article={article}
                setArticle={setArticle}
                onOpenSearch={() => setShowSearchModal(true)}
                saveStatus={saveStatus}
                onModels={() => setShowModels(true)}
              />
            )}

            {!loading && activeTab === "search" && (
              <SourceSearch onConnectToArticle={handleConnectSource} />
            )}

            {!loading && activeTab === "interview" && (
              <InterviewStudio onReturnToArticle={handleReturnFromInterview} />
            )}

            {!loading && activeTab === "convert" && (
              <FormatConverter article={article} setArticle={setArticle} />
            )}

            {!loading && activeTab === "archive" && (
              <ArchiveView article={article} />
            )}
          </main>
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        {showLogin && <LoginDialog onClose={closeLogin} onSession={onSession} />}
        {showModels && <ModelsDialog onClose={() => setShowModels(false)} />}

      {/* Quick Source Search Modal during Writing */}
      {showSearchModal && (
        <SourceSearch
          isModal={true}
          onClose={() => setShowSearchModal(false)}
          onConnectToArticle={handleConnectSource}
        />
      )}
      </Suspense>
    </div>
  );
}
