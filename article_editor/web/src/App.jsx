import React, { useState, useEffect, useRef } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ArticleWriter from "./components/ArticleWriter";
import SourceSearch from "./components/SourceSearch";
import InterviewStudio from "./components/interview/InterviewStudio";
import FormatConverter from "./components/FormatConverter";
import ArchiveView from "./components/ArchiveView";
import LoginDialog from "./components/LoginDialog";
import { setLoginHandler } from "./api/auth-gate";
import ModelsDialog from "./components/ModelsDialog";

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

/**
 * 전체 배경 Soft Ambient Gradient Theme:
 * - 상단: 아주 은은한 Soft Blue glow (rgba(190, 220, 255, 0.25))
 * - 중앙: 거의 흰색에 가까운 매우 부드러운 transition
 * - 하단: 아주 은은한 Soft Lavender glow (rgba(215, 200, 255, 0.22))
 * - 두 색상이 경계 없이 화면 전체에 공기처럼 넓게 퍼지며 어우러짐
 */
const getAmbientGradient = (activeTab) => {
  const editorialSoftGradient = [
    "radial-gradient(ellipse 95% 55% at 50% -5%, rgba(190, 220, 255, 0.25) 0%, rgba(255, 255, 255, 0) 75%)",
    "radial-gradient(ellipse 95% 55% at 50% 105%, rgba(215, 200, 255, 0.22) 0%, rgba(255, 255, 255, 0) 75%)",
    "#FAFAFA"
  ].join(", ");

  if (activeTab === "factcheck") {
    return [
      "radial-gradient(ellipse 95% 50% at 50% -5%, rgba(190, 220, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "radial-gradient(ellipse 85% 65% at 15% 82%, rgba(190, 235, 215, 0.22) 0%, rgba(255, 255, 255, 0) 72%)",
      "radial-gradient(ellipse 95% 50% at 50% 105%, rgba(215, 200, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "#FAFAFA"
    ].join(", ");
  }

  if (activeTab === "interview") {
    return [
      "radial-gradient(ellipse 85% 55% at 20% 10%, rgba(190, 220, 255, 0.26) 0%, rgba(255, 255, 255, 0) 70%)",
      "radial-gradient(ellipse 85% 50% at 50% 105%, rgba(215, 200, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "#FAFAFA"
    ].join(", ");
  }

  if (activeTab === "archive") {
    return [
      "radial-gradient(ellipse 95% 50% at 50% -5%, rgba(190, 220, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "radial-gradient(ellipse 85% 55% at 85% 85%, rgba(250, 225, 200, 0.20) 0%, rgba(255, 255, 255, 0) 72%)",
      "#FAFAFA"
    ].join(", ");
  }

  return editorialSoftGradient;
};

/** 앱을 열면 가장 최근에 저장된 원고를 불러와 이어서 작업한다(없으면 새 원고) */
export default function App() {
  const [initial, setInitial] = useState(null);
  useEffect(() => {
    loadLatestArticle(createEmptyArticle())
      .then((a) => setInitial(a || createEmptyArticle()))
      // TODO(debt: DEBT-007): 조회 실패도 저장 원고 없음으로 취급해 빈 원고를 보여 준다.
      // 저장소/키 오류와 실제 빈 저장소를 구분하고 오류·재시도 UI를 제공할 것.
      .catch(() => setInitial(createEmptyArticle()));
  }, []);
  // 원고를 불러오는 동안에도 앱 틀(헤더·사이드바)은 바로 그린다. 불러오면 작업 영역을 한 번 새로 연다(key) —
  // 불러온 원고가 '변경'으로 잡히지 않아 자동 저장이 돌지 않는다.
  return <Workspace key={initial ? "ready" : "loading"} initialArticle={initial} />;
}

function Workspace({ initialArticle }) {
  const loading = !initialArticle;
  const [activeTab, setActiveTabState] = useState(readTab);
  const setActiveTab = (tab) => { setActiveTabState(tab); writeTab(tab); };
  const [article, setArticle] = useState(() => initialArticle || createEmptyArticle());
  const saveStatus = useAutosave(article, setArticle);

  // 로컬 코어 연결 상태 — 계약(src/api)만 쓴다. 창에서는 IPC, 브라우저에서는 HTTP.
  const [core, setCore] = useState({ ok: false });
  const [showLogin, setShowLogin] = useState(false);
  const [showLoginHint, setShowLoginHint] = useState(false);
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
  useEffect(() => {
    if (loading) return; // 원고를 불러온 뒤 한 번만(작업 영역을 새로 열 때 다시 묻지 않게)
    let alive = true;
    coreSnapshot().then((snapshot) => {
      if (alive) {
        setCore(snapshot);
        const session = snapshot.session;
        // 시작할 때 로그인 창으로 가로막지 않는다 — 작업을 막지 않는 안내 띠만(포커스를 빼앗지 않음)
        if (session && !session.signedIn && !session.autoLogin?.available && !session.autoLogin?.enabled && !hintDismissed()) {
          setShowLoginHint(true);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [loading]);

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
    <div className="min-h-screen flex flex-col font-sans selection:bg-[#F4A940] selection:text-white bg-transparent text-[#292929] relative overflow-x-hidden">
      {/* ──────────────────────────────────────────────────────────
          Soft Ambient Gradient Background Layer (콘텐츠 뒤 고정 앰비언트 레이어)
         ────────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 pointer-events-none -z-10 transition-all duration-700 ease-out"
        style={{
          background: getAmbientGradient(activeTab),
        }}
      />

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
          <button type="button" onClick={() => { dismissHint(); setShowLoginHint(false); }}
            className="px-2 py-1 font-bold text-[#666666] hover:text-[#292929] cursor-pointer">다시 보지 않기</button>
        </div>
      )}

      {/* 2. Main Workspace Layout: Floating Slim Sidebar & Warm Minimal Workspace */}
      <div className="flex flex-1 w-full relative min-h-[calc(100vh-70px)] pl-6 md:pl-8 pr-5 md:pr-7 py-2.5 gap-4 md:gap-6 items-start">
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
          <main className={`flex-1 min-w-0 transition-all ${
            activeTab === "writer" || activeTab === "publish"
              ? ""
              : "main-warm-container py-6 px-4 md:px-8"
          }`}>
            {loading && (
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
        </div>
      </div>

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
    </div>
  );
}
