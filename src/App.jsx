import React, { lazy, Suspense, useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ArticleWriter from "./components/ArticleWriter";
import { setLoginHandler } from "./api/auth-gate";

const SourceSearch = lazy(() => import("./components/SourceSearch"));
const InterviewStudio = lazy(() => import("./components/interview/InterviewStudio"));
const FormatConverter = lazy(() => import("./components/FormatConverter"));
const ArchiveView = lazy(() => import("./components/ArchiveView"));
const DeskView = lazy(() => import("./components/DeskView"));
const DataMapView = lazy(() => import("./features/data-map/DataMapView"));
const LoginDialog = lazy(() => import("./components/LoginDialog"));
const ModelsDialog = lazy(() => import("./components/ModelsDialog"));
const SettingsDialog = lazy(() => import("./components/SettingsDialog"));

import { createEmptyArticle } from "./data/article";
import { core, coreSnapshot } from "./api/core";
import { loadLatestArticle, loadStoredArticle } from "./api/editorial";
import { publishCms } from "./api/editorial";
import { useAutosave } from "./components/EditorialAssist";
import { isRestoring } from "./restoreState";
import PageHeader from "./components/PageHeader";
import { destinations } from "./data/navigation";
import "./workspace.css";

// 마지막으로 보던 화면(작성·보관함 등) — 이 PC 화면 설정이라 브라우저 저장소에 둔다(없거나 막혀도 동작)
const TAB_KEY = "ai-newsroom:lastTab";
const readTab = () => { try { const tab = localStorage.getItem(TAB_KEY); return destinations.some((item) => item.id === tab) ? tab : "desk"; } catch { return "desk"; } };
const writeTab = (tab) => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* 저장 못 해도 그만 */ } };

/** 앱을 열면 가장 최근에 저장된 원고를 불러와 이어서 작업한다(없으면 새 원고) */
export default function App() {
  const [initial, setInitial] = useState(null);
  const [core, setCore] = useState({ ok: false });
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
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
  return <Workspace key={initial ? `ready-${workspaceVersion}` : "loading"} initialArticle={initial} core={core} setCore={setCore}
    onReplaceArticle={(next) => { writeTab("writer"); setInitial(next); setWorkspaceVersion((version) => version + 1); }}
    loadError={loadError} onRetry={() => { setLoadError(""); setLoadAttempt((attempt) => attempt + 1); }} />;
}

function Workspace({ initialArticle, core: coreState, setCore, loadError, onRetry, onReplaceArticle }) {
  const loading = !initialArticle;
  const [activeTab, setActiveTabState] = useState(readTab);
  const [interviewVisited, setInterviewVisited] = useState(activeTab === "interview");
  const setActiveTab = (tab) => { if (tab === "interview") setInterviewVisited(true); if (tab === "map") setMapArticleId(null); setActiveTabState(tab); writeTab(tab); };
  const [article, setArticle] = useState(() => initialArticle || createEmptyArticle());
  const [mapArticleId, setMapArticleId] = useState(null);
  const { status: saveStatus, flush, dirty } = useAutosave(article, setArticle);
  const [storedArticles, setStoredArticles] = useState([]);
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  useEffect(() => {
    if (loading) return;
    const controller = new AbortController();
    core.listArticles(controller.signal).then(({ articles }) => {
      setStoredArticles(articles.map((item) => ({ ...item, id: item.id.replaceAll("-", "") })));
      setListError("");
    }).catch((error) => { if (!controller.signal.aborted) setListError(error.message); });
    return () => controller.abort();
  }, [loading, activeTab, saveStatus, listAttempt]);
  const currentId = article.articleId || article.id;
  const storedCurrent = storedArticles.find((item) => item.id === currentId);
  const currentSummary = { ...storedCurrent, id: currentId,
    title: article.title, subtitle: article.subtitle, status: article.status,
    updated_at: storedCurrent?.updated_at || article.updatedAt };
  const articles = storedCurrent ? storedArticles.map((item) => item.id === currentId ? currentSummary : item) : [currentSummary, ...storedArticles];
  const changeArticle = async (id = null) => {
    if (switching) return;
    if (id === currentId) { setActiveTab("writer"); return; }
    setSwitching(true);
    setSwitchError("");
    try {
      if (article.articleId || article.title || article.content || article.sources.length || article.photos.length
        || article.linkedSources.length || article.linkedInterviews.length || article.cardNews || Object.keys(article.platformDrafts).length) await flush();
      const next = id ? await loadStoredArticle(id, createEmptyArticle()) : createEmptyArticle();
      onReplaceArticle(next);
    } catch (error) {
      setSwitchError(`원고를 전환하지 못했습니다. 현재 원고는 유지됩니다. ${error.message}`);
    } finally { setSwitching(false); }
  };
  const publishArticle = async () => {
    const articleId = await flush();
    return publishCms({ ...article, articleId });
  };
  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event) => {
      if (isRestoring()) return;
      void flush();
      event.preventDefault();
      event.returnValue = "";
    };
    const saveWhenHidden = () => { if (document.visibilityState === "hidden" && !isRestoring()) void flush(); };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [dirty, flush]);

  // 로컬 코어 연결 상태 — 계약(src/api)만 쓴다. 창에서는 IPC, 브라우저에서는 HTTP.
  const [showLogin, setShowLogin] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
    // 로그아웃하면 화면에 남은 이전 계정의 기사·자료를 비운다(다시 열면 로그인부터 한다)
    if (coreState.session?.signedIn && !session?.signedIn) { window.location.reload(); return; }
    setCore((prev) => ({ ...prev, session }));
  };
  const closeLogin = () => {
    setShowLogin(false);
    const ok = loggedIn.current;
    loggedIn.current = false;
    loginWait.current.splice(0).forEach((resolve) => resolve(ok));
  };
  const session = coreState.session;
  // 개발 자동 로그인처럼 로그인이 다른 경로로 끝나면 열려 있던 로그인 창을 닫고 기다리던 요청을 이어 간다
  useEffect(() => {
    if (session?.signedIn && showLogin) { loggedIn.current = true; closeLogin(); }
  }, [session?.signedIn, showLogin]);
  // 로그인하지 않았으면 자료를 볼 수 없으므로 로그인 창을 연다(코어가 자료 요청을 거절하기 전에도)
  useEffect(() => {
    if (session && !session.signedIn) setShowLogin(true);
  }, [session?.signedIn, Boolean(session)]);

  // Sidebar collapse state (main 디자인: 기본은 세로로 긴 슬림 사이드바 접힘)

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

  const handleReturnFromInterview = (editedTranscript, interview) => {
    if (editedTranscript) {
      const interviewQuote = `\n\n[인터뷰 발췌]\n${editedTranscript}`;
      setArticle((prev) => ({ ...prev, content: prev.content + interviewQuote,
        linkedInterviews: interview ? [...(prev.linkedInterviews || []), interview] : prev.linkedInterviews }));
    }
    setActiveTab("writer");
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-[#F4A940] selection:text-white bg-transparent text-[#292929]">
      {/* 1. Top Header */}
      <Header
        currentArticleTitle={article.title}
        status={article.status}
        coreReady={coreState.ok}
        coreLabel={coreState.ok ? "코어 연결됨" : "코어 대기"}
        session={coreState.session}
        onSession={onSession}
        onLogin={() => setShowLogin(true)}
        beforeLogout={() => (dirty ? flush() : Promise.resolve())}
        onModels={() => setShowModels(true)}
        saveStatus={saveStatus}
        onHome={() => setActiveTab("desk")}
        onSearch={() => setActiveTab("archive")}
      />


      {/* 2. Main Workspace Layout: Floating Slim Sidebar & Warm Minimal Workspace */}
      {switchError && <p role="alert" className="workspace-global-error">{switchError}</p>}
      {switching && <p role="status" className="px-6 py-2">현재 원고를 저장하고 작업을 전환합니다…</p>}
      <div className="workspace-layout" inert={switching || undefined}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          session={coreState.session}
          onSettings={() => setShowSettings(true)}
        />

        {/* Main Content Workspace */}
        <div className="workspace-content">
          <Suspense fallback={<div className="py-24 text-center text-sm text-slate-500">화면을 불러오는 중…</div>}>
          <main>
            <PageHeader page={activeTab} actions={['desk', 'archive'].includes(activeTab) &&
              <button type="button" className="workspace-primary" disabled={loading || switching} onClick={() => changeArticle()}>+ 새 기사</button>} />
            {listError && ['desk', 'archive'].includes(activeTab) && <div role="alert" className="workspace-global-error">저장된 기사 목록을 불러오지 못했습니다. {listError} <button type="button" onClick={() => setListAttempt((attempt) => attempt + 1)}>다시 시도</button></div>}
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
                onPublish={publishArticle}
              />
            )}

            {!loading && activeTab === "desk" && <DeskView article={article} articles={articles} onNavigate={setActiveTab} onOpen={changeArticle} busy={switching} />}
            {!loading && activeTab === "map" && <DataMapView articleId={mapArticleId || article.articleId} />}

            {!loading && activeTab === "search" && (
              <SourceSearch onConnectToArticle={handleConnectSource} connectedSourceIds={article.linkedSources} />
            )}

            {!loading && interviewVisited && (
              <div hidden={activeTab !== "interview"}><InterviewStudio active={activeTab === "interview"} onReturnToArticle={handleReturnFromInterview} /></div>
            )}

            {!loading && activeTab === "convert" && (
              <FormatConverter article={article} setArticle={setArticle} />
            )}

            {!loading && activeTab === "archive" && (
              <ArchiveView article={article} articles={articles} onOpen={changeArticle}
                onMap={(id) => { setActiveTab("map"); setMapArticleId(id === article.id ? null : id); }} busy={switching} />
            )}
          </main>
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        {showLogin && <LoginDialog onClose={closeLogin} onSession={onSession} required={!session?.signedIn} />}
        {showModels && <ModelsDialog onClose={() => setShowModels(false)} />}
        {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} onBeforeRestore={() => (dirty ? flush() : Promise.resolve())} />}

      {/* Quick Source Search Modal during Writing */}
      {showSearchModal && (
        <SourceSearch
          isModal={true}
          onClose={() => setShowSearchModal(false)}
          onConnectToArticle={handleConnectSource}
          connectedSourceIds={article.linkedSources}
        />
      )}
      </Suspense>
    </div>
  );
}
